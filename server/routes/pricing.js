const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { randomUUID } = require('crypto');

const router = express.Router();

/**
 * Helper: Build product filter query
 */
function applyProductFilters(query, filters, businessId) {
  query = query.eq('business_id', businessId);

  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (filters.sku_pattern) {
    query = query.ilike('sku', `%${filters.sku_pattern}%`);
  }
  if (filters.product_ids && filters.product_ids.length > 0) {
    query = query.in('id', filters.product_ids);
  }
  return query;
}

/**
 * Helper: Calculate new price based on mode
 */
function calculateNewPrice(currentPrice, mode, value, rounding = 0.01) {
  let newPrice;

  switch (mode) {
    case 'markup_percent':
      newPrice = currentPrice * (1 + value / 100);
      break;
    case 'markdown_percent':
      newPrice = currentPrice * (1 - value / 100);
      break;
    case 'fixed_amount':
      newPrice = currentPrice + value;
      break;
    case 'set_price':
      newPrice = value;
      break;
    default:
      newPrice = currentPrice;
  }

  // Ensure non-negative
  newPrice = Math.max(0, newPrice);

  // Round to nearest increment
  if (rounding > 0) {
    newPrice = Math.round(newPrice / rounding) * rounding;
  }

  // Fix floating point
  return parseFloat(newPrice.toFixed(2));
}

/**
 * POST /api/pricing/preview
 * Preview what a bulk price update would change (dry-run).
 * Body: { filters: { category?, sku_pattern?, product_ids? }, mode, value, rounding? }
 */
router.post('/preview', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    const { filters = {}, mode, value, rounding = 0.01 } = req.body;

    if (!mode || value === undefined || value === null) {
      return res.status(400).json({ error: 'mode and value are required' });
    }

    let query = supabaseAdmin
      .from('products')
      .select('id, name, sku, category, price, cost_price')
      .order('name');

    query = applyProductFilters(query, filters, req.user.business_id);

    const { data: products, error } = await query;
    if (error) throw error;

    const preview = products.map(p => {
      const currentPrice = parseFloat(p.price) || 0;
      const newPrice = calculateNewPrice(currentPrice, mode, parseFloat(value), parseFloat(rounding));
      const costPrice = parseFloat(p.cost_price) || 0;
      const margin = newPrice > 0 && costPrice > 0 ? ((newPrice - costPrice) / newPrice * 100).toFixed(1) : null;

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        current_price: currentPrice,
        new_price: newPrice,
        change: parseFloat((newPrice - currentPrice).toFixed(2)),
        change_percent: currentPrice > 0 ? parseFloat(((newPrice - currentPrice) / currentPrice * 100).toFixed(1)) : 0,
        cost_price: costPrice,
        margin
      };
    });

    res.json({
      count: preview.length,
      total_current: parseFloat(preview.reduce((s, p) => s + p.current_price, 0).toFixed(2)),
      total_new: parseFloat(preview.reduce((s, p) => s + p.new_price, 0).toFixed(2)),
      products: preview
    });
  } catch (err) {
    console.error('Error previewing price update:', err);
    res.status(500).json({ error: 'Failed to preview price update' });
  }
});

/**
 * PUT /api/pricing/bulk-update
 * Apply a bulk price update.
 * Body: { filters, mode, value, rounding?, reason? }
 */
router.put('/bulk-update', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    const { filters = {}, mode, value, rounding = 0.01, reason } = req.body;

    if (!mode || value === undefined || value === null) {
      return res.status(400).json({ error: 'mode and value are required' });
    }

    // Fetch products to update
    let query = supabaseAdmin
      .from('products')
      .select('id, name, sku, price, cost_price')
      .order('name');

    query = applyProductFilters(query, filters, req.user.business_id);

    const { data: products, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    if (products.length === 0) {
      return res.status(400).json({ error: 'No products match the specified filters' });
    }

    const batchId = randomUUID();
    const logEntries = [];
    let updatedCount = 0;

    // Update each product
    for (const p of products) {
      const oldPrice = parseFloat(p.price) || 0;
      const newPrice = calculateNewPrice(oldPrice, mode, parseFloat(value), parseFloat(rounding));

      if (newPrice === oldPrice) continue;

      const { error: updateErr } = await supabaseAdmin
        .from('products')
        .update({ price: newPrice })
        .eq('id', p.id);

      if (updateErr) {
        console.error(`Failed to update price for ${p.sku}:`, updateErr);
        continue;
      }

      logEntries.push({
        business_id: req.user.business_id,
        product_id: p.id,
        old_price: oldPrice,
        new_price: newPrice,
        old_cost_price: parseFloat(p.cost_price) || 0,
        new_cost_price: parseFloat(p.cost_price) || 0,
        change_type: mode,
        change_value: parseFloat(value),
        batch_id: batchId,
        reason: reason || null,
        changed_by: req.user.auth_id
      });

      updatedCount++;
    }

    // Insert audit log entries
    if (logEntries.length > 0) {
      const { error: logErr } = await supabaseAdmin
        .from('price_change_log')
        .insert(logEntries);

      if (logErr) {
        console.error('Failed to insert price change log:', logErr);
      }
    }

    res.json({
      message: `Updated prices for ${updatedCount} product(s)`,
      batch_id: batchId,
      updated_count: updatedCount,
      total_products: products.length
    });
  } catch (err) {
    console.error('Error in bulk price update:', err);
    res.status(500).json({ error: 'Failed to update prices' });
  }
});

/**
 * PUT /api/pricing/update-cost
 * Update cost_price for one or more products.
 * Body: { product_id, cost_price } or { filters, cost_price }
 */
router.put('/update-cost', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    const { product_id, cost_price, filters } = req.body;

    if (cost_price === undefined || cost_price === null) {
      return res.status(400).json({ error: 'cost_price is required' });
    }

    if (product_id) {
      // Single product update
      const { data, error } = await supabaseAdmin
        .from('products')
        .update({ cost_price: parseFloat(cost_price) })
        .eq('id', product_id)
        .eq('business_id', req.user.business_id)
        .select()
        .single();

      if (error) throw error;
      return res.json(data);
    }

    if (filters) {
      let query = supabaseAdmin
        .from('products')
        .update({ cost_price: parseFloat(cost_price) });

      query = applyProductFilters(query, filters, req.user.business_id);

      const { data, error, count } = await query.select();
      if (error) throw error;
      return res.json({ message: `Updated cost price for ${data.length} product(s)`, count: data.length });
    }

    return res.status(400).json({ error: 'product_id or filters required' });
  } catch (err) {
    console.error('Error updating cost price:', err);
    res.status(500).json({ error: 'Failed to update cost price' });
  }
});

/**
 * GET /api/pricing/history
 * Get price change audit trail.
 * Query: ?page=1&limit=50&product_id=...&batch_id=...
 */
router.get('/history', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    const { page = 1, limit = 50, product_id, batch_id } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = supabaseAdmin
      .from('price_change_log')
      .select(`
        *,
        product:products(name, sku, category)
      `, { count: 'exact' })
      .eq('business_id', req.user.business_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit, 10) - 1);

    if (product_id) {
      query = query.eq('product_id', product_id);
    }
    if (batch_id) {
      query = query.eq('batch_id', batch_id);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data,
      total: count,
      page: parseInt(page, 10),
      total_pages: Math.ceil(count / parseInt(limit, 10))
    });
  } catch (err) {
    console.error('Error fetching price history:', err);
    res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

/**
 * GET /api/pricing/categories
 * Get distinct product categories for filter dropdowns.
 */
router.get('/categories', authGuard, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('category')
      .eq('business_id', req.user.business_id)
      .order('category');

    if (error) throw error;

    const categories = [...new Set(data.map(p => p.category).filter(Boolean))];
    res.json(categories);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;
