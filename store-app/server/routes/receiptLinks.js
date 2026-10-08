const express = require('express');
const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const authGuard = require('../middleware/authGuard');
const { supabaseAdmin: db } = require('../db/supabase');
const { resolveCurrency } = require('../utils/currency');
const logger = require('../utils/logger');

/**
 * Private receipt links (migration 093).
 *
 * Staff create a link for a completed sale they can see; the customer opens
 * it at /r/<token> without an account. Only a SHA-256 of the token is stored.
 * Links expire after 30 days and can be withdrawn. The public view carries the
 * receipt lines and totals and the shop's name, never the customer's or the
 * salesperson's details, and every failure reads the same so tokens cannot be
 * probed.
 */
const LINK_DAYS = 30;
const TOKEN = /^[A-Za-z0-9_-]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN = ['Business Admin', 'Platform Admin'];
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');
const canShare = (user) => ADMIN.includes(user.role) || ['view_sales', 'create_sales'].some((p) => user.permissions?.includes(p));

/**
 * Create a link for a sale already known to belong to the business.
 * Shared by the staff route and automatic WhatsApp receipts (createdBy null).
 * @returns {Promise<{ token: string, expires_at: string }>}
 */
async function createReceiptLink({ businessId, saleId, createdBy = null }) {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString();
  const { error } = await db.from('receipt_links').insert({
    business_id: businessId, sale_id: saleId, token_hash: hash(token), created_by: createdBy, expires_at: expiresAt,
  });
  if (error) throw error;
  return { token, expires_at: expiresAt };
}

/** The sale, scoped exactly as GET /api/sales/:id scopes it. */
async function findSale(req, saleId) {
  let query = db.from('sales').select('id,business_id,location_id,status').eq('id', saleId).eq('business_id', req.user.business_id);
  if (req.user.active_location_id) query = query.eq('location_id', req.user.active_location_id);
  else if (!ADMIN.includes(req.user.role)) {
    query = query.in('location_id', req.user.location_ids?.length ? req.user.location_ids : ['00000000-0000-0000-0000-000000000000']);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

const staff = express.Router();

/** POST /api/receipt-links { sale_id } → { token, expires_at } */
staff.post('/', authGuard, async (req, res) => {
  try {
    if (!canShare(req.user)) return res.status(403).json({ error: 'You do not have permission to share receipts.' });
    const saleId = String(req.body?.sale_id || '');
    if (!UUID.test(saleId)) return res.status(400).json({ error: 'Choose a sale to share.' });
    const sale = await findSale(req, saleId);
    if (!sale) return res.status(404).json({ error: 'Sale not found in this branch.' });
    if (!['completed', 'void_pending'].includes(sale.status)) {
      return res.status(409).json({ error: 'Only a completed sale has a receipt to share.' });
    }
    res.status(201).json(await createReceiptLink({ businessId: sale.business_id, saleId: sale.id, createdBy: req.user.id }));
  } catch (err) {
    logger.error({ err }, 'receipt link: create failed');
    res.status(500).json({ error: 'The receipt link could not be created. Please try again.' });
  }
});

/** DELETE /api/receipt-links?sale_id= withdraws every active link for the sale. */
staff.delete('/', authGuard, async (req, res) => {
  try {
    if (!canShare(req.user)) return res.status(403).json({ error: 'You do not have permission to share receipts.' });
    const saleId = String(req.query.sale_id || '');
    if (!UUID.test(saleId)) return res.status(400).json({ error: 'Choose a sale.' });
    const sale = await findSale(req, saleId);
    if (!sale) return res.status(404).json({ error: 'Sale not found in this branch.' });
    const { data, error } = await db.from('receipt_links').update({ revoked_at: new Date().toISOString() })
      .eq('business_id', sale.business_id).eq('sale_id', sale.id).is('revoked_at', null).select('id');
    if (error) throw error;
    res.json({ revoked: (data || []).length });
  } catch (err) {
    logger.error({ err }, 'receipt link: revoke failed');
    res.status(500).json({ error: 'The links could not be withdrawn. Please try again.' });
  }
});

const publicReceipts = express.Router();
const viewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => rateLimit.ipKeyGenerator(req.ip),
  message: { error: 'Too many requests, please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** GET /api/public/receipts/:token, no account needed. */
publicReceipts.get('/:token', viewLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  const gone = () => res.status(404).json({ error: 'This receipt link has expired or was withdrawn.' });
  try {
    const token = String(req.params.token || '');
    if (!TOKEN.test(token)) return gone();
    const { data: link, error } = await db.from('receipt_links').select('id,business_id,sale_id,expires_at,view_count')
      .eq('token_hash', hash(token)).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
    if (error) throw error;
    if (!link) return gone();

    const [{ data: receipt, error: receiptError }, { data: business, error: businessError }] = await Promise.all([
      db.rpc('sale_receipt', { p_sale_id: link.sale_id }),
      db.from('businesses').select('name,phone').eq('id', link.business_id).single(),
    ]);
    if (receiptError) throw receiptError;
    if (businessError) throw businessError;
    if (!receipt || receipt.business_id !== link.business_id) return gone();
    const currency = await resolveCurrency(db, link.business_id, receipt.location_id);

    // A counter, not an audit record; a lost increment does not matter.
    db.from('receipt_links').update({ view_count: (link.view_count || 0) + 1, last_viewed_at: new Date().toISOString() })
      .eq('id', link.id).then(() => {}, () => {});

    res.json({
      business: { name: business.name, phone: business.phone || null, currency },
      receipt: {
        receipt_number: receipt.receipt_number,
        created_at: receipt.created_at,
        status: receipt.status,
        payment_method: receipt.payment_method,
        subtotal: receipt.subtotal,
        tax_amount: receipt.tax_amount,
        tax_label: receipt.tax_label_applied || null,
        total_amount: receipt.total_amount,
        amount_paid: receipt.amount_paid,
        change_due: receipt.change_due,
        rewards_applied: receipt.rewards_applied || 0,
        items: (receipt.sale_items || []).map((item) => ({ name: item.product?.name || 'Item', quantity: item.quantity, unit_price: item.unit_price })),
      },
      expires_at: link.expires_at,
    });
  } catch (err) {
    logger.error({ err }, 'receipt link: public view failed');
    res.status(500).json({ error: 'The receipt could not be loaded. Please try again.' });
  }
});

module.exports = { staff, publicReceipts, createReceiptLink };
