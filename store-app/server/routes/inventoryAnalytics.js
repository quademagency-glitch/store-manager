const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/inventory-analytics/summary
 * High-level inventory KPIs.
 * Returns: total SKUs, total stock value, items below reorder, dead stock count.
 */
router.get('/summary', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const businessId = req.user.business_id;

    // Total SKUs
    const { count: totalSKUs } = await supabaseAdmin
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId);

    // Total stock value = SUM(quantity * price) across all inventory
    const { data: inventoryData } = await supabaseAdmin
      .from('product_inventory')
      .select(`
        quantity,
        product:products!product_id(price, business_id)
      `)
      .not('quantity', 'eq', 0);

    const totalValue = (inventoryData || [])
      .filter(i => i.product?.business_id === businessId)
      .reduce((sum, i) => sum + (i.quantity * Number(i.product?.price || 0)), 0);

    // Items below reorder point (using low_stock_threshold as default reorder point)
    const { data: belowReorder } = await supabaseAdmin
      .from('product_inventory')
      .select(`
        quantity, low_stock_threshold,
        product:products!product_id(id, business_id)
      `);

    const belowReorderCount = (belowReorder || [])
      .filter(i => i.product?.business_id === businessId && i.quantity <= i.low_stock_threshold)
      .length;

    // Dead stock: products with stock > 0 but no sales in last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: recentSalesProducts } = await supabaseAdmin
      .from('stock_movements')
      .select('product_id')
      .eq('business_id', businessId)
      .eq('movement_type', 'SALE')
      .gte('created_at', sixtyDaysAgo.toISOString());

    const recentlySoldIds = new Set((recentSalesProducts || []).map(s => s.product_id));

    const { data: allWithStock } = await supabaseAdmin
      .from('product_inventory')
      .select('product_id, quantity, product:products!product_id(business_id)')
      .gt('quantity', 0);

    const deadStockCount = (allWithStock || [])
      .filter(i => i.product?.business_id === businessId && !recentlySoldIds.has(i.product_id))
      .reduce((acc, curr) => {
        acc.add(curr.product_id);
        return acc;
      }, new Set()).size;

    res.json({
      total_skus: totalSKUs || 0,
      total_inventory_value: Math.round(totalValue * 100) / 100,
      below_reorder_count: belowReorderCount,
      dead_stock_count: deadStockCount
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching inventory summary:');
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

/**
 * GET /api/inventory-analytics/valuation
 * Inventory value broken down by category and optionally by location.
 */
router.get('/valuation', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const businessId = req.user.business_id;

    const { data } = await supabaseAdmin
      .from('product_inventory')
      .select(`
        quantity, location_id,
        product:products!product_id(id, name, sku, price, category, business_id),
        location:locations!location_id(id, name)
      `)
      .gt('quantity', 0);

    const filtered = (data || []).filter(i => i.product?.business_id === businessId);

    // Group by category
    const byCategory = {};
    const byLocation = {};

    for (const item of filtered) {
      const category = item.product?.category || 'Uncategorized';
      const value = item.quantity * Number(item.product?.price || 0);

      if (!byCategory[category]) byCategory[category] = { category, value: 0, item_count: 0, total_units: 0 };
      byCategory[category].value += value;
      byCategory[category].item_count++;
      byCategory[category].total_units += item.quantity;

      const locName = item.location?.name || 'Unknown';
      if (!byLocation[locName]) byLocation[locName] = { location: locName, value: 0, item_count: 0 };
      byLocation[locName].value += value;
      byLocation[locName].item_count++;
    }

    res.json({
      by_category: Object.values(byCategory).sort((a, b) => b.value - a.value),
      by_location: Object.values(byLocation).sort((a, b) => b.value - a.value),
      total_value: filtered.reduce((sum, i) => sum + (i.quantity * Number(i.product?.price || 0)), 0)
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching valuation:');
    res.status(500).json({ error: 'Failed to fetch inventory valuation' });
  }
});

/**
 * GET /api/inventory-analytics/turnover
 * Stock turnover rate per product over configurable days (default 30).
 * Turnover = (Total sold qty) / (Average stock)
 */
router.get('/turnover', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const businessId = req.user.business_id;
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get sales quantities per product
    const { data: salesMovements } = await supabaseAdmin
      .from('stock_movements')
      .select('product_id, quantity_change')
      .eq('business_id', businessId)
      .eq('movement_type', 'SALE')
      .gte('created_at', since.toISOString());

    const salesByProduct = {};
    for (const m of (salesMovements || [])) {
      if (!salesByProduct[m.product_id]) salesByProduct[m.product_id] = 0;
      salesByProduct[m.product_id] += Math.abs(m.quantity_change);
    }

    // Get current stock per product
    const { data: inventory } = await supabaseAdmin
      .from('product_inventory')
      .select('product_id, quantity, product:products!product_id(id, name, sku, category, price, business_id)');

    const productStock = {};
    for (const inv of (inventory || [])) {
      if (inv.product?.business_id !== businessId) continue;
      if (!productStock[inv.product_id]) {
        productStock[inv.product_id] = {
          product_id: inv.product_id,
          name: inv.product.name,
          sku: inv.product.sku,
          category: inv.product.category,
          price: Number(inv.product.price),
          current_stock: 0,
          total_sold: 0
        };
      }
      productStock[inv.product_id].current_stock += inv.quantity;
    }

    // Calculate turnover
    const turnoverData = Object.values(productStock).map(p => {
      const sold = salesByProduct[p.product_id] || 0;
      const avgStock = p.current_stock + (sold / 2); // Rough avg: current + half of sold
      const turnoverRate = avgStock > 0 ? (sold / avgStock) : 0;
      const dailySalesRate = sold / days;

      return {
        ...p,
        total_sold: sold,
        turnover_rate: Math.round(turnoverRate * 100) / 100,
        daily_sales_rate: Math.round(dailySalesRate * 100) / 100,
        days_of_stock: dailySalesRate > 0 ? Math.round(p.current_stock / dailySalesRate) : (p.current_stock > 0 ? 999 : 0)
      };
    });

    // Sort by turnover rate descending
    turnoverData.sort((a, b) => b.turnover_rate - a.turnover_rate);

    res.json({
      period_days: days,
      products: turnoverData
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching turnover data:');
    res.status(500).json({ error: 'Failed to fetch turnover data' });
  }
});

/**
 * GET /api/inventory-analytics/dead-stock
 * Products with zero sales in last 60 days but stock > 0.
 */
router.get('/dead-stock', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const businessId = req.user.business_id;
    const days = parseInt(req.query.days) || 60;
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get products that had sales recently
    const { data: recentSales } = await supabaseAdmin
      .from('stock_movements')
      .select('product_id')
      .eq('business_id', businessId)
      .eq('movement_type', 'SALE')
      .gte('created_at', since.toISOString());

    const recentlySoldIds = new Set((recentSales || []).map(s => s.product_id));

    // Get all products with stock
    const { data: inventory } = await supabaseAdmin
      .from('product_inventory')
      .select(`
        quantity, location_id,
        product:products!product_id(id, name, sku, category, price, business_id, created_at),
        location:locations!location_id(id, name)
      `)
      .gt('quantity', 0);

    const deadStock = (inventory || [])
      .filter(i => i.product?.business_id === businessId && !recentlySoldIds.has(i.product?.id))
      .map(i => ({
        product_id: i.product.id,
        name: i.product.name,
        sku: i.product.sku,
        category: i.product.category,
        price: Number(i.product.price),
        quantity: i.quantity,
        value: i.quantity * Number(i.product.price),
        location: i.location?.name || 'Unknown',
        location_id: i.location_id,
        age_days: Math.floor((Date.now() - new Date(i.product.created_at).getTime()) / (1000 * 60 * 60 * 24))
      }));

    // Sort by value descending (highest value dead stock first)
    deadStock.sort((a, b) => b.value - a.value);

    const totalDeadValue = deadStock.reduce((sum, d) => sum + d.value, 0);

    res.json({
      period_days: days,
      dead_stock: deadStock,
      total_dead_value: Math.round(totalDeadValue * 100) / 100,
      count: deadStock.length
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching dead stock:');
    res.status(500).json({ error: 'Failed to fetch dead stock data' });
  }
});

/**
 * GET /api/inventory-analytics/reorder-suggestions
 * Products below reorder point with suggested PO quantities.
 * Uses avg daily sales rate × lead time to suggest optimal order qty.
 */
router.get('/reorder-suggestions', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const businessId = req.user.business_id;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get sales data for last 30 days
    const { data: salesMovements } = await supabaseAdmin
      .from('stock_movements')
      .select('product_id, quantity_change')
      .eq('business_id', businessId)
      .eq('movement_type', 'SALE')
      .gte('created_at', thirtyDaysAgo.toISOString());

    const salesByProduct = {};
    for (const m of (salesMovements || [])) {
      if (!salesByProduct[m.product_id]) salesByProduct[m.product_id] = 0;
      salesByProduct[m.product_id] += Math.abs(m.quantity_change);
    }

    // Get product inventory with thresholds
    const { data: inventory } = await supabaseAdmin
      .from('product_inventory')
      .select(`
        quantity, low_stock_threshold, location_id,
        product:products!product_id(id, name, sku, category, price, business_id),
        location:locations!location_id(id, name)
      `);

    // Get reorder configs
    const { data: reorderConfigs } = await supabaseAdmin
      .from('inventory_reorder_config')
      .select('*, supplier:suppliers!preferred_supplier_id(id, name, lead_time_days)')
      .eq('business_id', businessId);

    const configMap = {};
    for (const rc of (reorderConfigs || [])) {
      configMap[`${rc.product_id}-${rc.location_id}`] = rc;
    }

    // Get suppliers for suggestions
    const { data: suppliers } = await supabaseAdmin
      .from('suppliers')
      .select('id, name, lead_time_days')
      .eq('business_id', businessId)
      .eq('is_active', true);

    // Build suggestions
    const suggestions = [];

    for (const inv of (inventory || [])) {
      if (inv.product?.business_id !== businessId) continue;

      const reorderPoint = inv.low_stock_threshold || 5;
      if (inv.quantity > reorderPoint) continue; // Not below threshold

      const sold30d = salesByProduct[inv.product?.id] || 0;
      const dailySalesRate = sold30d / 30;
      const config = configMap[`${inv.product?.id}-${inv.location_id}`];
      const leadTime = config?.supplier?.lead_time_days || 7;
      const preferredSupplier = config?.supplier || null;

      // Suggested quantity = (daily rate × lead time × 2) + reorder point - current stock
      // The ×2 provides a safety buffer
      const safetyStock = Math.ceil(dailySalesRate * leadTime * 2);
      const suggestedQty = Math.max(
        config?.reorder_quantity || 0,
        safetyStock + reorderPoint - inv.quantity,
        10 // minimum order
      );

      suggestions.push({
        product_id: inv.product.id,
        name: inv.product.name,
        sku: inv.product.sku,
        category: inv.product.category,
        price: Number(inv.product.price),
        current_stock: inv.quantity,
        reorder_point: reorderPoint,
        daily_sales_rate: Math.round(dailySalesRate * 100) / 100,
        lead_time_days: leadTime,
        suggested_quantity: suggestedQty,
        estimated_cost: Math.round(suggestedQty * Number(inv.product.price) * 100) / 100,
        location: inv.location?.name || 'Unknown',
        location_id: inv.location_id,
        preferred_supplier: preferredSupplier,
        urgency: inv.quantity === 0 ? 'critical' : inv.quantity <= reorderPoint / 2 ? 'high' : 'medium'
      });
    }

    // Sort by urgency: critical first, then high, then medium
    const urgencyOrder = { critical: 0, high: 1, medium: 2 };
    suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    res.json({
      suggestions,
      count: suggestions.length,
      available_suppliers: suppliers || []
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching reorder suggestions:');
    res.status(500).json({ error: 'Failed to fetch reorder suggestions' });
  }
});

module.exports = router;
