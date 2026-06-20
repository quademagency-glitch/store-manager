const express = require('express');
const { z } = require('zod');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');
const { getPagination } = require('../utils/paginate');
const { resolveCurrency } = require('../utils/currency');

const router = express.Router();

const billSchema = z.object({
  supplier_id: z.string().uuid(),
  purchase_order_id: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  amount: z.number().positive(),
  due_date: z.string().optional().nullable(),
  is_opening_balance: z.boolean().optional().default(false),
  as_of_date: z.string().optional().nullable(),
}).refine(d => !d.is_opening_balance || !!d.as_of_date, {
  message: 'as_of_date is required for opening balances',
  path: ['as_of_date'],
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  payment_method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'card', 'other']),
  payment_date: z.string().optional(),
  location_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(d => !['cash', 'mobile_money'].includes(d.payment_method) || !!d.location_id, {
  message: 'location_id is required for cash or mobile_money payments',
  path: ['location_id'],
});

/**
 * GET /api/ap/bills
 * Access: manage_financials
 */
router.get('/bills', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { supplier_id, status, is_opening_balance } = req.query;

    let query = supabaseAdmin
      .from('ap_bills')
      .select('*, supplier:suppliers!supplier_id(id, name, phone, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }
    if (supplier_id) query = query.eq('supplier_id', supplier_id);
    if (status) query = query.eq('status', status);
    if (is_opening_balance !== undefined) query = query.eq('is_opening_balance', is_opening_balance === 'true');

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, total: count, page, totalPages: Math.ceil(count / limit) });
  } catch (err) {
    logger.error({ err }, 'Error fetching AP bills:');
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

/**
 * GET /api/ap/aging
 * Access: manage_financials
 * NOTE: registered before /bills/:id so "aging" is never captured as an :id param.
 */
router.get('/aging', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('ap_bills')
      .select('id, bill_number, amount, amount_paid, due_date, issue_date, supplier:suppliers!supplier_id(id, name, phone, email)')
      .in('status', ['open', 'partial']);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const today = new Date();
    const buckets = { current: [], '1_30': [], '31_60': [], '61_90': [], over_90: [] };

    (data || []).forEach(bill => {
      const outstanding = Number(bill.amount) - Number(bill.amount_paid);
      const dueDate = bill.due_date
        ? new Date(bill.due_date)
        : new Date(new Date(bill.issue_date).getTime() + 30 * 24 * 60 * 60 * 1000);
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

      const row = { ...bill, outstanding, days_overdue: daysOverdue };
      if (daysOverdue <= 0) buckets.current.push(row);
      else if (daysOverdue <= 30) buckets['1_30'].push(row);
      else if (daysOverdue <= 60) buckets['31_60'].push(row);
      else if (daysOverdue <= 90) buckets['61_90'].push(row);
      else buckets.over_90.push(row);
    });

    const totals = Object.fromEntries(
      Object.entries(buckets).map(([k, rows]) => [k, rows.reduce((s, r) => s + r.outstanding, 0)])
    );

    res.json({ buckets, totals });
  } catch (err) {
    logger.error({ err }, 'Error fetching AP aging:');
    res.status(500).json({ error: 'Failed to fetch aging report' });
  }
});

/**
 * GET /api/ap/bills/:id
 * Access: manage_financials
 */
router.get('/bills/:id', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('ap_bills')
      .select('*, supplier:suppliers!supplier_id(id, name, phone, email)')
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data: bill, error } = await query.single();
    if (error || !bill) return res.status(404).json({ error: 'Bill not found' });

    const { data: payments, error: payErr } = await supabaseAdmin
      .from('ap_payments')
      .select('*')
      .eq('bill_id', req.params.id)
      .order('created_at', { ascending: false });

    if (payErr) throw payErr;

    res.json({ ...bill, payments: payments || [] });
  } catch (err) {
    logger.error({ err }, 'Error fetching AP bill:');
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
});

/**
 * POST /api/ap/bills
 * Access: manage_financials
 */
router.post('/bills', authGuard, permissionCheck('manage_financials'), validateBody(billSchema), async (req, res) => {
  try {
    const { supplier_id, purchase_order_id, description, amount, due_date, is_opening_balance, as_of_date } = req.body;

    let supQuery = supabaseAdmin.from('suppliers').select('id, business_id').eq('id', supplier_id);
    if (req.user.role !== 'Platform Admin') supQuery = supQuery.eq('business_id', req.user.business_id);
    const { data: supplier, error: supErr } = await supQuery.single();
    if (supErr || !supplier) return res.status(404).json({ error: 'Supplier not found' });

    const business_id = req.user.role === 'Platform Admin' ? supplier.business_id : req.user.business_id;

    const { data: billNumber, error: numErr } = await supabaseAdmin.rpc('generate_ap_bill_number', { p_business_id: business_id });
    if (numErr) throw numErr;

    const currency = await resolveCurrency(supabaseAdmin, business_id, req.user.active_location_id);

    const { data, error } = await supabaseAdmin
      .from('ap_bills')
      .insert([{
        business_id,
        supplier_id,
        purchase_order_id: purchase_order_id || null,
        bill_number: billNumber,
        description: description || null,
        amount,
        currency,
        due_date: due_date || null,
        is_opening_balance: !!is_opening_balance,
        as_of_date: as_of_date || null,
        issue_date: as_of_date || new Date().toISOString().split('T')[0],
        created_by: req.user.id,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, 'Error creating AP bill:');
    res.status(500).json({ error: 'Failed to create bill' });
  }
});

/**
 * POST /api/ap/bills/:id/payments
 * Access: manage_financials
 */
router.post('/bills/:id/payments', authGuard, permissionCheck('manage_financials'), validateBody(paymentSchema), async (req, res) => {
  try {
    const { amount, payment_method, payment_date, location_id, notes } = req.body;

    let billQuery = supabaseAdmin.from('ap_bills').select('id, business_id, bill_number, amount, amount_paid, status').eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') billQuery = billQuery.eq('business_id', req.user.business_id);
    const { data: bill, error: billErr } = await billQuery.single();
    if (billErr || !bill) return res.status(404).json({ error: 'Bill not found' });

    if (bill.status === 'void') {
      return res.status(400).json({ error: 'Cannot record a payment against a voided bill.' });
    }

    const outstanding = Number(bill.amount) - Number(bill.amount_paid);
    if (amount > outstanding) {
      return res.status(400).json({ error: `Payment of ${amount} exceeds outstanding balance of ${outstanding.toFixed(2)}.` });
    }

    const isCashier = req.user.role === 'Salesperson' || req.user.role === 'Cashier';
    const ledgerStatus = isCashier ? 'pending' : 'approved';
    const postToLedger = ['cash', 'mobile_money'].includes(payment_method);

    const { data, error } = await supabaseAdmin.rpc('record_ap_payment', {
      p_bill_id: req.params.id,
      p_amount: amount,
      p_payment_method: payment_method,
      p_payment_date: payment_date || new Date().toISOString().split('T')[0],
      p_location_id: location_id || null,
      p_notes: notes || null,
      p_user_id: req.user.id,
      p_business_id: bill.business_id,
      p_post_to_ledger: postToLedger,
      p_ledger_status: ledgerStatus,
    });

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, 'Error recording AP payment:');
    res.status(500).json({ error: err.message || 'Failed to record payment' });
  }
});

/**
 * PUT /api/ap/payments/:id/void
 * Access: manage_financials
 */
router.put('/payments/:id/void', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    let payQuery = supabaseAdmin.from('ap_payments').select('*').eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') payQuery = payQuery.eq('business_id', req.user.business_id);
    const { data: payment, error: payErr } = await payQuery.single();
    if (payErr || !payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.voided_at) return res.status(400).json({ error: 'Payment is already voided.' });

    if (payment.ledger_entry_id) {
      const { data: ledgerEntry } = await supabaseAdmin
        .from('business_ledger')
        .select('id, status')
        .eq('id', payment.ledger_entry_id)
        .single();

      if (ledgerEntry?.status === 'approved') {
        return res.status(400).json({ error: 'This payment has already been approved in the till ledger and cannot be voided automatically. Ask an admin to make a manual ledger adjustment.' });
      }
      if (ledgerEntry?.status === 'pending') {
        await supabaseAdmin.from('business_ledger').update({ status: 'rejected' }).eq('id', payment.ledger_entry_id);
      }
    }

    const { data: bill, error: billErr } = await supabaseAdmin
      .from('ap_bills')
      .select('id, amount, amount_paid')
      .eq('id', payment.bill_id)
      .single();
    if (billErr || !bill) return res.status(404).json({ error: 'Related bill not found' });

    const newAmountPaid = Math.max(0, Number(bill.amount_paid) - Number(payment.amount));
    const newStatus = newAmountPaid <= 0 ? 'open' : (newAmountPaid >= Number(bill.amount) ? 'paid' : 'partial');

    await supabaseAdmin
      .from('ap_bills')
      .update({ amount_paid: newAmountPaid, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', payment.bill_id);

    const { data, error } = await supabaseAdmin
      .from('ap_payments')
      .update({ voided_at: new Date().toISOString(), voided_by: req.user.id })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error voiding AP payment:');
    res.status(500).json({ error: 'Failed to void payment' });
  }
});

/**
 * PUT /api/ap/bills/:id/void
 * Access: manage_financials
 */
router.put('/bills/:id/void', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    let query = supabaseAdmin.from('ap_bills').select('id, business_id, amount_paid').eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') query = query.eq('business_id', req.user.business_id);
    const { data: bill, error: fetchErr } = await query.single();
    if (fetchErr || !bill) return res.status(404).json({ error: 'Bill not found' });

    if (Number(bill.amount_paid) > 0) {
      return res.status(400).json({ error: 'Cannot void a bill with recorded payments; void the payments first.' });
    }

    const { data, error } = await supabaseAdmin
      .from('ap_bills')
      .update({ status: 'void', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error voiding AP bill:');
    res.status(500).json({ error: 'Failed to void bill' });
  }
});

module.exports = router;
