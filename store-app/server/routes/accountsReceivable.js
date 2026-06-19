const express = require('express');
const { z } = require('zod');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { validateBody } = require('../middleware/validate');
const { getPagination } = require('../utils/paginate');

const router = express.Router();

// Field names here (total_amount, issued_date, status values) match the
// ar_invoices table shape, which itself matches what reports.js / the
// Reports > Accounts Receivable page already expect — see migration 044.
const invoiceSchema = z.object({
  customer_id: z.string().uuid(),
  description: z.string().optional().nullable(),
  total_amount: z.number().positive(),
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
 * GET /api/ar/invoices
 * Access: manage_financials
 */
router.get('/invoices', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const { customer_id, status, is_opening_balance } = req.query;

    let query = supabaseAdmin
      .from('ar_invoices')
      .select('*, customer:customers!customer_id(id, name, phone)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }
    if (customer_id) query = query.eq('customer_id', customer_id);
    if (status) query = query.eq('status', status);
    if (is_opening_balance !== undefined) query = query.eq('is_opening_balance', is_opening_balance === 'true');

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, total: count, page, totalPages: Math.ceil(count / limit) });
  } catch (err) {
    logger.error({ err }, 'Error fetching AR invoices:');
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * GET /api/ar/aging
 * Access: manage_financials
 * NOTE: registered before /invoices/:id so "aging" is never captured as an :id param.
 */
router.get('/aging', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('ar_invoices')
      .select('id, invoice_number, total_amount, amount_paid, due_date, issued_date, customer:customers!customer_id(id, name, phone)')
      .in('status', ['sent', 'partial']);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const today = new Date();
    const buckets = { current: [], '1_30': [], '31_60': [], '61_90': [], over_90: [] };

    (data || []).forEach(inv => {
      const outstanding = Number(inv.total_amount) - Number(inv.amount_paid);
      const dueDate = inv.due_date
        ? new Date(inv.due_date)
        : new Date(new Date(inv.issued_date).getTime() + 30 * 24 * 60 * 60 * 1000);
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));

      const row = { ...inv, outstanding, days_overdue: daysOverdue };
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
    logger.error({ err }, 'Error fetching AR aging:');
    res.status(500).json({ error: 'Failed to fetch aging report' });
  }
});

/**
 * GET /api/ar/invoices/:id
 * Access: manage_financials
 */
router.get('/invoices/:id', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('ar_invoices')
      .select('*, customer:customers!customer_id(id, name, phone)')
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data: invoice, error } = await query.single();
    if (error || !invoice) return res.status(404).json({ error: 'Invoice not found' });

    const { data: payments, error: payErr } = await supabaseAdmin
      .from('ar_payments')
      .select('*')
      .eq('invoice_id', req.params.id)
      .order('created_at', { ascending: false });

    if (payErr) throw payErr;

    res.json({ ...invoice, payments: payments || [] });
  } catch (err) {
    logger.error({ err }, 'Error fetching AR invoice:');
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

/**
 * POST /api/ar/invoices
 * Access: manage_financials
 */
router.post('/invoices', authGuard, permissionCheck('manage_financials'), validateBody(invoiceSchema), async (req, res) => {
  try {
    const { customer_id, description, total_amount, due_date, is_opening_balance, as_of_date } = req.body;

    let custQuery = supabaseAdmin.from('customers').select('id, business_id').eq('id', customer_id);
    if (req.user.role !== 'Platform Admin') custQuery = custQuery.eq('business_id', req.user.business_id);
    const { data: customer, error: custErr } = await custQuery.single();
    if (custErr || !customer) return res.status(404).json({ error: 'Customer not found' });

    const business_id = req.user.role === 'Platform Admin' ? customer.business_id : req.user.business_id;

    const { data: invoiceNumber, error: numErr } = await supabaseAdmin.rpc('generate_ar_invoice_number', { p_business_id: business_id });
    if (numErr) throw numErr;

    const { data, error } = await supabaseAdmin
      .from('ar_invoices')
      .insert([{
        business_id,
        customer_id,
        invoice_number: invoiceNumber,
        description: description || null,
        total_amount,
        due_date: due_date || null,
        is_opening_balance: !!is_opening_balance,
        as_of_date: as_of_date || null,
        issued_date: as_of_date || new Date().toISOString().split('T')[0],
        created_by: req.user.id,
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, 'Error creating AR invoice:');
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

/**
 * POST /api/ar/invoices/:id/payments
 * Access: manage_financials
 */
router.post('/invoices/:id/payments', authGuard, permissionCheck('manage_financials'), validateBody(paymentSchema), async (req, res) => {
  try {
    const { amount, payment_method, payment_date, location_id, notes } = req.body;

    let invQuery = supabaseAdmin.from('ar_invoices').select('id, business_id, invoice_number, total_amount, amount_paid, status').eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') invQuery = invQuery.eq('business_id', req.user.business_id);
    const { data: invoice, error: invErr } = await invQuery.single();
    if (invErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (invoice.status === 'void') {
      return res.status(400).json({ error: 'Cannot record a payment against a voided invoice.' });
    }

    const outstanding = Number(invoice.total_amount) - Number(invoice.amount_paid);
    if (amount > outstanding) {
      return res.status(400).json({ error: `Payment of ${amount} exceeds outstanding balance of ${outstanding.toFixed(2)}.` });
    }

    const isCashier = req.user.role === 'Salesperson' || req.user.role === 'Cashier';
    const ledgerStatus = isCashier ? 'pending' : 'approved';
    const postToLedger = ['cash', 'mobile_money'].includes(payment_method);

    const { data, error } = await supabaseAdmin.rpc('record_ar_payment', {
      p_invoice_id: req.params.id,
      p_amount: amount,
      p_payment_method: payment_method,
      p_payment_date: payment_date || new Date().toISOString().split('T')[0],
      p_location_id: location_id || null,
      p_notes: notes || null,
      p_user_id: req.user.id,
      p_business_id: invoice.business_id,
      p_post_to_ledger: postToLedger,
      p_ledger_status: ledgerStatus,
    });

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, 'Error recording AR payment:');
    res.status(500).json({ error: err.message || 'Failed to record payment' });
  }
});

/**
 * PUT /api/ar/payments/:id/void
 * Access: manage_financials
 */
router.put('/payments/:id/void', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    let payQuery = supabaseAdmin.from('ar_payments').select('*').eq('id', req.params.id);
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

    const { data: invoice, error: invErr } = await supabaseAdmin
      .from('ar_invoices')
      .select('id, total_amount, amount_paid')
      .eq('id', payment.invoice_id)
      .single();
    if (invErr || !invoice) return res.status(404).json({ error: 'Related invoice not found' });

    const newAmountPaid = Math.max(0, Number(invoice.amount_paid) - Number(payment.amount));
    const newStatus = newAmountPaid <= 0 ? 'sent' : (newAmountPaid >= Number(invoice.total_amount) ? 'paid' : 'partial');

    await supabaseAdmin
      .from('ar_invoices')
      .update({ amount_paid: newAmountPaid, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', payment.invoice_id);

    const { data, error } = await supabaseAdmin
      .from('ar_payments')
      .update({ voided_at: new Date().toISOString(), voided_by: req.user.id })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error voiding AR payment:');
    res.status(500).json({ error: 'Failed to void payment' });
  }
});

/**
 * PUT /api/ar/invoices/:id/void
 * Access: manage_financials
 */
router.put('/invoices/:id/void', authGuard, permissionCheck('manage_financials'), async (req, res) => {
  try {
    let query = supabaseAdmin.from('ar_invoices').select('id, business_id, amount_paid').eq('id', req.params.id);
    if (req.user.role !== 'Platform Admin') query = query.eq('business_id', req.user.business_id);
    const { data: invoice, error: fetchErr } = await query.single();
    if (fetchErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (Number(invoice.amount_paid) > 0) {
      return res.status(400).json({ error: 'Cannot void an invoice with recorded payments; void the payments first.' });
    }

    const { data, error } = await supabaseAdmin
      .from('ar_invoices')
      .update({ status: 'void', updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err }, 'Error voiding AR invoice:');
    res.status(500).json({ error: 'Failed to void invoice' });
  }
});

module.exports = router;
