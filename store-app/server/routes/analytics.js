const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { apiCache } = require('../middleware/apiCache');
const { resolveCurrency } = require('../utils/currency');

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
router.get('/summary', authGuard, apiCache(60), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Today's Sales Total
    let salesQuery = supabaseAdmin
      .from('sales')
      .select('total_amount', { count: 'exact' })
      .gte('created_at', today.toISOString())
      .neq('status', 'voided');
    
    // 2. Total Products
    let productsQuery = supabaseAdmin
      .from('products')
      .select('id', { count: 'exact' });

    // 3. Alerts (Shrinkage). Low stock is NOT read from here — see below.
    let alertsQuery = supabaseAdmin
      .from('alerts')
      .select('type', { count: 'exact' });

    /* Low stock, counted from actual stock levels.
       It used to come from `alerts` rows of type 'LOW_STOCK', which the
       alerts CHECK constraint (migration 014) does not permit — it allows
       only VOID, DISCOUNT, SHRINKAGE and CASH_OVERRIDE. No such row could
       ever exist, so the tile was hard-wired to zero for every business
       since the day it shipped. Computing it live also keeps it in step
       with the Inventory page, which has always done it this way. */
    let lowStockQuery = supabaseAdmin
      .from('product_inventory')
      .select('quantity, low_stock_threshold, location_id, products!inner(business_id)');

    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
      productsQuery = productsQuery.eq('business_id', req.user.business_id);
      alertsQuery = alertsQuery.eq('business_id', req.user.business_id);
      lowStockQuery = lowStockQuery.eq('products.business_id', req.user.business_id);
    }

    salesQuery = applyLocationFilter(salesQuery, req);
    alertsQuery = applyLocationFilter(alertsQuery, req);
    lowStockQuery = applyLocationFilter(lowStockQuery, req);

    const [salesRes, productsRes, alertsRes, lowStockRes] = await Promise.all([
      salesQuery,
      productsQuery,
      alertsQuery,
      lowStockQuery
    ]);

    if (salesRes.error) throw salesRes.error;
    if (productsRes.error) throw productsRes.error;
    if (alertsRes.error) throw alertsRes.error;
    if (lowStockRes.error) throw lowStockRes.error;

    const todaySalesTotal = salesRes.data.reduce((sum, s) => sum + Number(s.total_amount), 0);
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
router.get('/sales-trend', authGuard, apiCache(60), async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    let salesQuery = supabaseAdmin
      .from('sales')
      .select('total_amount, created_at')
      .gte('created_at', sevenDaysAgo.toISOString())
      .neq('status', 'voided');

    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
    }
    salesQuery = applyLocationFilter(salesQuery, req);

    const { data, error } = await salesQuery;
    if (error) throw error;

    const trendMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      trendMap[dateStr] = 0;
    }

    data.forEach(sale => {
      const dateStr = new Date(sale.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (trendMap[dateStr] !== undefined) {
        trendMap[dateStr] += Number(sale.total_amount);
      }
    });

    const trendData = Object.keys(trendMap).map(date => ({
      date,
      revenue: trendMap[date]
    }));

    res.json(trendData);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching sales trend:');
    res.status(500).json({ error: 'Failed to fetch sales trend' });
  }
});

/**
 * GET /api/analytics/shrinkage
 */
router.get('/shrinkage', authGuard, apiCache(60), async (req, res) => {
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
router.get('/reconciliation', authGuard, apiCache(60), async (req, res) => {
  try {
    const dateParam = req.query.date;
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    let usersQuery = supabaseAdmin
      .from('users')
      .select('id, name, email, role_id, roles:role_id (name)');
      
    if (req.user.role !== 'Platform Admin') {
      usersQuery = usersQuery.eq('business_id', req.user.business_id);
    }

    let salesQuery = supabaseAdmin
      .from('sales')
      .select('id, salesperson_id, total_amount, discount_amount, status')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
    }
    salesQuery = applyLocationFilter(salesQuery, req);

    let shrinkageQuery = supabaseAdmin
      .from('stock_movements')
      .select('user_id, quantity_change, product:products!product_id(price)')
      .eq('movement_type', 'SHRINKAGE')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    if (req.user.role !== 'Platform Admin') {
      shrinkageQuery = shrinkageQuery.eq('business_id', req.user.business_id);
    }
    shrinkageQuery = applyLocationFilter(shrinkageQuery, req);

    const [usersRes, salesRes, shrinkageRes] = await Promise.all([
      usersQuery,
      salesQuery,
      shrinkageQuery
    ]);

    if (usersRes.error) throw usersRes.error;
    if (salesRes.error) throw salesRes.error;
    if (shrinkageRes.error) throw shrinkageRes.error;

    const users = usersRes.data;
    const sales = salesRes.data;
    const shrinkage = shrinkageRes.data;

    const reconciliationData = users.map(user => {
      const userSales = sales.filter(s => s.salesperson_id === user.id);
      const completedSales = userSales.filter(s => s.status !== 'voided');
      const voidedSales = userSales.filter(s => s.status === 'voided');

      const totalSalesRevenue = completedSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
      const totalDiscounts = completedSales.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0);
      const totalVoidValue = voidedSales.reduce((sum, s) => sum + Number(s.total_amount) + Number(s.discount_amount || 0), 0);

      const userShrinkage = shrinkage.filter(s => s.user_id === user.id);
      const totalShrinkageValue = userShrinkage.reduce((sum, s) => sum + (Math.abs(s.quantity_change) * (s.product?.price || 0)), 0);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.roles ? user.roles.name : 'Unknown',
        salesCount: completedSales.length,
        totalSalesRevenue,
        totalDiscounts,
        voidCount: voidedSales.length,
        totalVoidValue,
        shrinkageCount: userShrinkage.length,
        totalShrinkageValue
      };
    }).filter(data => data.salesCount > 0 || data.voidCount > 0 || data.shrinkageCount > 0);

    reconciliationData.sort((a, b) => b.totalSalesRevenue - a.totalSalesRevenue);

    res.json(reconciliationData);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching reconciliation data:');
    res.status(500).json({ error: 'Failed to fetch reconciliation data' });
  }
});

/**
 * GET /api/analytics/recent-activity
 */
router.get('/recent-activity', authGuard, apiCache(30), async (req, res) => {
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
       money ("GH₵248.50") with counts ("15 items") in one column — so the
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
    // to run a shop floor — a branch manager clearing "their" dashboard would
    // have destroyed the whole business's records.
    if (!['Platform Admin', 'Business Admin'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only Business Admins can reset dashboard data.'
      });
    }

    let salesIdQuery = supabaseAdmin.from('sales').select('id');
    if (req.user.role !== 'Platform Admin') {
      salesIdQuery = salesIdQuery.eq('business_id', req.user.business_id);
    }
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
    if (req.user.role !== 'Platform Admin') {
      salesDelQuery = salesDelQuery.eq('business_id', req.user.business_id);
    }
    salesDelQuery = applyLocationFilter(salesDelQuery, req);
    const { error: salesErr } = await salesDelQuery;
    if (salesErr) throw salesErr;

    let stockDelQuery = supabaseAdmin.from('stock_movements').delete();
    if (req.user.role !== 'Platform Admin') {
      stockDelQuery = stockDelQuery.eq('business_id', req.user.business_id);
    }
    stockDelQuery = applyLocationFilter(stockDelQuery, req);
    const { error: stockErr } = await stockDelQuery;
    if (stockErr) throw stockErr;

    let alertsDelQuery = supabaseAdmin.from('alerts').delete();
    if (req.user.role !== 'Platform Admin') {
      alertsDelQuery = alertsDelQuery.eq('business_id', req.user.business_id);
    }
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
router.get('/top-products', authGuard, apiCache(60), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let query = supabaseAdmin
      .from('sale_items')
      .select('quantity, unit_price, product:products!product_id(id, name)')
      .gte('created_at', thirtyDaysAgo.toISOString());

    // sale_items doesn't have business_id directly, so filter via sales join
    // Instead, query sales first to get IDs
    let salesQuery = supabaseAdmin
      .from('sales')
      .select('id')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .neq('status', 'voided');

    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
    }
    salesQuery = applyLocationFilter(salesQuery, req);

    const { data: salesIds } = await salesQuery;
    if (!salesIds || salesIds.length === 0) return res.json([]);

    const ids = salesIds.map(s => s.id);

    const { data: items, error } = await supabaseAdmin
      .from('sale_items')
      .select('quantity, unit_price, product:products!product_id(id, name)')
      .in('sale_id', ids);

    if (error) throw error;

    // Aggregate by product
    const productMap = {};
    (items || []).forEach(item => {
      const pId = item.product?.id;
      if (!pId) return;
      if (!productMap[pId]) {
        productMap[pId] = { name: item.product.name, revenue: 0, quantity: 0 };
      }
      productMap[pId].revenue += Number(item.quantity) * Number(item.unit_price);
      productMap[pId].quantity += Number(item.quantity);
    });

    const topProducts = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

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
router.get('/inventory-health', authGuard, apiCache(60), async (req, res) => {
  try {
    /* Stock lives in product_inventory, one row per product per location —
       `products` has no quantity column at all. This used to select
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
router.get('/staff-performance', authGuard, apiCache(60), async (req, res) => {
  try {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    let salesQuery = supabaseAdmin
      .from('sales')
      .select('salesperson_id, total_amount')
      .gte('created_at', weekStart.toISOString())
      .neq('status', 'voided');

    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
    }
    salesQuery = applyLocationFilter(salesQuery, req);

    const { data: sales, error: salesErr } = await salesQuery;
    if (salesErr) throw salesErr;

    // Get user names
    let usersQuery = supabaseAdmin.from('users').select('id, name, email');
    if (req.user.role !== 'Platform Admin') {
      usersQuery = usersQuery.eq('business_id', req.user.business_id);
    }
    const { data: users } = await usersQuery;

    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = u; });

    const staffMap = {};
    (sales || []).forEach(s => {
      const uid = s.salesperson_id;
      if (!uid) return;
      if (!staffMap[uid]) {
        const user = userMap[uid] || {};
        staffMap[uid] = { name: user.name || 'Unknown', email: user.email || '', sales: 0, revenue: 0 };
      }
      staffMap[uid].sales += 1;
      staffMap[uid].revenue += Number(s.total_amount);
    });

    const performance = Object.values(staffMap)
      .sort((a, b) => b.revenue - a.revenue)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

    res.json(performance);
  } catch (err) {
    logger.error({ err }, 'Staff performance error');
    res.status(500).json({ error: 'Failed to fetch staff performance' });
  }
});

module.exports = router;
