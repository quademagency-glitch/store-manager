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
    const { items, payment_method, total_amount, subtotal, tax, discount } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'A sale must contain at least one item.',
      });
    }

    const validPaymentMethods = ['cash', 'card', 'mobile_money', 'bank_transfer'];
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
      .select('product_id, quantity')
      .eq('location_id', location_id)
      .in('product_id', productIds);

    if (inventoryError) {
      console.error('Inventory lookup error:', inventoryError);
      return res.status(500).json({ error: 'Internal server error', message: 'Could not verify product stock.' });
    }

    const inventoryMap = {};
    for (const inv of inventoryData || []) {
      inventoryMap[inv.product_id] = inv.quantity;
    }

    const insufficientStock = [];
    for (const item of items) {
      const stockAvailable = inventoryMap[item.product_id] || 0;
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
          total_amount,
          subtotal,
          tax,
          discount,
          payment_method,
        },
      ])
      .select()
      .single();

    if (saleError || !saleData) {
      console.error('Sale insertion error:', saleError);
      return res.status(500).json({ error: 'Internal server error', message: 'Failed to record sale.' });
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
      const newQuantity = (inventoryMap[item.product_id] || 0) - item.quantity;
      
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
    }

    return res.status(201).json({
      message: 'Sale recorded successfully',
      sale: saleData,
    });
  } catch (err) {
    console.error('POST /sales error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing the sale.',
    });
  }
});

module.exports = router;
