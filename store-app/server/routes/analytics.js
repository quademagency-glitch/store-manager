const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { apiCache } = require('../middleware/apiCache');
const { resolveCurrency } = require('../utils/currency');
const { reportRange, applyReportRange } = require('../utils/reportDates');
const { fetchAllRows } = require('../utils/fetchAllRows');
const { loadSettledMoney, saleCash, refundCash, roundMoney } = require('../utils/settledMoney');

const router = express.Router();

function applyLocationFilter(query, req) {
  if (req.user.active_location_id) {
    return query.eq('location_id', req.user.active_location_id);
  } else if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
    if (req.user.location_ids && req.user.location_ids.length > 0) {
      return query.in('location_id', req.user.location_ids);
    } else {
      return query.eq('location_id', '00000000-0000-0000-0000-000000000000');
    }
  }
  return query;
}

/**
 * GET /api/analytics/summary
 * Fetch high-level stats for the Dashboard.
 */
router.get('/summary', authGuard, permissionCheck('view_analytics', 'view_sales', 'manage_business'), apiCache(60), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const moneyPromise = loadSettledMoney(supabaseAdmin, req.user, reportRange(today, today));

    // 2. Total Products
    let productsQuery = supabaseAdmin
      .from('products')
      .select('id', { count: 'exact' });

    // 3. Alerts (Shrinkage). Low stock is NOT read from here, see below.
    let alertsQuery = supabaseAdmin
      .from('alerts')
      .select('type', { count: 'exact' });

    /* Low stock, counted from actual stock levels.
       It used to come from `alerts` rows of type 'LOW_STOCK', which the
       alerts CHECK constraint (migration 014) does not permit, it allows
       only VOID, DISCOUNT, SHRINKAGE and CASH_OVERRIDE. No such row could
       ever exist, so the tile was hard-wired to zero for every business
       since the day it shipped. Computing it live also keeps it in step
       with the Inventory page, which has always done it this way. */
    let lowStockQuery = supabaseAdmin
      .from('product_inventory')
      .select('quantity, low_stock_threshold, location_id, products!inner(business_id)');

    if (req.user.role !== 'Platform Admin') {
      productsQuery = productsQuery.eq('business_id', req.user.business_id);
      alertsQuery = alertsQuery.eq('business_id', req.user.business_id);
      lowStockQuery = lowStockQuery.eq('products.business_id', req.user.business_id);
    }

    alertsQuery = applyLocationFilter(alertsQuery, req);
    lowStockQuery = applyLocationFilter(lowStockQuery, req);

    const [money, productsRes, alertsRes, lowStockRes] = await Promise.all([
      moneyPromise,
      productsQuery,
      alertsQuery,
      lowStockQuery
    ]);

    if (productsRes.error) throw productsRes.error;
    if (alertsRes.error) throw alertsRes.error;
    if (lowStockRes.error) throw lowStockRes.error;

    const todaySalesTotal = roundMoney(money.sales.reduce((sum, s) => sum + Number(s.total_amount), 0) - money.refunds.reduce((sum, r) => sum + Number(r.total_refund_amount), 0));
    const totalProducts = productsRes.count || 0;

    const lowStockCount = (lowStockRes.data || []).filter(
      row => Number(row.quantity || 0) <= Number(row.low_stock_threshold ?? 5)
    ).length;

    let theftAlertsCount = 0;
    alertsRes.data.forEach(a => {
      if (a.type === 'SHRINKAGE') theftAlertsCount++;
    });

    res.json({
      todaySalesTotal,
      totalProducts,
      lowStockCount,
      theftAlertsCount
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching analytics summary:');
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
});

/**
 * GET /api/analytics/sales-trend
 * Fetch the last 7 days of sales
 */
router.get('/sales-trend', authGuard, permissionCheck('view_analytics', 'manage_business'), apiCache(60), async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0,10);
    const start = new Date(Date.parse(today)-6*86400000).toISOString().slice(0,10);
    const {sales,refunds}=await loadSettledMoney(supabaseAdmin,req.user,reportRange(start,today));
    const buckets=Object.fromEntries(Array.from({length:7},(_,i)=>[new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10),0]));
    for(const sale of sales) { const day=sale.accounting_at?.slice(0,10); if(day in buckets) buckets[day]+=Number(sale.total_amount); }
    for(const refund of refunds) { const day=refund.created_at?.slice(0,10); if(day in buckets) buckets[day]-=Number(refund.total_refund_amount); }
    const trendData=Object.entries(buckets).map(([day,total])=>({date:new Date(day).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}),revenue:roundMoney(total)}));

    res.json(trendData);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching sales trend:');
    res.status(500).json({ error: 'Failed to fetch sales trend' });
  }
});

/**
 * GET /api/analytics/shrinkage
 */
router.get('/shrinkage', authGuard, permissionCheck('view_analytics', 'view_shrinkage_report'), apiCache(60), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('stock_movements')
      .select(`
        *,
        product:products!product_id(id, name, sku, price),
        user:users!user_id(id, name, email)
      `)
      .eq('movement_type', 'SHRINKAGE')
      .order('created_at', { ascending: false });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }
    query = applyLocationFilter(query, req);

    const { data, error } = await query;
    if (error) throw error;

    const formattedData = data.map(movement => ({
      ...movement,
      value_lost: Math.abs(movement.quantity_change) * (movement.product?.price || 0)
    }));

    res.json(formattedData);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching shrinkage events:');
    res.status(500).json({ error: 'Failed to fetch shrinkage events' });
  }
});

/**
 * GET /api/analytics/reconciliation
 */
router.get('/reconciliation', authGuard, permissionCheck('manage_reconciliation'), apiCache(60), async (req, res) => {
  try {
    const day=req.query.date || new Date().toISOString().slice(0,10),range=reportRange(day,day);
    const [{sales,refunds},users,voided,shrinkage]=await Promise.all([
      loadSettledMoney(supabaseAdmin,req.user,range),
      fetchAllRows(()=>supabaseAdmin.from('users').select('id,name,email,roles:role_id(name)').eq('business_id',req.user.business_id).order('id')),
      fetchAllRows(()=>applyReportRange(applyLocationFilter(supabaseAdmin.from('sales').select('id,salesperson_id,total_amount,discount_amount').eq('business_id',req.user.business_id).eq('status','voided'),req),range).order('id')),
      fetchAllRows(()=>applyReportRange(applyLocationFilter(supabaseAdmin.from('stock_movements').select('id,user_id,quantity_change,product:products!product_id(price)').eq('business_id',req.user.business_id).eq('movement_type','SHRINKAGE'),req),range).order('id')),
    ]);
    const members=new Map(users.map(u=>[u.id,u]));
    for(const id of [...sales.map(s=>s.salesperson_id),...refunds.map(r=>r.sale?.salesperson_id)]) if(id&&!members.has(id)) members.set(id,{id,name:'Former staff'});
    const reconciliationData=[...members.values()].map(user=>{
      const paid=sales.filter(s=>s.salesperson_id===user.id),returned=refunds.filter(r=>r.sale?.salesperson_id===user.id);
      const cancelled=voided.filter(s=>s.salesperson_id===user.id),lost=shrinkage.filter(s=>s.user_id===user.id);
      return {id:user.id,name:user.name,email:user.email,role:user.roles?.name || 'Former staff',salesCount:paid.length,
        totalSalesRevenue:roundMoney(paid.reduce((n,s)=>n+Number(s.total_amount),0)-returned.reduce((n,r)=>n+Number(r.total_refund_amount),0)),
        cashReceived:roundMoney(paid.reduce((n,s)=>n+saleCash(s),0)),cashRefunds:roundMoney(returned.reduce((n,r)=>n+refundCash(r),0)),
        netCash:roundMoney(paid.reduce((n,s)=>n+saleCash(s),0)-returned.reduce((n,r)=>n+refundCash(r),0)),
        totalRefunds:roundMoney(returned.reduce((n,r)=>n+Number(r.total_refund_amount),0)),refundCount:returned.length,
        estimatedCashEntries:paid.filter(s=>s.payment_method==='cash'&&s.cash_received==null).length+returned.filter(r=>r.cash_refund_amount==null).length,
        totalDiscounts:roundMoney(paid.reduce((n,s)=>n+Number(s.discount_amount || 0),0)),voidCount:cancelled.length,
        totalVoidValue:roundMoney(cancelled.reduce((n,s)=>n+Number(s.total_amount),0)),shrinkageCount:lost.length,
        totalShrinkageValue:roundMoney(lost.reduce((n,s)=>n+Math.abs(Number(s.quantity_change))*Number(s.product?.price || 0),0))};
    }).filter(r=>r.salesCount||r.refundCount||r.voidCount||r.shrinkageCount).sort((a,b)=>b.totalSalesRevenue-a.totalSalesRevenue);

    res.json(reconciliationData);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching reconciliation data:');
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to fetch reconciliation data' });
  }
});

/**
 * GET /api/analytics/recent-activity
 */
router.get('/recent-activity', authGuard, permissionCheck('view_analytics', 'view_sales', 'manage_business'), apiCache(30), async (req, res) => {
  try {
    let salesQuery = supabaseAdmin
      .from('sales')
      .select('id, created_at, total_amount, status')
      .order('created_at', { ascending: false })
      .limit(10);

    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
    }
    salesQuery = applyLocationFilter(salesQuery, req);

    let stockQuery = supabaseAdmin
      .from('stock_movements')
      .select('id, created_at, movement_type, quantity_change, product:products!product_id(name)')
      .in('movement_type', ['SHRINKAGE', 'RETURN'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (req.user.role !== 'Platform Admin') {
      stockQuery = stockQuery.eq('business_id', req.user.business_id);
    }
    stockQuery = applyLocationFilter(stockQuery, req);

    const [salesRes, movementsRes] = await Promise.all([
      salesQuery,
      stockQuery
    ]);

    if (salesRes.error) throw salesRes.error;
    if (movementsRes.error) throw movementsRes.error;

    const sales = salesRes.data;
    const movements = movementsRes.data;

    /* `amount` is a display string, not a number, because the feed mixes
       money ("GH₵248.50") with counts ("15 items") in one column, so the
       client cannot format it and the currency has to be applied here.
       It was hardcoded to `$`, which is why a Ghanaian shop's activity feed
       contradicted every other figure on its own dashboard.
       resolveCurrency is the same helper /businesses/me uses, so the feed
       follows the active location's override exactly as the rest of the app
       does. */
    const currency = await resolveCurrency(
      supabaseAdmin,
      req.user.business_id,
      req.user.active_location_id,
    );
    const money = new Intl.NumberFormat('en-GH', { style: 'currency', currency });

    const formattedSales = sales.map(s => ({
      id: s.id,
      type: 'sale',
      title: s.status === 'voided' ? 'Sale Voided' : 'New Sale Completed',
      time: s.created_at,
      amount: money.format(Number(s.total_amount) || 0),
      status: s.status === 'voided' ? 'error' : 'success',
      timestamp: new Date(s.created_at).getTime()
    }));

    const formattedMovements = movements.map(m => ({
      id: m.id,
      type: 'stock',
      title: m.movement_type === 'SHRINKAGE' ? `Shrinkage: ${m.product?.name}` : `Return: ${m.product?.name}`,
      time: m.created_at,
      amount: `${Math.abs(m.quantity_change)} items`,
      status: m.movement_type === 'SHRINKAGE' ? 'error' : 'warning',
      timestamp: new Date(m.created_at).getTime()
    }));

    const combined = [...formattedSales, ...formattedMovements]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    res.json(combined);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching recent activity:');
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
});

/**
 * DELETE /api/analytics/reset
 * Permanently wipe sales, returns, stock movements, and alerts for the
 * caller's business/location. Inventory levels are left untouched.
 */
router.delete('/reset', authGuard, async (req, res) => {
  try {
    // Admins only. Managers were permitted here originally, which put an
    // irreversible wipe of the entire sales history behind a role that exists
    // to run a shop floor, a branch manager clearing "their" dashboard would
    // have destroyed the whole business's records.
    if (!['Platform Admin', 'Business Admin'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only Business Admins can reset dashboard data.'
      });
    }
    /* Always the caller's own business. Until 8 October 2026 a Platform Admin
       with no branch selected skipped the business filter, so one click
       deleted every business's sales. */
    if (!req.user.business_id) return res.status(400).json({ error: 'No business to reset.' });

    let salesIdQuery = supabaseAdmin.from('sales').select('id');
    salesIdQuery = salesIdQuery.eq('business_id', req.user.business_id);
    salesIdQuery = applyLocationFilter(salesIdQuery, req);
    const { data: salesRows, error: salesIdErr } = await salesIdQuery;
    if (salesIdErr) throw salesIdErr;

    const saleIds = salesRows.map(s => s.id);
    if (saleIds.length > 0) {
      // returns.original_sale_id has no ON DELETE CASCADE, so it must be
      // cleared before the parent sales rows can be deleted.
      const { error: returnsErr } = await supabaseAdmin
        .from('returns')
        .delete()
        .in('original_sale_id', saleIds);
      if (returnsErr) throw returnsErr;
    }

    let salesDelQuery = supabaseAdmin.from('sales').delete();
    salesDelQuery = salesDelQuery.eq('business_id', req.user.business_id);
    salesDelQuery = applyLocationFilter(salesDelQuery, req);
    const { error: salesErr } = await salesDelQuery;
    if (salesErr) throw salesErr;

    let stockDelQuery = supabaseAdmin.from('stock_movements').delete();
    stockDelQuery = stockDelQuery.eq('business_id', req.user.business_id);
    stockDelQuery = applyLocationFilter(stockDelQuery, req);
    const { error: stockErr } = await stockDelQuery;
    if (stockErr) throw stockErr;

    let alertsDelQuery = supabaseAdmin.from('alerts').delete();
    alertsDelQuery = alertsDelQuery.eq('business_id', req.user.business_id);
    alertsDelQuery = applyLocationFilter(alertsDelQuery, req);
    const { error: alertsErr } = await alertsDelQuery;
    if (alertsErr) throw alertsErr;

    res.json({ message: 'Dashboard data reset successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error resetting dashboard data:');
    res.status(500).json({ error: 'Failed to reset dashboard data' });
  }
});

/**
 * GET /api/analytics/top-products
 * Top 5 products by revenue this month
 */
router.get('/top-products', authGuard, permissionCheck('view_analytics'), apiCache(60), async (req, res) => {
  try {
    const start=new Date(Date.now()-30*86400000).toISOString();
    const {sales,refunds}=await loadSettledMoney(supabaseAdmin,req.user,reportRange(start,null),{items:true});
    const productMap={};
    const add=(product,qty,amount)=>{if(!product?.id)return;const row=productMap[product.id] ||= {name:product.name,quantity:0,revenue:0};row.quantity+=qty;row.revenue+=amount;};
    for(const sale of sales){
      const lines=[...(sale.sale_items || [])].sort((a,b)=>a.id.localeCompare(b.id));
      const weight=lines.reduce((n,i)=>n+Number(i.quantity)*Number(i.unit_price),0);let running=0,allocated=0;
      for(const item of lines){running+=Number(item.quantity)*Number(item.unit_price);const next=weight?roundMoney(Number(sale.total_amount)*running/weight):0;add(item.product,Number(item.quantity),next-allocated);allocated=next;}
    }
    for(const refund of refunds) for(const item of refund.return_items || []) add(item.sale_item?.product,-Number(item.quantity),-Number(item.refund_amount || 0));
    const topProducts=Object.values(productMap).sort((a,b)=>b.revenue-a.revenue).slice(0,5).map(p=>({...p,revenue:roundMoney(p.revenue)}));

    res.json(topProducts);
  } catch (err) {
    logger.error({ err }, 'Top products error');
    res.status(500).json({ error: 'Failed to fetch top products' });
  }
});

/**
 * GET /api/analytics/inventory-health
 * Stock status counts: in-stock, low-stock, out-of-stock
 */
router.get('/inventory-health', authGuard, permissionCheck('view_analytics'), apiCache(60), async (req, res) => {
  try {
    /* Stock lives in product_inventory, one row per product per location, `products` has no quantity column at all. This used to select
       `stock_quantity, min_stock_level` from products, which meant the
       endpoint threw for every business on every call and the chart has
       never rendered. Counting per stock row (rather than per product) is
       also the more useful answer for a multi-branch business: a product
       can be healthy at one branch and out at another. */
    let query = supabaseAdmin
      .from('product_inventory')
      .select('quantity, low_stock_threshold, location_id, products!inner(business_id)');

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('products.business_id', req.user.business_id);
    }
    query = applyLocationFilter(query, req);

    const { data, error } = await query;
    if (error) throw error;

    let inStock = 0, lowStock = 0, outOfStock = 0;
    (data || []).forEach(row => {
      const qty = Number(row.quantity || 0);
      const threshold = Number(row.low_stock_threshold ?? 5);
      if (qty <= 0) outOfStock++;
      else if (qty <= threshold) lowStock++;
      else inStock++;
    });

    res.json([
      { name: 'In Stock', value: inStock, fill: '#10b981' },
      { name: 'Low Stock', value: lowStock, fill: '#f59e0b' },
      { name: 'Out of Stock', value: outOfStock, fill: '#ef4444' },
    ]);
  } catch (err) {
    logger.error({ err }, 'Inventory health error');
    res.status(500).json({ error: 'Failed to fetch inventory health' });
  }
});

/**
 * GET /api/analytics/staff-performance
 * Per-salesperson metrics this week
 */
router.get('/staff-performance', authGuard, permissionCheck('view_analytics'), apiCache(60), async (req, res) => {
  try {
    const weekStart=new Date();weekStart.setUTCDate(weekStart.getUTCDate()-weekStart.getUTCDay());weekStart.setUTCHours(0,0,0,0);
    const [{sales,refunds},users]=await Promise.all([
      loadSettledMoney(supabaseAdmin,req.user,reportRange(weekStart.toISOString(),null)),
      fetchAllRows(()=>supabaseAdmin.from('users').select('id,name,email').eq('business_id',req.user.business_id).order('id')),
    ]);
    const userMap=Object.fromEntries(users.map(u=>[u.id,u])),staffMap={};
    const row=id=>staffMap[id] ||= {name:userMap[id]?.name || 'Former staff',email:userMap[id]?.email || '',sales:0,revenue:0};
    for(const sale of sales){const r=row(sale.salesperson_id);r.sales++;r.revenue+=Number(sale.total_amount);}
    for(const refund of refunds){const r=row(refund.sale?.salesperson_id);r.revenue-=Number(refund.total_refund_amount);}
    const performance=Object.values(staffMap).sort((a,b)=>b.revenue-a.revenue).map(p=>({...p,revenue:roundMoney(p.revenue)}));

    res.json(performance);
  } catch (err) {
    logger.error({ err }, 'Staff performance error');
    res.status(500).json({ error: 'Failed to fetch staff performance' });
  }
});

module.exports = router;
