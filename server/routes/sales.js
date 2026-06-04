const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');

const router = express.Router();

/**
 * GET /api/sales
 * Fetch all sales with line items and product names.
 * Access: All authenticated staff
 */
router.get('/', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('sales')
      .select(`
        *,
        salesperson:users!salesperson_id(id, name, email),
        customer:customers!customer_id(id, name, phone),
        sale_items(
          id,
          quantity,
          unit_price,
          product:products!product_id(id, name, sku)
        )
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
    console.error('Error fetching sales:', err);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

/**
 * GET /api/sales/:id
 * Fetch a single sale's details
 * Access: All authenticated staff
 */
router.get('/:id', authGuard, async (req, res) => {
  try {
    const saleId = req.params.id;

    let query = supabaseAdmin
      .from('sales')
      .select(`
        *,
        salesperson:users!salesperson_id(id, name, email),
        customer:customers!customer_id(id, name, phone),
        sale_items(
          id,
          quantity,
          unit_price,
          product:products!product_id(id, name, sku)
        )
      `)
      .eq('id', saleId)
      .single();

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
    console.error('Error fetching sale:', err);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

/**
 * POST /api/sales
 * Create a new sale and update product inventory.
 * Access: Must have create_sales permission
 */
router.post('/', authGuard, permissionCheck('create_sales'), async (req, res) => {
  try {
    const { items, payment_method, total_amount, subtotal, tax, discount, customer_id } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'A sale must contain at least one item.',
      });
    }

    const validPaymentMethods = ['cash', 'card', 'mobile'];
    if (!validPaymentMethods.includes(payment_method)) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(', ')}.`,
      });
    }

    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Each item must have a valid product_id and quantity >= 1.',
        });
      }
    }

    const productIds = items.map(i => i.product_id);

    let location_id = req.user.active_location_id;
    if (!location_id) {
       return res.status(400).json({ error: 'Bad request', message: 'Active location not set. Please select a branch to process sales.' });
    }

    const { data: inventoryData, error: inventoryError } = await supabaseAdmin
      .from('product_inventory')
      .select('product_id, quantity, low_stock_threshold')
      .eq('location_id', location_id)
      .in('product_id', productIds);

    if (inventoryError) {
      console.error('Inventory lookup error:', inventoryError);
      return res.status(500).json({ error: 'Internal server error', message: 'Could not verify product stock.' });
    }

    const inventoryMap = {};
    for (const inv of inventoryData || []) {
      inventoryMap[inv.product_id] = { quantity: inv.quantity, threshold: inv.low_stock_threshold || 5 };
    }

    const insufficientStock = [];
    for (const item of items) {
      const stockAvailable = inventoryMap[item.product_id]?.quantity || 0;
      if (item.quantity > stockAvailable) {
        insufficientStock.push(item.product_id);
      }
    }

    if (insufficientStock.length > 0) {
      return res.status(400).json({
        error: 'Insufficient stock',
        message: 'One or more items do not have enough stock available.',
        productIds: insufficientStock,
      });
    }

    const { data: saleData, error: saleError } = await supabaseAdmin
      .from('sales')
      .insert([
        {
          business_id: req.user.business_id,
          location_id: location_id,
          salesperson_id: req.user.id,
          total_amount: total_amount || 0,
          discount_amount: discount || 0,
          payment_method,
          customer_id: customer_id || null,
        },
      ])
      .select()
      .single();

    if (saleError || !saleData) {
      console.error('Sale insertion error:', saleError);
      return res.status(500).json({ error: 'Internal server error', message: `Failed to record sale. ${saleError?.message || 'Unknown error'}` });
    }

    const saleItemsToInsert = items.map(item => ({
      sale_id: saleData.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    const { error: saleItemsError } = await supabaseAdmin
      .from('sale_items')
      .insert(saleItemsToInsert);

    if (saleItemsError) {
      console.error('Sale items insertion error:', saleItemsError);
    }

    for (const item of items) {
      const oldQuantity = inventoryMap[item.product_id]?.quantity || 0;
      const threshold = inventoryMap[item.product_id]?.threshold || 5;
      const newQuantity = oldQuantity - item.quantity;
      
      const { error: updateError } = await supabaseAdmin
        .from('product_inventory')
        .update({ quantity: newQuantity })
        .eq('product_id', item.product_id)
        .eq('location_id', location_id);

      if (updateError) {
        console.error(`Error updating stock for product ${item.product_id}:`, updateError);
      }
      
      await supabaseAdmin.from('stock_movements').insert([{
        business_id: req.user.business_id,
        location_id: location_id,
        product_id: item.product_id,
        quantity_change: -item.quantity,
        movement_type: 'SALE',
        user_id: req.user.id,
        reference_id: saleData.id,
        notes: `Sale #${saleData.id}`
      }]);

      // Check for LOW_STOCK alert (only trigger if it newly crossed the threshold)
      if (newQuantity <= threshold && oldQuantity > threshold) {
        await supabaseAdmin.from('alerts').insert([{
          business_id: req.user.business_id,
          location_id: location_id,
          type: 'LOW_STOCK',
          user_id: req.user.id,
          reference_id: item.product_id,
          note: `Stock fell to ${newQuantity} (Threshold: ${threshold}) due to sale #${saleData.id}`
        }]);
      }
    }

    if (Number(discount) > 0) {
      await supabaseAdmin.from('alerts').insert([{
        business_id: req.user.business_id,
        location_id: location_id,
        type: 'DISCOUNT',
        user_id: req.user.id,
        reference_id: saleData.id,
        note: `Discount of ${discount} applied to sale #${saleData.id}`
      }]);
    }

    return res.status(201).json({
      message: 'Sale recorded successfully',
      sale: saleData,
    });
  } catch (err) {
    console.error('POST /sales error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: `An unexpected error occurred while processing the sale. ${err.message || ''}`,
    });
  }
});

/**
 * PUT /api/sales/:id/void
 * Void a sale and return stock to inventory.
 */
router.put('/:id/void', authGuard, permissionCheck('create_sales'), async (req, res) => {
  try {
    const saleId = req.params.id;

    // Fetch sale and its items
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('sales')
      .select('id, status, location_id, business_id, sale_items(product_id, quantity)')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.status === 'voided') return res.status(400).json({ error: 'Sale already voided' });

    // Enforce business isolation
    if (req.user.role !== 'Platform Admin' && sale.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Update status
    const { error: updateError } = await supabaseAdmin
      .from('sales')
      .update({ status: 'voided' })
      .eq('id', saleId);
    
    if (updateError) throw updateError;

    // Restore inventory and create stock movements
    for (const item of sale.sale_items) {
      // Get current inventory
      const { data: inv } = await supabaseAdmin
        .from('product_inventory')
        .select('quantity')
        .eq('product_id', item.product_id)
        .eq('location_id', sale.location_id)
        .single();
      
      if (inv) {
        await supabaseAdmin
          .from('product_inventory')
          .update({ quantity: inv.quantity + item.quantity })
          .eq('product_id', item.product_id)
          .eq('location_id', sale.location_id);
      }

      await supabaseAdmin.from('stock_movements').insert([{
        business_id: sale.business_id,
        location_id: sale.location_id,
        product_id: item.product_id,
        quantity_change: item.quantity,
        movement_type: 'ADJUSTMENT',
        user_id: req.user.id,
        reference_id: sale.id,
        notes: `Voided Sale #${sale.id}`
      }]);
    }

    // Trigger VOID alert
    await supabaseAdmin.from('alerts').insert([{
      business_id: sale.business_id,
      location_id: sale.location_id,
      type: 'VOID',
      user_id: req.user.id,
      reference_id: sale.id,
      note: `Sale #${sale.id} was voided`
    }]);

    res.json({ message: 'Sale voided successfully' });
  } catch (err) {
    console.error('Error voiding sale:', err);
    res.status(500).json({ error: 'Failed to void sale' });
  }
});

/**
 * DELETE /api/sales/:id
 * Hard delete a sale and return stock to inventory.
 * Access: Business Admins only.
 */
router.delete('/:id', authGuard, async (req, res) => {
  try {
    const saleId = req.params.id;

    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only Business Admins can permanently delete sales.' });
    }

    // Fetch sale and its items
    const { data: sale, error: fetchError } = await supabaseAdmin
      .from('sales')
      .select('id, status, location_id, business_id, sale_items(product_id, quantity)')
      .eq('id', saleId)
      .single();

    if (fetchError || !sale) return res.status(404).json({ error: 'Sale not found' });

    // Enforce business isolation
    if (req.user.role !== 'Platform Admin' && sale.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // If sale wasn't voided before deleting, restore inventory and create stock movements
    if (sale.status !== 'voided') {
      for (const item of sale.sale_items) {
        // Get current inventory
        const { data: inv } = await supabaseAdmin
          .from('product_inventory')
          .select('quantity')
          .eq('product_id', item.product_id)
          .eq('location_id', sale.location_id)
          .single();
        
        if (inv) {
          await supabaseAdmin
            .from('product_inventory')
            .update({ quantity: inv.quantity + item.quantity })
            .eq('product_id', item.product_id)
            .eq('location_id', sale.location_id);
        }

        await supabaseAdmin.from('stock_movements').insert([{
          business_id: sale.business_id,
          location_id: sale.location_id,
          product_id: item.product_id,
          quantity_change: item.quantity,
          movement_type: 'ADJUSTMENT',
          user_id: req.user.id,
          reference_id: sale.id,
          notes: `Deleted Sale #${sale.id}`
        }]);
      }
    }

    // Delete stock movements referencing this sale (sales deletion itself doesn't cascade to stock_movements)
    await supabaseAdmin
      .from('stock_movements')
      .delete()
      .eq('reference_id', sale.id);

    // Delete alerts referencing this sale
    await supabaseAdmin
      .from('alerts')
      .delete()
      .eq('reference_id', sale.id);

    // Delete the sale (sale_items will cascade)
    const { error: deleteError } = await supabaseAdmin
      .from('sales')
      .delete()
      .eq('id', saleId);
    
    if (deleteError) throw deleteError;

    res.json({ message: 'Sale deleted successfully' });
  } catch (err) {
    console.error('Error deleting sale:', err);
    res.status(500).json({ error: 'Failed to delete sale' });
  }
});

module.exports = router;
