const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

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
router.get('/summary', authGuard, async (req, res) => {
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

    // 3. Alerts (Low Stock & Shrinkage)
    let alertsQuery = supabaseAdmin
      .from('alerts')
      .select('type', { count: 'exact' });

    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
      productsQuery = productsQuery.eq('business_id', req.user.business_id);
      alertsQuery = alertsQuery.eq('business_id', req.user.business_id);
    }
    
    salesQuery = applyLocationFilter(salesQuery, req);
    alertsQuery = applyLocationFilter(alertsQuery, req);

    const [salesRes, productsRes, alertsRes] = await Promise.all([
      salesQuery,
      productsQuery,
      alertsQuery
    ]);

    if (salesRes.error) throw salesRes.error;
    if (productsRes.error) throw productsRes.error;
    if (alertsRes.error) throw alertsRes.error;

    const todaySalesTotal = salesRes.data.reduce((sum, s) => sum + Number(s.total_amount), 0);
    const totalProducts = productsRes.count || 0;
    
    let lowStockCount = 0;
    let theftAlertsCount = 0;
    alertsRes.data.forEach(a => {
      if (a.type === 'LOW_STOCK') lowStockCount++;
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
router.get('/sales-trend', authGuard, async (req, res) => {
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
router.get('/shrinkage', authGuard, async (req, res) => {
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
router.get('/reconciliation', authGuard, async (req, res) => {
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
router.get('/recent-activity', authGuard, async (req, res) => {
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

    const formattedSales = sales.map(s => ({
      id: s.id,
      type: 'sale',
      title: s.status === 'voided' ? 'Sale Voided' : 'New Sale Completed',
      time: s.created_at,
      amount: `$${Number(s.total_amount).toFixed(2)}`,
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

module.exports = router;
