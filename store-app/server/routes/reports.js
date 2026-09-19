const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const { reportRange, applyReportRange } = require('../utils/reportDates');
const { ageInvoices, OPEN_AR_STATUSES } = require('../utils/arAging');
const { fetchAllRows } = require('../utils/fetchAllRows');

const router = express.Router();

// ============================================
// P&L REPORT
// ============================================

/**
 * GET /api/reports/pnl
 * Profit & Loss aggregation
 * Query params: startDate, endDate, locationId
 */
router.get('/pnl', authGuard, permissionCheck('view_financial_reports'), async (req, res) => {
  try {
    const { startDate, endDate, locationId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const range = reportRange(startDate, endDate);
    const businessId = req.user.business_id;
    const scoped = query => {
      query = query.eq('business_id', businessId);
      if (locationId) query = query.eq('location_id', locationId);
      return applyReportRange(query, range).order('id');
    };
    const [sales, expenses, commissions, returns] = await Promise.all([
      fetchAllRows(() => scoped(supabaseAdmin.from('sales')
        .select('id, total_amount, tax_amount, sale_items(quantity, unit_cost, cost_basis)')
        .in('status', ['completed', 'void_pending']))),
      fetchAllRows(() => scoped(supabaseAdmin.from('business_ledger')
        .select('id, amount, commission_payouts:commission_ledger!payout_ledger_id(id)')
        .eq('type', 'expense').eq('status', 'approved'))),
      fetchAllRows(() => {
        let query = supabaseAdmin.from('commission_ledger')
          .select('id, amount, payout_ledger_id, sale:sales!sale_id!inner(location_id)')
          .eq('business_id', businessId).not('paid_at', 'is', null);
        if (locationId) query = query.eq('sale.location_id', locationId);
        return applyReportRange(query, range, 'paid_at').order('id');
      }),
      fetchAllRows(() => scoped(supabaseAdmin.from('returns')
        .select('id, total_refund_amount, sale:sales!original_sale_id(total_amount, tax_amount), return_items(quantity, sale_item:sale_items!sale_item_id(unit_cost, cost_basis))'))),
    ]);

    let revenue = 0;
    let cogs = 0;
    let estimatedCostItems = 0;
    let missingCostItems = 0;
    const itemCost = (item, quantity) => {
      if (item?.unit_cost == null) missingCostItems += 1;
      else if (item.cost_basis !== 'recorded') estimatedCostItems += 1;
      return Number(item?.unit_cost || 0) * Number(quantity);
    };
    for (const sale of sales) {
      revenue += Number(sale.total_amount || 0) - Number(sale.tax_amount || 0);
      for (const item of sale.sale_items || []) cogs += itemCost(item, item.quantity);
    }
    let refunds = 0;
    for (const returned of returns) {
      const gross = Number(returned.sale?.total_amount || 0);
      const taxShare = gross > 0 ? Number(returned.sale?.tax_amount || 0) / gross : 0;
      const refund = Number(returned.total_refund_amount || 0) * (1 - taxShare);
      refunds += refund;
      revenue -= refund;
      for (const item of returned.return_items || []) cogs -= itemCost(item.sale_item, item.quantity);
    }
    // Commission payouts are posted to the ledger too. Count the expense once,
    // under its own statement line; other approved expenses stay operating costs.
    const totalExpenses = expenses.filter(e => !e.commission_payouts?.length)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalCommissions = commissions.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - totalExpenses - totalCommissions;

    res.json({
      period: { startDate, endDate, locationId: locationId || null },
      generatedAt: new Date().toISOString(),
      refunds: Math.round(refunds * 100) / 100,
      costQuality: { estimatedItems: estimatedCostItems, missingItems: missingCostItems },
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
    res.status(err.status === 400 ? 400 : 500).json({ error: err.status === 400 ? err.message : 'Failed to generate P&L report' });
  }
});

// ============================================
// AR AGING REPORT
// ============================================

/**
 * GET /api/reports/ar-aging
 * Accounts Receivable aging buckets
 */
router.get('/ar-aging', authGuard, permissionCheck('view_financial_reports'), async (req, res) => {
  try {
    const businessId = req.user.business_id;

    const invoices = await fetchAllRows(() => supabaseAdmin
      .from('ar_invoices')
      .select('id, invoice_number, customer_id, total_amount, amount_paid, status, due_date, issued_date, customer:customers!customer_id(id, name, email, phone)')
      .eq('business_id', businessId).in('status', OPEN_AR_STATUSES).order('id'));
    const { buckets, totals, asOf } = ageInvoices(invoices);
    const mapping = { current: 'current', days_30: '1_30', days_60: '31_60', days_90: '61_90', days_90_plus: 'over_90' };
    const aging = Object.fromEntries(Object.entries(mapping).map(([key, source]) => [key, buckets[source]]));
    const summary = Object.fromEntries(Object.entries(mapping).map(([key, source]) => [key, totals[source]]));
    summary.totalOutstanding = Math.round(Object.values(totals).reduce((a, b) => a + b, 0) * 100) / 100;
    summary.invoiceCount = Object.values(buckets).reduce((sum, rows) => sum + rows.length, 0);
    res.json({ aging, summary, asOf });
  } catch (err) {
    logger.error({ err }, 'AR aging report error');
    res.status(500).json({ error: 'Failed to generate AR aging report' });
  }
});

module.exports = router;
