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

    const { data: todaysSales, error: salesError } = await salesQuery;
    if (salesError) throw salesError;

    const todaySalesTotal = todaysSales.reduce((acc, sale) => acc + Number(sale.total_amount), 0);

    // 2. Total Products Count & Low Stock Count (from product_inventory)
    let inventoryQuery = supabaseAdmin
      .from('product_inventory')
      .select('quantity, low_stock_threshold, products!inner(business_id)');
      
    if (req.user.role !== 'Platform Admin') {
      inventoryQuery = inventoryQuery.eq('products.business_id', req.user.business_id);
    }
    inventoryQuery = applyLocationFilter(inventoryQuery, req);

    const { data: inventory, error: invError } = await inventoryQuery;
    if (invError) throw invError;

    const totalProducts = inventory.length; // Unique product-locations
    const lowStockCount = inventory.filter(p => p.quantity <= (p.low_stock_threshold || 10)).length;

    // 3. Theft Alerts
    let shrinkageQuery = supabaseAdmin
      .from('stock_movements')
      .select('*', { count: 'exact', head: true })
      .eq('movement_type', 'SHRINKAGE')
      .gte('created_at', thirtyDaysAgo.toISOString());
      
    if (req.user.role !== 'Platform Admin') {
      shrinkageQuery = shrinkageQuery.eq('business_id', req.user.business_id);
    }
    shrinkageQuery = applyLocationFilter(shrinkageQuery, req);

    const { count: shrinkageCount, error: shrinkageError } = await shrinkageQuery;
    if (shrinkageError) throw shrinkageError;

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
      value_lost: Math.abs(movement.quantity_changed || movement.quantity_change) * (movement.product?.price || 0)
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
    // We don't filter users by location here because we want to see their sales
    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;

    // 2. Fetch sales
    let salesQuery = supabaseAdmin
      .from('sales')
      .select('id, salesperson_id, total_amount, discount_amount, status')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());
      
    if (req.user.role !== 'Platform Admin') {
      salesQuery = salesQuery.eq('business_id', req.user.business_id);
    }
    salesQuery = applyLocationFilter(salesQuery, req);

    const { data: sales, error: salesError } = await salesQuery;
    if (salesError) throw salesError;

    // 3. Fetch shrinkage
    let shrinkageQuery = supabaseAdmin
      .from('stock_movements')
      .select('id, user_id, created_by, quantity_changed, quantity_change, product:products!product_id(price)')
      .eq('movement_type', 'SHRINKAGE')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());
      
    if (req.user.role !== 'Platform Admin') {
      shrinkageQuery = shrinkageQuery.eq('business_id', req.user.business_id);
    }
    shrinkageQuery = applyLocationFilter(shrinkageQuery, req);

    const { data: shrinkage, error: shrinkageError } = await shrinkageQuery;
    if (shrinkageError) throw shrinkageError;

    // 4. Group data by user
    const reconciliationData = users.map(user => {
      const userSales = sales.filter(s => s.salesperson_id === user.id);
      const completedSales = userSales.filter(s => s.status !== 'voided');
      const voidedSales = userSales.filter(s => s.status === 'voided');

      const totalSalesRevenue = completedSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
      const totalDiscounts = completedSales.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0);
      const totalVoidValue = voidedSales.reduce((sum, s) => sum + Number(s.total_amount) + Number(s.discount_amount || 0), 0);

      const userShrinkage = shrinkage.filter(s => s.user_id === user.id || s.created_by === user.id);
      const totalShrinkageValue = userShrinkage.reduce((sum, s) => sum + (Math.abs(s.quantity_changed || s.quantity_change) * (s.product?.price || 0)), 0);

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

module.exports = router;
