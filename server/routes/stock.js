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
 *
 * Body: {
 *   product_id: uuid,
 *   quantity_change: number,
 *   movement_type: string,
 *   notes: string
 * }
 *
 * Access: Managers only (for manual adjustments)
 */
router.post('/adjust', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { product_id, quantity_change, movement_type, notes, location_id } = req.body;

    // Validate inputs
    if (!product_id || typeof quantity_change !== 'number' || quantity_change === 0 || !location_id) {
      return res.status(400).json({ error: 'Bad request', message: 'product_id, location_id, and non-zero quantity_change are required' });
    }

    const validTypes = ['RECEIPT', 'ADJUSTMENT', 'SHRINKAGE', 'RETURN'];
    if (!validTypes.includes(movement_type)) {
      return res.status(400).json({ error: 'Bad request', message: `Invalid movement_type. Must be one of: ${validTypes.join(', ')}` });
    }

    // 1. Fetch current product inventory for this location
    let { data: inventoryItem, error: fetchError } = await supabaseAdmin
      .from('product_inventory')
      .select('id, quantity')
      .eq('product_id', product_id)
      .eq('location_id', location_id)
      .single();

    // If no inventory record exists yet for this location, assume 0
    let currentStock = 0;
    if (inventoryItem) {
      currentStock = inventoryItem.quantity;
    }

    const newStockQuantity = currentStock + quantity_change;

    // Prevent negative stock
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

module.exports = router;
