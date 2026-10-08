const { supabaseAdmin: db } = require('../db/supabase');
const { sendTemplate } = require('./whatsappService');
const { createReceiptLink } = require('../routes/receiptLinks');
const { resolveCountry, toSmsFormat } = require('../utils/phone');
const { claimCronRun } = require('../utils/cronLock');
const logger = require('../utils/logger');

let cron;
try { cron = require('node-cron'); } catch { cron = null; }

/**
 * Automatic WhatsApp receipts and payment reminders (migration 094).
 *
 * Each kind is off until the owner switches it on, and goes only to customers
 * with a recorded WhatsApp permission, through the business's OWN connected
 * account; there is no QuadERP fallback. Everything that decides whether a
 * message may go is re-read at send time, so switching a kind off, removing
 * the account or withdrawing a permission stops messages already queued.
 * The queue's unique key (business, kind, record) makes retried checkouts and
 * re-run sweeps queue nothing twice.
 */
const APP_URL = (process.env.APP_URL || 'https://app.quaderp.app').replace(/\/+$/, '');
const BATCH = 25;
const MAX_ATTEMPTS = 3;
const REMINDER_DAYS_BEFORE = 2;
const STALE_SENDING_MS = 15 * 60 * 1000;

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
const money = (amount, currency) => new Intl.NumberFormat('en-GH', { style: 'currency', currency: currency || 'GHS' }).format(Number(amount || 0));
const longDate = (value) => (value ? new Date(`${String(value).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

/** The business's own active WhatsApp account, never a platform one. */
async function ownGateway(businessId) {
  const { data, error } = await db.from('communication_gateways').select('*').eq('business_id', businessId)
    .eq('type', 'whatsapp').eq('is_active', true).order('is_default', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * After a sale completes. Never throws: a receipt must not affect checkout.
 * @param {string} businessId
 * @param {{ id: string, status: string, customer_id?: string, customer?: { id: string } }} sale
 */
async function queueReceipt(businessId, sale) {
  try {
    const customerId = sale?.customer_id || sale?.customer?.id;
    if (!businessId || !sale?.id || sale.status !== 'completed' || !customerId) return;
    const { data: business, error } = await db.from('businesses').select('whatsapp_receipts').eq('id', businessId).maybeSingle();
    if (error) throw error;
    if (!business?.whatsapp_receipts) return;
    const { error: insertError } = await db.from('whatsapp_messages').upsert(
      { business_id: businessId, kind: 'receipt', reference_id: sale.id, customer_id: customerId },
      { onConflict: 'business_id,kind,reference_id', ignoreDuplicates: true },
    );
    if (insertError) throw insertError;
    processQueue().catch((err) => logger.warn({ err }, 'whatsapp: immediate send failed'));
  } catch (err) {
    logger.warn({ err, businessId, saleId: sale?.id }, 'whatsapp: receipt not queued');
  }
}

/** Invoices falling due in two days, for businesses with reminders on. */
async function queueReminders(now = new Date()) {
  const due = new Date(now.getTime() + REMINDER_DAYS_BEFORE * 86_400_000).toISOString().slice(0, 10); // Accra is UTC+0
  const { data: businesses, error } = await db.from('businesses').select('id').eq('whatsapp_reminders', true).eq('is_demo', false);
  if (error) throw error;
  let queued = 0;
  for (const business of businesses || []) {
    try {
      if (!(await ownGateway(business.id))) continue;
      const { data: invoices, error: invoiceError } = await db.from('ar_invoices').select('id,customer_id,total_amount,amount_paid')
        .eq('business_id', business.id).in('status', ['sent', 'partial', 'overdue']).eq('due_date', due);
      if (invoiceError) throw invoiceError;
      const rows = (invoices || [])
        .filter((i) => i.customer_id && Number(i.total_amount) - Number(i.amount_paid) > 0)
        .map((i) => ({ business_id: business.id, kind: 'reminder', reference_id: i.id, customer_id: i.customer_id }));
      if (!rows.length) continue;
      const { error: insertError } = await db.from('whatsapp_messages').upsert(rows, { onConflict: 'business_id,kind,reference_id', ignoreDuplicates: true });
      if (insertError) throw insertError;
      queued += rows.length;
    } catch (err) {
      logger.warn({ err, businessId: business.id }, 'whatsapp: reminders not queued for one business');
    }
  }
  return queued;
}

const update = (id, fields) => db.from('whatsapp_messages').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);

/** Decide, build and send one claimed message. */
async function deliver(message) {
  const skip = (detail) => update(message.id, { status: 'skipped', detail });
  const { data: business } = await db.from('businesses').select('name,currency,whatsapp_receipts,whatsapp_reminders').eq('id', message.business_id).maybeSingle();
  if (!business) return skip('Business not found.');
  if (message.kind === 'receipt' && !business.whatsapp_receipts) return skip('Automatic receipts were switched off.');
  if (message.kind === 'reminder' && !business.whatsapp_reminders) return skip('Automatic reminders were switched off.');
  const gateway = await ownGateway(message.business_id);
  if (!gateway) return skip('WhatsApp is not connected.');
  const template = gateway.config?.[message.kind === 'receipt' ? 'receipt_template' : 'reminder_template'];
  if (!template) return skip('No WhatsApp template name is set for this message.');

  if (!message.customer_id) return skip('The customer record was removed.');
  const { data: customer } = await db.from('customers').select('id,name,phone').eq('id', message.customer_id).eq('business_id', message.business_id).maybeSingle();
  if (!customer?.phone) return skip('The customer has no phone number.');
  const { data: preference } = await db.from('customer_contact_preferences').select('allowed')
    .eq('business_id', message.business_id).eq('customer_id', customer.id).eq('channel', 'whatsapp').maybeSingle();
  if (preference?.allowed !== true) return skip(preference ? 'The customer opted out of WhatsApp.' : 'The customer has not given WhatsApp permission.');
  const to = toSmsFormat(customer.phone, await resolveCountry(db, message.business_id, null));
  if (!to) return skip('The phone number cannot be used on WhatsApp.');

  let params;
  if (message.kind === 'receipt') {
    const { data: sale } = await db.from('sales').select('id,receipt_number,total_amount,status')
      .eq('id', message.reference_id).eq('business_id', message.business_id).maybeSingle();
    if (!sale || sale.status !== 'completed') return skip('The sale is no longer completed.');
    const link = await createReceiptLink({ businessId: message.business_id, saleId: sale.id });
    params = [firstName(customer.name), business.name, sale.receipt_number, money(sale.total_amount, business.currency), `${APP_URL}/r/${link.token}`];
  } else {
    const { data: invoice } = await db.from('ar_invoices').select('invoice_number,total_amount,amount_paid,due_date,status')
      .eq('id', message.reference_id).eq('business_id', message.business_id).maybeSingle();
    const outstanding = invoice ? Number(invoice.total_amount) - Number(invoice.amount_paid) : 0;
    if (!invoice || ['paid', 'void'].includes(invoice.status) || outstanding <= 0) return skip('The invoice is no longer outstanding.');
    params = [firstName(customer.name), business.name, invoice.invoice_number, money(outstanding, business.currency), longDate(invoice.due_date)];
  }

  const result = await sendTemplate(gateway, { to, template, language: gateway.config?.language || 'en', params });
  if (result.success) return update(message.id, { status: 'accepted', provider_message_id: result.messageId, detail: null });
  if (!result.permanent && message.attempts < MAX_ATTEMPTS) {
    return update(message.id, { status: 'queued', detail: result.error, next_attempt_at: new Date(Date.now() + 10 * 60 * 1000 * message.attempts).toISOString() });
  }
  return update(message.id, { status: 'failed', detail: result.error });
}

let running = false;
/** Send due messages. Safe to call often: claims use SKIP LOCKED. */
async function processQueue() {
  if (running) return 0;
  running = true;
  try {
    // A crash mid-send leaves 'sending'. Whether WhatsApp got it is unknown,
    // so it is not sent again; the owner sees why.
    await db.from('whatsapp_messages').update({ status: 'failed', detail: 'Sending was interrupted. Not retried, to avoid sending twice.', updated_at: new Date().toISOString() })
      .eq('status', 'sending').lt('updated_at', new Date(Date.now() - STALE_SENDING_MS).toISOString());
    const { data: claimed, error } = await db.rpc('claim_whatsapp_messages', { p_limit: BATCH });
    if (error) throw error;
    for (const message of claimed || []) {
      try { await deliver(message); }
      catch (err) {
        logger.warn({ err, id: message.id }, 'whatsapp: delivery error');
        await update(message.id, { status: message.attempts < MAX_ATTEMPTS ? 'queued' : 'failed', detail: 'An internal error stopped this message.', next_attempt_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      }
    }
    return (claimed || []).length;
  } finally {
    running = false;
  }
}

function initWhatsAppCron() {
  if (!cron) {
    logger.warn('[CRON] node-cron not available. WhatsApp automation disabled.');
    return { stop() {} };
  }
  const queueTask = cron.schedule('*/5 * * * *', async () => {
    try { if (await claimCronRun('whatsapp-queue', 'five-minutes')) await processQueue(); }
    catch (err) { logger.error({ err }, '[CRON] whatsapp queue failed'); }
  }, { timezone: 'Africa/Accra' });
  const reminderTask = cron.schedule('0 9 * * *', async () => {
    try {
      if (!(await claimCronRun('whatsapp-reminders', 'day'))) return;
      const queued = await queueReminders();
      logger.info({ queued }, '[CRON] WhatsApp reminders queued');
      await processQueue();
    } catch (err) { logger.error({ err }, '[CRON] whatsapp reminders failed'); }
  }, { timezone: 'Africa/Accra' });
  logger.info('✅ WhatsApp automation cron initialized (queue every 5 min, reminders 09:00 GMT)');
  return { stop() { queueTask.stop(); reminderTask.stop(); } };
}

module.exports = { queueReceipt, queueReminders, processQueue, deliver, ownGateway, initWhatsAppCron };
