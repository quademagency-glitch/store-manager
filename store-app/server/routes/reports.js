const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

// ============================================
// P&L REPORT
// ============================================

/**
 * GET /api/reports/pnl
 * Profit & Loss aggregation
 * Query params: startDate, endDate, locationId
 */
router.get('/pnl', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const businessId = req.user.business_id;

    // 1. Revenue — sum of finalized sales
    let salesQuery = supabaseAdmin
      .from('sales')
      .select('total_amount, sale_items:sale_items(quantity, unit_price, product:products!product_id(cost_price))')
      .eq('business_id', businessId)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (locationId) salesQuery = salesQuery.eq('location_id', locationId);

    const { data: sales, error: salesErr } = await salesQuery;
    if (salesErr) throw salesErr;

    let revenue = 0;
    let cogs = 0;

    (sales || []).forEach(sale => {
      revenue += Number(sale.total_amount || 0);
      (sale.sale_items || []).forEach(item => {
        const costPrice = Number(item.product?.cost_price || 0);
        const qty = Number(item.quantity || 0);
        cogs += costPrice * qty;
      });
    });

    const grossProfit = revenue - cogs;

    // 2. Expenses — from business_ledger entries of type 'expense'
    let expenseQuery = supabaseAdmin
      .from('business_ledger')
      .select('amount')
      .eq('business_id', businessId)
      .eq('entry_type', 'expense')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (locationId) expenseQuery = expenseQuery.eq('location_id', locationId);

    const { data: expenses, error: expErr } = await expenseQuery;
    if (expErr) throw expErr;

    const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // 3. Commission payouts (from commission_ledger)
    let commQuery = supabaseAdmin
      .from('commission_ledger')
      .select('amount')
      .eq('business_id', businessId)
      .not('paid_at', 'is', null)
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    const { data: commissions } = await commQuery;
    const totalCommissions = (commissions || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);

    const netProfit = grossProfit - totalExpenses - totalCommissions;

    res.json({
      period: { startDate, endDate, locationId: locationId || null },
      revenue: Math.round(revenue * 100) / 100,
      cogs: Math.round(cogs * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      expenses: Math.round(totalExpenses * 100) / 100,
      commissions: Math.round(totalCommissions * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      grossMargin: revenue > 0 ? Math.round((grossProfit / revenue) * 10000) / 100 : 0,
      netMargin: revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0,
    });
  } catch (err) {
    logger.error({ err }, 'P&L report error');
    res.status(500).json({ error: 'Failed to generate P&L report' });
  }
});

// ============================================
// AR AGING REPORT
// ============================================

/**
 * GET /api/reports/ar-aging
 * Accounts Receivable aging buckets
 */
router.get('/ar-aging', authGuard, permissionCheck('manage_business'), async (req, res) => {
  try {
    const businessId = req.user.business_id;

    const { data: invoices, error } = await supabaseAdmin
      .from('ar_invoices')
      .select(`
        id, invoice_number, customer_id, total_amount, amount_paid, status, due_date, issued_date,
        customer:customers!customer_id(id, name, email, phone)
      `)
      .eq('business_id', businessId)
      .in('status', ['sent', 'overdue', 'partial']);

    if (error) throw error;

    const now = new Date();
    const aging = {
      current: [],
      days_30: [],
      days_60: [],
      days_90_plus: [],
    };

    let totalOutstanding = 0;

    (invoices || []).forEach(inv => {
      const outstanding = Number(inv.total_amount) - Number(inv.amount_paid || 0);
      if (outstanding <= 0) return;
      totalOutstanding += outstanding;

      const dueDate = new Date(inv.due_date);
      const daysPast = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

      const entry = {
        ...inv,
        outstanding: Math.round(outstanding * 100) / 100,
        days_overdue: Math.max(0, daysPast),
      };

      if (daysPast <= 0) aging.current.push(entry);
      else if (daysPast <= 30) aging.days_30.push(entry);
      else if (daysPast <= 60) aging.days_60.push(entry);
      else aging.days_90_plus.push(entry);
    });

    const summary = {
      current: aging.current.reduce((s, e) => s + e.outstanding, 0),
      days_30: aging.days_30.reduce((s, e) => s + e.outstanding, 0),
      days_60: aging.days_60.reduce((s, e) => s + e.outstanding, 0),
      days_90_plus: aging.days_90_plus.reduce((s, e) => s + e.outstanding, 0),
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      invoiceCount: (invoices || []).length,
    };

    res.json({ aging, summary });
  } catch (err) {
    logger.error({ err }, 'AR aging report error');
    res.status(500).json({ error: 'Failed to generate AR aging report' });
  }
});

module.exports = router;
