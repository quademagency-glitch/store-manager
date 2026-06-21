const express = require('express');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const { z } = require('zod');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');

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

const redeemPointsSchema = z.object({
  customer_id: z.string().uuid(),
  points: z.number().int().min(1),
  sale_id: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});

const issueGiftCardSchema = z.object({
  amount: z.number().min(0.01),
  customer_id: z.string().uuid().optional(),
  expires_at: z.string().optional(),
});

const redeemGiftCardSchema = z.object({
  code: z.string().min(1),
  amount: z.number().min(0.01),
});

const storeCreditSchema = z.object({
  customer_id: z.string().uuid(),
  amount: z.number().min(0.01),
  type: z.enum(['issue', 'refund', 'redeem']),
  sale_id: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});

const withdrawStoreCreditSchema = z.object({
  customer_id: z.string().uuid(),
  amount: z.number().min(0.01),
  code: z.string().min(4),
  location_id: z.string().uuid(),
  note: z.string().max(500).optional(),
});

// ============================================
// Helper: generate gift card code
// ============================================
function generateGiftCardCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
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
router.post('/rules', authGuard, permissionCheck('manage_business'), validateBody(loyaltyRuleSchema), async (req, res) => {
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

    // Get the last ledger entry to get balance
    const { data, error } = await supabaseAdmin
      .from('loyalty_ledger')
      .select('balance_after')
      .eq('customer_id', customerId)
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    res.json({ customer_id: customerId, points: data?.balance_after || 0 });
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
router.post('/redeem', authGuard, validateBody(redeemPointsSchema), async (req, res) => {
  try {
    const { customer_id, points, sale_id, note } = req.body;

    // Get current balance
    const { data: lastEntry } = await supabaseAdmin
      .from('loyalty_ledger')
      .select('balance_after')
      .eq('customer_id', customer_id)
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentBalance = lastEntry?.balance_after || 0;
    if (currentBalance < points) {
      return res.status(400).json({ error: 'Insufficient points', current: currentBalance, requested: points });
    }

    // Get rules for point value
    const { data: rules } = await supabaseAdmin
      .from('loyalty_rules')
      .select('point_value, min_points_to_redeem')
      .eq('business_id', req.user.business_id)
      .eq('active', true)
      .maybeSingle();

    if (!rules) {
      return res.status(400).json({ error: 'Loyalty program not configured' });
    }

    if (points < rules.min_points_to_redeem) {
      return res.status(400).json({ error: `Minimum ${rules.min_points_to_redeem} points required to redeem` });
    }

    const cashValue = points * Number(rules.point_value);
    const newBalance = currentBalance - points;

    const { data, error } = await supabaseAdmin
      .from('loyalty_ledger')
      .insert({
        customer_id,
        business_id: req.user.business_id,
        sale_id: sale_id || null,
        type: 'redeem',
        points: -points,
        balance_after: newBalance,
        note: note || `Redeemed ${points} points`,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Points redeemed', cash_value: cashValue, new_balance: newBalance, entry: data });
  } catch (err) {
    logger.error({ err }, 'Points redemption error');
    res.status(500).json({ error: 'Failed to redeem points' });
  }
});

// ============================================
// GIFT CARDS
// ============================================

/**
 * POST /api/loyalty/gift-cards
 */
router.post('/gift-cards', authGuard, permissionCheck('manage_business'), validateBody(issueGiftCardSchema), async (req, res) => {
  try {
    const { amount, customer_id, expires_at } = req.body;

    const { data, error } = await supabaseAdmin
      .from('gift_cards')
      .insert({
        business_id: req.user.business_id,
        code: generateGiftCardCode(),
        initial_balance: amount,
        current_balance: amount,
        issued_to_customer_id: customer_id || null,
        expires_at: expires_at || null,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, 'Gift card issue error');
    res.status(500).json({ error: 'Failed to issue gift card' });
  }
});

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
router.post('/gift-cards/redeem', authGuard, validateBody(redeemGiftCardSchema), async (req, res) => {
  try {
    const { code, amount } = req.body;

    const { data: card, error: findError } = await supabaseAdmin
      .from('gift_cards')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('business_id', req.user.business_id)
      .eq('active', true)
      .maybeSingle();

    if (findError) throw findError;
    if (!card) return res.status(404).json({ error: 'Gift card not found or inactive' });
    if (card.expires_at && new Date(card.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Gift card has expired' });
    }

    const currentBalance = Number(card.current_balance);
    if (currentBalance < amount) {
      return res.status(400).json({ error: 'Insufficient balance', balance: currentBalance, requested: amount });
    }

    const newBalance = currentBalance - amount;
    const { data, error } = await supabaseAdmin
      .from('gift_cards')
      .update({ current_balance: newBalance })
      .eq('id', card.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Gift card redeemed', amount_deducted: amount, new_balance: newBalance, card: data });
  } catch (err) {
    logger.error({ err }, 'Gift card redeem error');
    res.status(500).json({ error: 'Failed to redeem gift card' });
  }
});

// ============================================
// STORE CREDIT
// ============================================

/**
 * GET /api/loyalty/store-credit/:customerId
 */
router.get('/store-credit/:customerId', authGuard, async (req, res) => {
  try {
    const { customerId } = req.params;

    const { data } = await supabaseAdmin
      .from('store_credit_ledger')
      .select('balance_after')
      .eq('customer_id', customerId)
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({ customer_id: customerId, balance: data?.balance_after || 0 });
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
router.post('/store-credit', authGuard, validateBody(storeCreditSchema), async (req, res) => {
  try {
    const { customer_id, amount, type, sale_id, note } = req.body;

    // Get current balance
    const { data: lastEntry } = await supabaseAdmin
      .from('store_credit_ledger')
      .select('balance_after')
      .eq('customer_id', customer_id)
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentBalance = Number(lastEntry?.balance_after || 0);
    let newBalance;

    if (type === 'redeem') {
      if (currentBalance < amount) {
        return res.status(400).json({ error: 'Insufficient store credit', balance: currentBalance, requested: amount });
      }
      newBalance = currentBalance - amount;
    } else {
      newBalance = currentBalance + amount;
    }

    const { data, error } = await supabaseAdmin
      .from('store_credit_ledger')
      .insert({
        customer_id,
        business_id: req.user.business_id,
        sale_id: sale_id || null,
        type,
        amount: type === 'redeem' ? -amount : amount,
        balance_after: newBalance,
        note: note || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: `Store credit ${type}d`, new_balance: newBalance, entry: data });
  } catch (err) {
    logger.error({ err }, 'Store credit error');
    res.status(500).json({ error: 'Failed to process store credit' });
  }
});

/**
 * POST /api/loyalty/store-credit/withdraw
 */
router.post('/store-credit/withdraw', authGuard, validateBody(withdrawStoreCreditSchema), async (req, res) => {
  try {
    const { customer_id, amount, code, location_id, note } = req.body;

    // 1. Verify Code
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('verification_code')
      .eq('id', customer_id)
      .eq('business_id', req.user.business_id)
      .single();

    if (custErr || !customer) return res.status(404).json({ error: 'Customer not found' });
    if (!customer.verification_code || customer.verification_code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Clear code
    await supabaseAdmin.from('customers').update({ verification_code: null }).eq('id', customer_id);

    // 2. Get current balance
    const { data: lastEntry } = await supabaseAdmin
      .from('store_credit_ledger')
      .select('balance_after')
      .eq('customer_id', customer_id)
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentBalance = Number(lastEntry?.balance_after || 0);
    if (currentBalance < amount) {
      return res.status(400).json({ error: `Insufficient deposit balance. Available: ${currentBalance.toFixed(2)}` });
    }

    const newBalance = currentBalance - amount;

    // 3. Deduct store credit
    const { data: creditEntry, error: creditErr } = await supabaseAdmin
      .from('store_credit_ledger')
      .insert({
        customer_id,
        business_id: req.user.business_id,
        type: 'redeem',
        amount: -amount,
        balance_after: newBalance,
        note: note || 'Customer Withdrawal'
      })
      .select()
      .single();

    if (creditErr) throw creditErr;

    // 4. Record expense in business ledger (cash out of till)
    const { error: ledgerErr } = await supabaseAdmin
      .from('business_ledger')
      .insert({
        business_id: req.user.business_id,
        location_id,
        category: 'Customer Withdrawal',
        type: 'expense',
        amount,
        payment_method: 'cash',
        status: 'approved',
        reference: `Withdrawal by ${customer_id.substring(0, 8)}`,
        created_by: req.user.id
      });

    if (ledgerErr) throw ledgerErr;

    res.json({ message: 'Funds withdrawn successfully', new_balance: newBalance, entry: creditEntry });
  } catch (err) {
    logger.error({ err }, 'Withdraw store credit error');
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

module.exports = router;
