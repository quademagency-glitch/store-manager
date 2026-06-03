const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/stock
 * Fetch all stock movements with product and user details.
 * Access: All authenticated staff
 */
router.get('/', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('stock_movements')
      .select(`
        *,
        product:products!product_id(id, name, sku),
        user:users!user_id(id, name, email)
      `)
      .order('created_at', { ascending: false });

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }
    
    if (req.user.active_location_id) {
      query = query.eq('location_id', req.user.active_location_id);
    } else if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
      if (req.user.location_ids && req.user.location_ids.length > 0) {
        query = query.in('location_id', req.user.location_ids);
      } else {
        query = query.eq('location_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Error fetching stock movements:', err);
    res.status(500).json({ error: 'Failed to fetch stock movements' });
  }
});

/**
 * POST /api/stock/adjust
 * Create a manual stock adjustment (RECEIPT, ADJUSTMENT, SHRINKAGE, RETURN).
 * Access: Managers only (for manual adjustments)
 */
router.post('/adjust', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { product_id, quantity_change, movement_type, notes, location_id } = req.body;

    // Validate inputs
    if (!product_id || typeof quantity_change !== 'number' || quantity_change === 0 || !location_id) {
      return res.status(400).json({ error: 'Bad request', message: 'product_id, location_id, and non-zero quantity_change are required' });
    }

    // Verify location ownership
    if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
      if (!req.user.location_ids.includes(location_id)) {
        return res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to adjust stock at this location.' });
      }
    }

    const validTypes = ['RECEIPT', 'ADJUSTMENT', 'SHRINKAGE', 'RETURN'];
    if (!validTypes.includes(movement_type)) {
      return res.status(400).json({ error: 'Bad request', message: `Invalid movement_type. Must be one of: ${validTypes.join(', ')}` });
    }

    // 1. Fetch current product inventory for this location
    let { data: inventoryItem, error: fetchError } = await supabaseAdmin
      .from('product_inventory')
      .select('id, quantity, low_stock_threshold')
      .eq('product_id', product_id)
      .eq('location_id', location_id)
      .single();

    let currentStock = 0;
    let threshold = 5;
    if (inventoryItem) {
      currentStock = inventoryItem.quantity;
      threshold = inventoryItem.low_stock_threshold || 5;
    }

    const newStockQuantity = currentStock + quantity_change;

    if (newStockQuantity < 0) {
       return res.status(400).json({ error: 'Bad request', message: `Adjustment would result in negative stock for this location.` });
    }

    // 2. Insert movement record
    const { data: movement, error: insertError } = await supabaseAdmin
      .from('stock_movements')
      .insert({
        product_id,
        user_id: req.user.id,
        business_id: req.user.business_id,
        location_id,
        quantity_change,
        movement_type,
        notes
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 3. Upsert product inventory
    const { data: updatedInventory, error: updateError } = await supabaseAdmin
      .from('product_inventory')
      .upsert({ 
        product_id, 
        location_id, 
        quantity: newStockQuantity 
      }, { onConflict: 'product_id,location_id' })
      .select()
      .single();

    if (updateError) {
      console.error(`Failed to update product inventory:`, updateError);
      return res.status(500).json({ error: 'Failed to update stock quantity on product' });
    }

    // Trigger SHRINKAGE alert
    if (movement_type === 'SHRINKAGE' && quantity_change < 0) {
      await supabaseAdmin.from('alerts').insert([{
        business_id: req.user.business_id,
        location_id,
        type: 'SHRINKAGE',
        user_id: req.user.id,
        reference_id: movement.id,
        note: `Shrinkage of ${Math.abs(quantity_change)} units. Notes: ${notes || 'none'}`
      }]);
    }

    // Trigger LOW_STOCK alert if newly crossed threshold
    if (newStockQuantity <= threshold && currentStock > threshold) {
      await supabaseAdmin.from('alerts').insert([{
        business_id: req.user.business_id,
        location_id,
        type: 'LOW_STOCK',
        user_id: req.user.id,
        reference_id: product_id,
        note: `Stock fell to ${newStockQuantity} (Threshold: ${threshold}) due to ${movement_type}`
      }]);
    }

    res.status(201).json({
      message: 'Stock adjusted successfully',
      movement,
      product: updatedInventory
    });

  } catch (err) {
    console.error('Error adjusting stock:', err);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

/**
 * PUT /api/stock/:product_id/locations/:location_id/threshold
 * Update the low stock threshold for a product at a specific location.
 * Access: Managers only
 */
router.put('/:product_id/locations/:location_id/threshold', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { product_id, location_id } = req.params;
    const { threshold } = req.body;

    if (typeof threshold !== 'number' || threshold < 0) {
      return res.status(400).json({ error: 'Bad request', message: 'Threshold must be a positive number.' });
    }

    // Verify location ownership
    if (req.user.role !== 'Platform Admin' && req.user.role !== 'Business Admin') {
      if (!req.user.location_ids.includes(location_id)) {
        return res.status(403).json({ error: 'Forbidden', message: 'You do not have permission to manage stock at this location.' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('product_inventory')
      .update({ low_stock_threshold: threshold })
      .eq('product_id', product_id)
      .eq('location_id', location_id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Not found', message: 'Inventory record not found for this product and location.' });
    }

    res.json({ message: 'Threshold updated successfully', data });
  } catch (err) {
    console.error('Error updating threshold:', err);
    res.status(500).json({ error: 'Failed to update threshold' });
  }
});

module.exports = router;
