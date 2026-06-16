const express = require('express');
const logger = require('../utils/logger');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/products
 * Fetch all products
 * Access: All authenticated staff
 */
router.get('/', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('products')
      .select('*, product_inventory(location_id, quantity, low_stock_threshold)')
      .order('name');

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching products:');
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/products/lookup
 * Look up a product by its QR code data.
 * Access: All authenticated staff
 */
router.get('/lookup', authGuard, async (req, res) => {
  try {
    const { qr } = req.query;
    if (!qr) return res.status(400).json({ error: 'Missing qr query parameter.' });

    let query = supabaseAdmin
      .from('products')
      .select('*, product_inventory(location_id, quantity, low_stock_threshold)')
      .eq('qr_code_data', qr);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.single();
    if (error || !data) return res.status(404).json({ error: 'Product not found for this QR code.' });
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error looking up product by QR:');
    res.status(500).json({ error: 'Failed to look up product' });
  }
});

/**
 * GET /api/products/:id
 * Fetch a single product
 * Access: All authenticated staff
 */
router.get('/:id', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('products')
      .select('*, product_inventory(location_id, quantity, low_stock_threshold)')
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Product not found' });
    
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching product:');
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/**
 * POST /api/products
 * Create a new product
 * Access: Managers only
 */
router.post('/', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    const { name, sku, category, price, cost_price, initialQuantity, locationId, qr_code_data, product_code } = req.body;

    if (!name || !sku) {
      return res.status(400).json({ error: 'Name and SKU are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([
        { 
          name, 
          sku, 
          category, 
          price, 
          cost_price: cost_price || 0,
          qr_code_data: qr_code_data || sku,
          product_code,
          business_id: req.body.business_id || req.user.business_id 
        }
      ])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique violation for SKU
        return res.status(409).json({ error: 'A product with this SKU already exists.' });
      }
      throw error;
    }

    if (locationId) {
      const qty = parseInt(initialQuantity, 10) || 0;
      const { error: invError } = await supabaseAdmin
        .from('product_inventory')
        .insert({
          product_id: data.id,
          location_id: locationId,
          quantity: qty,
          low_stock_threshold: 5
        });

      if (invError) {
        logger.error({ err: invError }, 'Error creating initial inventory:');
      } else if (qty > 0) {
        await supabaseAdmin
          .from('stock_movements')
          .insert({
            product_id: data.id,
            user_id: req.user.id,
            business_id: req.body.business_id || req.user.business_id,
            location_id: locationId,
            quantity_change: qty,
            movement_type: 'RECEIPT',
            notes: 'Initial stock on product creation'
          });
      }
    }

    res.status(201).json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error creating product:');
    res.status(500).json({ error: 'Failed to create product' });
  }
});

/**
 * PUT /api/products/:id
 * Update a product
 * Access: Managers only
 */
router.put('/:id', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    const { name, sku, category, price, cost_price, qr_code_data, product_code } = req.body;

    const updatePayload = { name, sku, category, price };
    if (cost_price !== undefined) updatePayload.cost_price = cost_price;
    if (qr_code_data !== undefined) updatePayload.qr_code_data = qr_code_data;
    if (product_code !== undefined) updatePayload.product_code = product_code;

    let query = supabaseAdmin
      .from('products')
      .update(updatePayload)
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.select().single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'A product with this SKU already exists.' });
      }
      throw error;
    }
    
    if (!data) return res.status(404).json({ error: 'Product not found' });

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error updating product:');
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * DELETE /api/products/:id
 * Delete a product
 * Access: Managers only
 */
router.delete('/:id', authGuard, permissionCheck('manage_products'), async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('products')
      .delete({ count: 'exact' })
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { error, count } = await query;

    if (error) throw error;
    if (count === 0) return res.status(404).json({ error: 'Product not found' });

    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting product:');
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
