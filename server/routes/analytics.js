const express = require('express');
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
 * Access: All authenticated staff
 */
router.get('/summary', authGuard, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Today's Sales Total
    let salesQuery = supabaseAdmin
      .from('sales')
      .select('total_amount')
      .gte('created_at', today.toISOString());
    
    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
    }
    salesQuery = applyLocationFilter(salesQuery, req);

    // Run queries in parallel to speed up the dashboard
    const [salesRes, invRes, shrinkageRes] = await Promise.all([
      salesQuery,
      inventoryQuery,
      shrinkageQuery
    ]);

    if (salesRes.error) throw salesRes.error;
    if (invRes.error) throw invRes.error;
    if (shrinkageRes.error) throw shrinkageRes.error;

    const todaysSales = salesRes.data;
    const inventory = invRes.data;
    const shrinkageCount = shrinkageRes.count;

    res.json({
      todaySalesTotal,
      totalProducts,
      lowStockCount,
      theftAlertsCount: shrinkageCount || 0
    });
  } catch (err) {
    console.error('Error fetching analytics summary:', err);
    res.status(500).json({ error: 'Failed to fetch analytics summary' });
  }
});

/**
 * GET /api/analytics/shrinkage
 */
router.get('/shrinkage', authGuard, permissionCheck('view_analytics'), async (req, res) => {
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
    console.error('Error fetching shrinkage events:', err);
    res.status(500).json({ error: 'Failed to fetch shrinkage events' });
  }
});

/**
 * GET /api/analytics/reconciliation
 */
router.get('/reconciliation', authGuard, permissionCheck('view_analytics'), async (req, res) => {
  try {
    const dateParam = req.query.date;
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Fetch users in the same business/locations
    let usersQuery = supabaseAdmin
      .from('users')
      .select(`
        id,
        name,
        email,
        role_id,
        roles:role_id (name)
      `);
      
    if (req.user.role !== 'Platform Admin') {
      usersQuery = usersQuery.eq('business_id', req.user.business_id);
    }
    // Fetch all required data in parallel
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

    // 4. Group data by user
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
    }).filter(data => data.salesCount > 0 || data.voidCount > 0 || data.shrinkageCount > 0); // Only return active users

    reconciliationData.sort((a, b) => b.totalSalesRevenue - a.totalSalesRevenue);

    res.json(reconciliationData);
  } catch (err) {
    console.error('Error fetching reconciliation data:', err);
    res.status(500).json({ error: 'Failed to fetch reconciliation data' });
  }
});

/**
 * GET /api/analytics/recent-activity
 * Fetch the 10 most recent stock movements and sales
 */
router.get('/recent-activity', authGuard, async (req, res) => {
  try {
    // 1. Fetch recent sales
    let salesQuery = supabaseAdmin
      .from('sales')
      .select('id, created_at, total_amount, status')
      .order('created_at', { ascending: false })
      .limit(10);
      
    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
    }
    salesQuery = applyLocationFilter(salesQuery, req);

    // Fetch both datasets concurrently
    const [salesRes, movementsRes] = await Promise.all([
      salesQuery,
      stockQuery
    ]);

    if (salesRes.error) throw salesRes.error;
    if (movementsRes.error) throw movementsRes.error;

    const sales = salesRes.data;
    const movements = movementsRes.data;

    // 3. Format and combine
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

    // Merge, sort, and slice to top 10
    const combined = [...formattedSales, ...formattedMovements]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    // Format 'time' to relative string for UI (e.g. '10 mins ago') - simplified for now, UI can format if needed, but we'll return ISO and let UI format it or we can format it here.
    // Actually, UI `time` string is used directly. We'll leave `time` as ISO string and let the frontend format it or just return ISO.
    
    res.json(combined);
  } catch (err) {
    console.error('Error fetching recent activity:', err);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
});

/**
 * DELETE /api/analytics/reset
 * Wipes sales, sale_items, stock_movements, alerts for the business
 * Access: Business Admin and Manager
 */
router.delete('/reset', authGuard, async (req, res) => {
  try {
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Manager' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Unauthorized to reset dashboard.' });
    }

    const business_id = req.user.business_id;

    // Build the base query for deletion using business_id
    // This removes all sales records (which cascade to sale_items if set up correctly)
    const { error: salesError } = await supabaseAdmin
      .from('sales')
      .delete()
      .eq('business_id', business_id);

    if (salesError) throw salesError;

    // Delete all stock movements
    const { error: movementsError } = await supabaseAdmin
      .from('stock_movements')
      .delete()
      .eq('business_id', business_id);

    if (movementsError) throw movementsError;

    // Delete all alerts
    const { error: alertsError } = await supabaseAdmin
      .from('alerts')
      .delete()
      .eq('business_id', business_id);

    if (alertsError) throw alertsError;

    // NOTE: This does NOT reset inventory quantities (product_inventory table)
    // It only resets the historical transaction records that feed the dashboard.
    // If you need inventory quantities reset to 0, that would be a different feature.

    res.json({ message: 'Dashboard metrics and history have been successfully reset.' });
  } catch (err) {
    console.error('Error resetting dashboard:', err);
    res.status(500).json({ error: 'Failed to reset dashboard' });
  }
});

module.exports = router;
