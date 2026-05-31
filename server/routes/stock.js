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
    const { data, error } = await supabaseAdmin
      .from('stock_movements')
      .select(`
        *,
        product:products!product_id(id, name, sku),
        user:users!user_id(id, name, email)
      `)
      .order('created_at', { ascending: false });

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
    const { product_id, quantity_change, movement_type, notes } = req.body;

    // Validate inputs
    if (!product_id || typeof quantity_change !== 'number' || quantity_change === 0) {
      return res.status(400).json({ error: 'Bad request', message: 'product_id and non-zero quantity_change are required' });
    }

    const validTypes = ['RECEIPT', 'ADJUSTMENT', 'SHRINKAGE', 'RETURN'];
    if (!validTypes.includes(movement_type)) {
      return res.status(400).json({ error: 'Bad request', message: `Invalid movement_type. Must be one of: ${validTypes.join(', ')}` });
    }

    // 1. Fetch current product stock
    const { data: product, error: fetchError } = await supabaseAdmin
      .from('products')
      .select('id, name, stock_quantity')
      .eq('id', product_id)
      .single();

    if (fetchError || !product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const newStockQuantity = product.stock_quantity + quantity_change;

    // Prevent negative stock
    if (newStockQuantity < 0) {
       return res.status(400).json({ error: 'Bad request', message: `Adjustment would result in negative stock for ${product.name}.` });
    }

    // 2. Insert movement record
    const { data: movement, error: insertError } = await supabaseAdmin
      .from('stock_movements')
      .insert({
        product_id,
        user_id: req.user.id,
        quantity_change,
        movement_type,
        notes
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 3. Update product stock
    const { data: updatedProduct, error: updateError } = await supabaseAdmin
      .from('products')
      .update({ stock_quantity: newStockQuantity })
      .eq('id', product_id)
      .select()
      .single();

    if (updateError) {
      console.error(`Failed to update product stock:`, updateError);
      return res.status(500).json({ error: 'Failed to update stock quantity on product' });
    }

    res.status(201).json({
      message: 'Stock adjusted successfully',
      movement,
      product: updatedProduct
    });

  } catch (err) {
    console.error('Error adjusting stock:', err);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

module.exports = router;
