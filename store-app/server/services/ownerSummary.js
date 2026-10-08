const { supabaseAdmin: db } = require('../db/supabase');
const { loadSettledMoney, roundMoney } = require('../utils/settledMoney');
const { reportRange } = require('../utils/reportDates');
const { fetchAllRows } = require('../utils/fetchAllRows');
const emailService = require('./emailService');
const { claimCronRun, PG_UNIQUE_VIOLATION } = require('../utils/cronLock');
const logger = require('../utils/logger');

let cron;
try { cron = require('node-cron'); } catch { cron = null; }

/**
 * The owner's end-of-day summary (migration 095): sales and refunds, till
 * closes, tills left open, low stock and pending work, for the whole
 * business. Emailed at 20:00 Accra to each person who switched it on, one
 * email each; also shown in the app as a preview.
 *
 * Money uses the reports' rule (completed and void_pending are revenue,
 * refunds subtract) via loadSettledMoney, so the email agrees with the
 * dashboard. The pending counts use the dashboard work queues' filters.
 */
const APP_URL = (process.env.APP_URL || 'https://app.quaderp.app').replace(/\/+$/, '');
const LOW_STOCK_SHOWN = 5;
const DEFAULT_THRESHOLD = 5; // product_inventory.low_stock_threshold's column default

const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const count = async (query) => { const { count: n, error } = await query; if (error) throw error; return n || 0; };
const head = (table) => db.from(table).select('id', { count: 'exact', head: true });

/**
 * @param {string} businessId
 * @param {string} date YYYY-MM-DD (Accra is UTC+0)
 */
async function buildSummary(businessId, date) {
  const owner = { business_id: businessId, role: 'Business Admin', location_ids: [] };
  const range = reportRange(date, date);
  const [{ data: business, error: businessError }, { data: locations, error: locationError }] = await Promise.all([
    db.from('businesses').select('name,currency').eq('id', businessId).single(),
    db.from('locations').select('id,name').eq('business_id', businessId),
  ]);
  if (businessError) throw businessError;
  if (locationError) throw locationError;
  const branch = (id) => locations.find((l) => l.id === id)?.name || 'Branch';

  const { sales, refunds } = await loadSettledMoney(db, owner, range, { locationId: null });
  const byBranch = new Map();
  for (const s of sales) {
    const b = byBranch.get(s.location_id) || { name: branch(s.location_id), sales: 0, count: 0, refunds: 0 };
    b.sales += Number(s.total_amount || 0); b.count += 1; byBranch.set(s.location_id, b);
  }
  for (const r of refunds) {
    const b = byBranch.get(r.location_id) || { name: branch(r.location_id), sales: 0, count: 0, refunds: 0 };
    b.refunds += Number(r.total_refund_amount || 0); byBranch.set(r.location_id, b);
  }
  const grossSales = roundMoney(sales.reduce((n, s) => n + Number(s.total_amount || 0), 0));
  const refundTotal = roundMoney(refunds.reduce((n, r) => n + Number(r.total_refund_amount || 0), 0));

  const [closedTills, openTills, stockRows, pending] = await Promise.all([
    db.from('till_sessions').select('location_id,register_name,expected_cash,counted_cash,variance,status')
      .eq('business_id', businessId).gte('closed_at', range.from).lt('closed_at', range.until).order('closed_at'),
    db.from('till_sessions').select('location_id,register_name,opened_at').eq('business_id', businessId).eq('status', 'open'),
    fetchAllRows(() => db.from('product_inventory').select('quantity,low_stock_threshold,location_id,product:products!inner(name,business_id)')
      .eq('products.business_id', businessId).order('product_id')),
    Promise.all([
      count(head('till_sessions').eq('business_id', businessId).eq('status', 'closed')),
      count(head('return_inspections').eq('business_id', businessId).eq('status', 'awaiting_inspection')),
      count(head('loss_cases').eq('business_id', businessId).neq('status', 'resolved')),
      count(head('purchase_orders').eq('business_id', businessId).in('status', ['sent', 'partial'])),
      count(head('ap_bills').eq('business_id', businessId).not('status', 'in', '(paid,void)').lte('due_date', date)),
    ]),
  ]);
  for (const r of [closedTills, openTills]) if (r.error) throw r.error;
  const low = stockRows
    .filter((row) => Number(row.quantity || 0) <= Number(row.low_stock_threshold ?? DEFAULT_THRESHOLD))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity));

  return {
    business: { name: business.name, currency: business.currency || 'GHS' },
    date,
    sales: { count: sales.length, gross: grossSales, refunds: refundTotal, refundCount: refunds.length, net: roundMoney(grossSales - refundTotal) },
    branches: [...byBranch.values()].map((b) => ({ ...b, sales: roundMoney(b.sales), refunds: roundMoney(b.refunds) })),
    tills: (closedTills.data || []).map((t) => ({ branch: branch(t.location_id), register: t.register_name, expected: Number(t.expected_cash), counted: Number(t.counted_cash), variance: Number(t.variance), reviewed: t.status === 'reviewed' })),
    openTills: (openTills.data || []).map((t) => ({ branch: branch(t.location_id), register: t.register_name })),
    lowStock: { count: low.length, items: low.slice(0, LOW_STOCK_SHOWN).map((row) => ({ name: row.product?.name || 'Item', branch: branch(row.location_id), quantity: Number(row.quantity) })) },
    pending: { tillReviews: pending[0], returnInspections: pending[1], investigations: pending[2], deliveries: pending[3], billsDue: pending[4] },
  };
}

/** @returns {{ subject: string, html: string }} */
function renderSummaryEmail(summary) {
  const money = (n) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: summary.business.currency }).format(Number(n || 0));
  const day = new Date(`${summary.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const p = summary.pending;
  const pendingLines = [
    [p.tillReviews, 'till handover waiting for review', 'till handovers waiting for review'],
    [p.returnInspections, 'returned item to inspect', 'returned items to inspect'],
    [p.investigations, 'open investigation', 'open investigations'],
    [p.deliveries, 'delivery expected from suppliers', 'deliveries expected from suppliers'],
    [p.billsDue, 'supplier bill due', 'supplier bills due'],
  ].filter(([n]) => n > 0).map(([n, one, many]) => `<li>${n} ${n === 1 ? one : many}</li>`);
  const row = (label, value) => `<tr><td style="padding:4px 12px 4px 0;color:#475569">${escape(label)}</td><td style="padding:4px 0;text-align:right">${value}</td></tr>`;
  const section = (title, body) => `<h2 style="font-size:16px;margin:24px 0 8px">${escape(title)}</h2>${body}`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a">
<h1 style="font-size:20px;margin:0">${escape(summary.business.name)}</h1>
<p style="color:#475569;margin:4px 0 0">End of day · ${escape(day)}</p>
${section('Sales', `<table>${row('Sales', `${summary.sales.count} · ${money(summary.sales.gross)}`)}${summary.sales.refundCount ? row('Refunds', `${summary.sales.refundCount} · −${money(summary.sales.refunds)}`) : ''}${row('Net', `<strong>${money(summary.sales.net)}</strong>`)}</table>${summary.branches.length > 1 ? `<table>${summary.branches.map((b) => row(b.name, `${b.count} · ${money(b.sales - b.refunds)}`)).join('')}</table>` : ''}`)}
${section('Tills', `${summary.tills.length ? `<table>${summary.tills.map((t) => row(`${t.branch} · ${t.register || 'Till'}`, `expected ${money(t.expected)}, counted ${money(t.counted)}, ${t.variance === 0 ? 'balanced' : t.variance > 0 ? `over ${money(t.variance)}` : `short ${money(-t.variance)}`}`)).join('')}</table>` : '<p>No till was closed today.</p>'}${summary.openTills.length ? `<p><strong>Still open:</strong> ${summary.openTills.map((t) => escape(t.branch)).join(', ')}</p>` : ''}`)}
${section('Stock', summary.lowStock.count ? `<p>${summary.lowStock.count} item${summary.lowStock.count === 1 ? ' is' : 's are'} at or below the low-stock level.</p><ul>${summary.lowStock.items.map((i) => `<li>${escape(i.name)} (${escape(i.branch)}): ${i.quantity} left</li>`).join('')}</ul>` : '<p>Nothing is running low.</p>')}
${section('Needs attention', pendingLines.length ? `<ul>${pendingLines.join('')}</ul>` : '<p>Nothing is waiting.</p>')}
<p style="margin-top:24px"><a href="${APP_URL}/dashboard">Open QuadERP</a></p>
<p style="color:#64748b;font-size:12px">You receive this because you switched on the end-of-day summary. Turn it off on your dashboard.</p>
</div>`;
  // A business name is free text; keep it out of the mail headers.
  const subject = `${summary.business.name}: ${money(summary.sales.net)} net sales on ${day}`.replace(/[\r\n]+/g, ' ');
  return { subject, html };
}

/** People who switched it on and may see the whole business. */
async function recipientsByBusiness() {
  const { data, error } = await db.from('users').select('email,business_id,status,roles:role_id(name,permissions),businesses(status,is_demo)')
    .eq('daily_summary_email', true).eq('status', 'active').not('business_id', 'is', null);
  if (error) throw error;
  const groups = new Map();
  for (const user of data || []) {
    const owner = user.roles?.name === 'Business Admin' || (user.roles?.permissions || []).includes('manage_business');
    if (!owner || !user.email || user.businesses?.is_demo || !['active', 'trialing'].includes(user.businesses?.status)) continue;
    groups.set(user.business_id, [...(groups.get(user.business_id) || []), user.email]);
  }
  return groups;
}

async function sendDailySummaries(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const [businessId, emails] of await recipientsByBusiness()) {
    const { error: claimError } = await db.from('owner_daily_summaries').insert({ business_id: businessId, summary_date: date });
    if (claimError) {
      if (claimError.code !== PG_UNIQUE_VIOLATION) logger.warn({ err: claimError, businessId }, 'owner summary: claim failed');
      continue;
    }
    const release = () => db.from('owner_daily_summaries').delete().eq('business_id', businessId).eq('summary_date', date).is('sent_at', null);
    try {
      const { subject, html } = renderSummaryEmail(await buildSummary(businessId, date));
      // One message per recipient; never a shared To: list.
      const result = await emailService.sendCustomEmail(emails, subject, html, null, { idempotencyKey: `owner-summary-${businessId}-${date}` });
      if (!result?.success || result.simulated) {
        await release();
        logger.warn({ businessId, error: result?.error, simulated: result?.simulated }, 'owner summary: not sent');
        continue;
      }
      await db.from('owner_daily_summaries').update({ sent_at: new Date().toISOString(), recipients: emails.length })
        .eq('business_id', businessId).eq('summary_date', date);
      sent += 1;
    } catch (err) {
      await release();
      logger.warn({ err, businessId }, 'owner summary: failed');
    }
  }
  return sent;
}

function initOwnerSummaryCron() {
  if (!cron) {
    logger.warn('[CRON] node-cron not available. Owner summaries disabled.');
    return { stop() {} };
  }
  const task = cron.schedule('0 20 * * *', async () => {
    try {
      if (!(await claimCronRun('owner-summaries', 'day'))) return;
      logger.info({ sent: await sendDailySummaries() }, '[CRON] Owner summaries sent');
    } catch (err) { logger.error({ err }, '[CRON] owner summaries failed'); }
  }, { timezone: 'Africa/Accra' });
  logger.info('✅ Owner summary cron initialized (runs daily at 20:00 GMT)');
  return { stop() { task.stop(); } };
}

module.exports = { buildSummary, renderSummaryEmail, sendDailySummaries, recipientsByBusiness, initOwnerSummaryCron };
