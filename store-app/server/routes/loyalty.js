const express = require('express');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');
const { transactionError } = require('../utils/transactionError');
const { invalidateCachePrefix } = require('../middleware/apiCache');

const router = express.Router();

// ============================================
// Schemas
// ============================================

const loyaltyRuleSchema = z.object({
  points_per_currency_unit: z.number().min(0),
  min_points_to_redeem: z.number().int().min(1),
  point_value: z.number().min(0),
  active: z.boolean().optional().default(true),
});

const money = z.number().finite().positive().max(99999999.99).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001, 'Use at most two decimal places');
const walletBase = { operation_id: z.string().uuid(), amount: money, note: z.string().max(500).optional() };
const issueGiftCardSchema = z.object({ ...walletBase, customer_id: z.string().uuid().optional(), expires_at: z.string().optional(), funding: z.enum(['cash', 'promotional']) });
const redeemGiftCardSchema = z.object({ ...walletBase, customer_id: z.string().uuid(), code: z.string().min(1).max(100) });
const storeCreditSchema = z.object({ ...walletBase, customer_id: z.string().uuid(), type: z.enum(['deposit', 'issue']), sale_id: z.string().uuid().optional() });
const withdrawStoreCreditSchema = z.object({ ...walletBase, customer_id: z.string().uuid(), code: z.string().min(4).max(12), location_id: z.string().uuid().optional() });
function wallet(kind, status = 200) {
  return async (req, res) => {
    if (req.body.sale_id) return res.status(409).json({ error: 'Use checkout or Returns for sale-related credit.' });
    if (!req.user.active_location_id || (req.body.location_id && req.body.location_id !== req.user.active_location_id)) return res.status(400).json({ error: 'Select the active till branch before continuing.' });
    try {
      const { data, error } = await supabaseAdmin.rpc('process_wallet_transaction', {
        p_business_id: req.user.business_id, p_location_id: req.user.active_location_id,
        p_actor_id: req.user.id, p_kind: typeof kind === 'function' ? kind(req.body) : kind, p_request: req.body,
      });
      if (error) return transactionError(res, error, 'Could not complete the wallet transaction. Retry the saved operation.');
      for (const prefix of ['/api/analytics', '/api/ledger', '/api/reports', '/api/customers']) invalidateCachePrefix(prefix);
      res.status(status).json(data);
    } catch (err) {
      logger.error({ err }, 'Wallet transaction failed');
      res.status(500).json({ error: 'Could not confirm the wallet transaction. Retry the saved operation.' });
    }
  };
}

// ============================================
// LOYALTY RULES
// ============================================

/**
 * GET /api/loyalty/rules
 */
router.get('/rules', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('loyalty_rules')
      .select('*');

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;

    res.json(data || null);
  } catch (err) {
    logger.error({ err }, 'Loyalty rules fetch error');
    res.status(500).json({ error: 'Failed to fetch loyalty rules' });
  }
});

/**
 * POST /api/loyalty/rules
 * Create or update loyalty rules (upsert per business)
 */
router.post('/rules', authGuard, permissionCheck('manage_loyalty'), validateBody(loyaltyRuleSchema), async (req, res) => {
  try {
    const { points_per_currency_unit, min_points_to_redeem, point_value, active } = req.body;

    const { data, error } = await supabaseAdmin
      .from('loyalty_rules')
      .upsert({
        business_id: req.user.business_id,
        points_per_currency_unit,
        min_points_to_redeem,
        point_value,
        active: active !== false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_id' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Loyalty rules save error');
    res.status(500).json({ error: 'Failed to save loyalty rules' });
  }
});

// ============================================
// LOYALTY POINTS
// ============================================

/**
 * GET /api/loyalty/balance/:customerId
 */
router.get('/balance/:customerId', authGuard, async (req, res) => {
  try {
    const { customerId } = req.params;

    const { data, error } = await supabaseAdmin.rpc('customer_reward_balances', {
      p_business_id: req.user.business_id, p_customer_id: customerId,
    });
    if (error) throw error;
    res.json({ customer_id: customerId, points: Number(data.points) });
  } catch (err) {
    logger.error({ err }, 'Loyalty balance error');
    res.status(500).json({ error: 'Failed to fetch loyalty balance' });
  }
});

/**
 * GET /api/loyalty/ledger/:customerId
 */
router.get('/ledger/:customerId', authGuard, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page, limit, offset } = getPagination(req.query);

    const { data, error, count } = await supabaseAdmin
      .from('loyalty_ledger')
      .select('*', { count: 'exact' })
      .eq('customer_id', customerId)
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data, ...buildPaginationMeta(count, page, limit) });
  } catch (err) {
    logger.error({ err }, 'Loyalty ledger error');
    res.status(500).json({ error: 'Failed to fetch loyalty ledger' });
  }
});

/**
 * POST /api/loyalty/redeem
 */
router.post('/redeem', authGuard, permissionCheck('manage_loyalty'), (req, res) => res.status(409).json({ error: 'Redeem points during checkout so the discount and payment are recorded together.' }));

// ============================================
// GIFT CARDS
// ============================================

/**
 * POST /api/loyalty/gift-cards
 */
router.post('/gift-cards', authGuard, permissionCheck('manage_loyalty'), validateBody(issueGiftCardSchema), wallet('gift_issue', 201));

/**
 * GET /api/loyalty/gift-cards
 * List all gift cards for the business
 */
router.get('/gift-cards', authGuard, async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);

    const { data, error, count } = await supabaseAdmin
      .from('gift_cards')
      .select(`
        *,
        customer:customers!issued_to_customer_id(id, name, email, phone)
      `, { count: 'exact' })
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data, ...buildPaginationMeta(count, page, limit) });
  } catch (err) {
    logger.error({ err }, 'Gift cards list error');
    res.status(500).json({ error: 'Failed to list gift cards' });
  }
});

/**
 * GET /api/loyalty/gift-cards/lookup/:code
 */
router.get('/gift-cards/lookup/:code', authGuard, async (req, res) => {
  try {
    const { code } = req.params;

    const { data, error } = await supabaseAdmin
      .from('gift_cards')
      .select(`*, customer:customers!issued_to_customer_id(id, name, email)`)
      .eq('code', code.toUpperCase())
      .eq('business_id', req.user.business_id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Gift card not found' });
    if (!data.active) return res.status(400).json({ error: 'Gift card is deactivated', card: data });
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Gift card has expired', card: data });
    }

    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Gift card lookup error');
    res.status(500).json({ error: 'Failed to look up gift card' });
  }
});

/**
 * POST /api/loyalty/gift-cards/redeem
 */
router.post('/gift-cards/redeem', authGuard, permissionCheck('manage_loyalty'), validateBody(redeemGiftCardSchema), wallet('gift_transfer'));

// ============================================
// STORE CREDIT
// ============================================

/**
 * GET /api/loyalty/store-credit/:customerId
 */
router.get('/store-credit/:customerId', authGuard, async (req, res) => {
  try {
    const { customerId } = req.params;

    const { data, error } = await supabaseAdmin.rpc('customer_reward_balances', {
      p_business_id: req.user.business_id, p_customer_id: customerId,
    });
    if (error) throw error;
    res.json({ customer_id: customerId, balance: Number(data.credit) });
  } catch (err) {
    logger.error({ err }, 'Store credit balance error');
    res.status(500).json({ error: 'Failed to fetch store credit balance' });
  }
});

/**
 * GET /api/loyalty/store-credit/:customerId/ledger
 */
router.get('/store-credit/:customerId/ledger', authGuard, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { page, limit, offset } = getPagination(req.query);

    const { data, error, count } = await supabaseAdmin
      .from('store_credit_ledger')
      .select('*', { count: 'exact' })
      .eq('customer_id', customerId)
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data, ...buildPaginationMeta(count, page, limit) });
  } catch (err) {
    logger.error({ err }, 'Store credit ledger error');
    res.status(500).json({ error: 'Failed to fetch store credit ledger' });
  }
});

/**
 * POST /api/loyalty/store-credit
 */
router.post('/store-credit', authGuard, (req, res, next) => permissionCheck(req.body.type === 'deposit' ? 'record_payments' : 'manage_loyalty')(req, res, next), validateBody(storeCreditSchema), wallet(body => body.type === 'deposit' ? 'deposit' : 'credit_adjustment', 201));

/**
 * POST /api/loyalty/store-credit/withdraw
 */
router.post('/store-credit/withdraw', authGuard, permissionCheck('record_payments'), validateBody(withdrawStoreCreditSchema), wallet('withdrawal'));

module.exports = router;
