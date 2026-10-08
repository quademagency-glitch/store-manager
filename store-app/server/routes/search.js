const express = require('express');
const authGuard = require('../middleware/authGuard');
const { supabaseAdmin: db } = require('../db/supabase');
const { phoneSearchDigits } = require('../utils/phone');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/search?q=
 *
 * One query for the command palette: products, customers, receipts, item
 * codes, suppliers and invoices. Each kind is searched only when the caller
 * can open the page its result links to, with the same business and branch
 * scope that page uses, so the palette never offers a record the user would
 * then be refused. A kind that fails is left out rather than failing the
 * whole search.
 */
const ADMIN = ['Business Admin', 'Platform Admin'];
const can = (user, ...permissions) => ADMIN.includes(user.role) || permissions.some((p) => user.permissions?.includes(p));
const LIMIT = 5;
// PostgREST OR grammar becomes single-character wildcards (as /customers/search).
const clean = (value) => String(value || '').trim().slice(0, 100).replace(/[,().%_"\\*:]/g, '_');

router.get('/', authGuard, async (req, res) => {
  const q = clean(req.query.q);
  const user = req.user;
  if (q.length < 2 || !user.business_id) return res.json({ results: [] });
  const business = user.business_id;
  const branch = user.active_location_id;
  const like = `%${q}%`;
  const searches = [];

  if (can(user, 'view_inventory', 'manage_inventory')) {
    searches.push(['product', async () => {
      const { data, error } = await db.from('products').select('id,name,sku').eq('business_id', business)
        .or(`name.ilike.${like},sku.ilike.${like}`).order('name').limit(LIMIT);
      if (error) throw error;
      return data.map((p) => ({ id: p.id, label: p.name, detail: p.sku || '', path: `/inventory/products/${p.id}` }));
    }]);
  }

  if (can(user, 'manage_sales')) {
    searches.push(['customer', async () => {
      const digits = phoneSearchDigits(q);
      // Same rule as /customers/search: only admins match by name or code.
      const clauses = ADMIN.includes(user.role) ? [`name.ilike.${like}`, `phone.ilike.${like}`, `customer_code.ilike.${like}`] : [`phone.ilike.${like}`];
      if (digits) clauses.push(`phone.ilike.%${digits}%`);
      const { data, error } = await db.from('customers').select('id,name,phone').eq('business_id', business)
        .or(clauses.join(',')).order('name').limit(LIMIT);
      if (error) throw error;
      return data.map((c) => ({ id: c.id, label: c.name, detail: c.phone || '', path: `/customers/${c.id}` }));
    }]);
  }

  if (branch && can(user, 'view_sales')) {
    searches.push(['receipt', async () => {
      const { data, error } = await db.from('sales').select('id,receipt_number,total_amount,created_at').eq('business_id', business)
        .eq('location_id', branch).not('receipt_number', 'is', null).ilike('receipt_number', like)
        .order('created_at', { ascending: false }).limit(LIMIT);
      if (error) throw error;
      return data.map((s) => ({
        id: s.id, label: s.receipt_number, detail: new Date(s.created_at).toISOString().slice(0, 10),
        path: `/sales-record?date=${String(s.created_at).slice(0, 10)}&highlight=${s.id}`,
      }));
    }]);
  }

  // Item codes match exactly, as a scanner would send them; no point trying a
  // phrase with spaces.
  const code = String(req.query.q || '').trim().slice(0, 250);
  if (branch && !/\s/.test(code) && code.length >= 4 && can(user, 'manage_inventory', 'manage_returns')) {
    searches.push(['item', async () => {
      const { data, error } = await db.rpc('find_tracked_units', { p_business_id: business, p_location_id: branch, p_code: code });
      if (error) throw error;
      return (data || []).slice(0, LIMIT).map((u) => ({
        id: u.id, label: u.item_code || u.serial_number || code, detail: u.product_name,
        path: `/item-history?code=${encodeURIComponent(code)}&unit=${u.id}`,
      }));
    }]);
  }

  if (can(user, 'manage_suppliers')) {
    searches.push(['supplier', async () => {
      const { data, error } = await db.from('suppliers').select('id,name,contact_person').eq('business_id', business)
        .eq('is_active', true).ilike('name', like).order('name').limit(LIMIT);
      if (error) throw error;
      return data.map((s) => ({ id: s.id, label: s.name, detail: s.contact_person || '', path: `/suppliers?q=${encodeURIComponent(s.name)}` }));
    }]);
  }

  if (can(user, 'manage_financials')) {
    searches.push(['invoice', async () => {
      const { data, error } = await db.from('ar_invoices').select('id,invoice_number,customer:customers!customer_id(name)').eq('business_id', business)
        .ilike('invoice_number', like).order('issued_date', { ascending: false }).limit(LIMIT);
      if (error) throw error;
      return data.map((i) => ({ id: i.id, label: i.invoice_number, detail: i.customer?.name || '', path: `/accounts-receivable?q=${encodeURIComponent(i.invoice_number)}` }));
    }]);
  }

  const settled = await Promise.allSettled(searches.map(([, run]) => run()));
  const results = [];
  settled.forEach((outcome, i) => {
    const type = searches[i][0];
    if (outcome.status === 'fulfilled') results.push(...outcome.value.map((r) => ({ type, ...r })));
    else logger.warn({ err: outcome.reason, type }, 'search: one kind failed');
  });
  res.json({ results });
});

module.exports = router;
