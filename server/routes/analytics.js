const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/analytics/summary
 * Fetch high-level stats for the Dashboard.
 * Access: All authenticated staff (some stats may only be relevant to managers)
 */
router.get('/summary', authGuard, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Today's Sales Total
    // Supabase JS doesn't have a simple SUM() aggregate method via the standard syntax without RPC,
    // so we fetch today's sales and sum them in Node.
    const { data: todaysSales, error: salesError } = await supabaseAdmin
      .from('sales')
      .select('total_amount')
      .gte('created_at', today.toISOString());

    if (salesError) throw salesError;

    const todaySalesTotal = todaysSales.reduce((acc, sale) => acc + Number(sale.total_amount), 0);

    // 2. Total Products Count & Low Stock Count
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('stock_quantity, low_stock_threshold');

    if (productsError) throw productsError;

    const totalProducts = products.length;
    const lowStockCount = products.filter(p => p.stock_quantity <= p.low_stock_threshold).length;

    // 3. Theft Alerts (Shrinkage events in last 30 days)
    const { count: shrinkageCount, error: shrinkageError } = await supabaseAdmin
      .from('stock_movements')
      .select('*', { count: 'exact', head: true })
      .eq('movement_type', 'SHRINKAGE')
      .gte('created_at', thirtyDaysAgo.toISOString());

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
 * Fetch detailed ledger of SHRINKAGE events for the Alerts page.
 * Access: Managers only
 */
router.get('/shrinkage', authGuard, permissionCheck('view_analytics'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('stock_movements')
      .select(`
        *,
        product:products!product_id(id, name, sku, price),
        user:users!user_id(id, name, email)
      `)
      .eq('movement_type', 'SHRINKAGE')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate value lost for each entry
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
 * Fetch end-of-day summary per staff member for a specific date.
 * Access: Managers only
 */
router.get('/reconciliation', authGuard, permissionCheck('view_analytics'), async (req, res) => {
  try {
    const dateParam = req.query.date;
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    
    // Start of the day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    // End of the day
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Fetch all users
    const { data: users, error: usersError } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        name,
        email,
        role_id,
        roles:role_id (name)
      `);
    if (usersError) throw usersError;

    // 2. Fetch sales for the date
    const { data: sales, error: salesError } = await supabaseAdmin
      .from('sales')
      .select('id, salesperson_id, total_amount, discount_amount, status')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());
    if (salesError) throw salesError;

    // 3. Fetch shrinkage for the date
    const { data: shrinkage, error: shrinkageError } = await supabaseAdmin
      .from('stock_movements')
      .select('id, user_id, quantity_change, product:products!product_id(price)')
      .eq('movement_type', 'SHRINKAGE')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());
    if (shrinkageError) throw shrinkageError;

    // 4. Group data by user
    const reconciliationData = users.map(user => {
      // Find sales for this user
      const userSales = sales.filter(s => s.salesperson_id === user.id);
      
      const completedSales = userSales.filter(s => s.status !== 'voided');
      const voidedSales = userSales.filter(s => s.status === 'voided');

      const totalSalesRevenue = completedSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
      const salesCount = completedSales.length;

      const totalDiscounts = completedSales.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0);

      // Value of a voided sale was its total_amount plus its discount
      const totalVoidValue = voidedSales.reduce((sum, s) => sum + Number(s.total_amount) + Number(s.discount_amount || 0), 0);
      const voidCount = voidedSales.length;

      // Find shrinkage for this user
      const userShrinkage = shrinkage.filter(s => s.user_id === user.id);
      const totalShrinkageValue = userShrinkage.reduce((sum, s) => sum + (Math.abs(s.quantity_change) * (s.product?.price || 0)), 0);
      const shrinkageCount = userShrinkage.length;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.roles ? user.roles.name : 'Unknown',
        salesCount,
        totalSalesRevenue,
        totalDiscounts,
        voidCount,
        totalVoidValue,
        shrinkageCount,
        totalShrinkageValue
      };
    });

    // Optionally sort by total sales revenue descending
    reconciliationData.sort((a, b) => b.totalSalesRevenue - a.totalSalesRevenue);

    res.json(reconciliationData);
  } catch (err) {
    console.error('Error fetching reconciliation data:', err);
    res.status(500).json({ error: 'Failed to fetch reconciliation data' });
  }
});

module.exports = router;
