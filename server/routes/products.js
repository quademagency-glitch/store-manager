const express = require('express');
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
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
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
    console.error('Error fetching product:', err);
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
    const { name, sku, category, price, initialQuantity, locationId } = req.body;

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
        console.error('Error creating initial inventory:', invError);
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
    console.error('Error creating product:', err);
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
    const { name, sku, category, price } = req.body;

    let query = supabaseAdmin
      .from('products')
      .update({ name, sku, category, price })
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
    console.error('Error updating product:', err);
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
    console.error('Error deleting product:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
