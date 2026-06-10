const express = require('express');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');

const router = express.Router();

/**
 * GET /api/returns/search
 * Search for completed sales by customer name, phone, or receipt number
 * Admin only
 */
router.get('/search', authGuard, async (req, res) => {
  try {
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Unauthorized. Only Admins can access returns.' });
    }

    const { query } = req.query; 
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    // 1. Find potential customers matching the query (name or phone)
    const { data: customers } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('business_id', req.user.business_id)
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
      
    const customerIds = customers ? customers.map(c => c.id) : [];

    // 2. Query sales matching the receipt OR the customer IDs
    let salesQuery = supabaseAdmin
      .from('sales')
      .select(`
        *,
        customers ( id, name, phone ),
        sale_items (
          id, product_id, quantity, unit_price,
          product:products ( name, sku )
        )
      `)
      .eq('business_id', req.user.business_id)
      .in('status', ['completed', 'partially_returned']);

    if (customerIds.length > 0) {
      salesQuery = salesQuery.or(`receipt_number.ilike.%${query}%,customer_id.in.(${customerIds.join(',')})`);
    } else {
      salesQuery = salesQuery.ilike('receipt_number', `%${query}%`);
    }

    const { data: sales, error } = await salesQuery.order('created_at', { ascending: false });

    if (error) throw error;

    // Enhance response with units if needed, but for now just returning sales
    res.json(sales);
  } catch (err) {
    console.error('Error searching returns:', err);
    res.status(500).json({ error: 'Failed to search sales for return' });
  }
});

/**
 * POST /api/returns
 * Process a return
 * Admin only
 */
router.post('/', authGuard, async (req, res) => {
  try {
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Unauthorized. Only Admins can process returns.' });
    }

    const { sale_id, items, reason } = req.body; 
    // items: [{ sale_item_id, product_id, quantity, unit_price, unit_ids: [] }]

    if (!sale_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid return data' });
    }

    // 1. Fetch original sale to verify
    const { data: sale, error: saleError } = await supabaseAdmin
      .from('sales')
      .select('*')
      .eq('id', sale_id)
      .single();

    if (saleError || !sale) return res.status(404).json({ error: 'Original sale not found' });
    if (sale.business_id !== req.user.business_id && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Calculate total refund
    let total_refund_amount = 0;
    for (const item of items) {
      total_refund_amount += item.quantity * item.unit_price;
    }

    // 2. Create the return transaction
    const { data: returnData, error: returnError } = await supabaseAdmin
      .from('returns')
      .insert([{
        business_id: sale.business_id,
        location_id: sale.location_id,
        original_sale_id: sale_id,
        customer_id: sale.customer_id,
        processed_by: req.user.id,
        total_refund_amount,
        reason
      }])
      .select()
      .single();

    if (returnError) throw returnError;

    // 3. Insert return items & update inventory
    for (const item of items) {
      // Insert return item
      await supabaseAdmin.from('return_items').insert([{
        return_id: returnData.id,
        sale_item_id: item.sale_item_id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        returned_unit_ids: item.unit_ids || []
      }]);

      // Update product_inventory (+ quantity)
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

      // Update inventory_units status to 'returned'
      if (item.unit_ids && item.unit_ids.length > 0) {
        await supabaseAdmin
          .from('inventory_units')
          .update({ status: 'returned' })
          .in('id', item.unit_ids);
      }

      // Log stock movement
      await supabaseAdmin.from('stock_movements').insert([{
        business_id: sale.business_id,
        location_id: sale.location_id,
        product_id: item.product_id,
        quantity_change: item.quantity,
        movement_type: 'RETURN',
        user_id: req.user.id,
        reference_id: returnData.id,
        notes: `Returned from Sale #${sale.receipt_number || sale_id}`
      }]);
    }

    // 4. Update original sale return_status
    // Simplification: mark as 'partial' always for now unless we calculate if all items were returned.
    await supabaseAdmin
      .from('sales')
      .update({ return_status: 'partial' })
      .eq('id', sale_id);

    res.json({ message: 'Return processed successfully', return_id: returnData.id });
  } catch (err) {
    console.error('Error processing return:', err);
    res.status(500).json({ error: 'Failed to process return' });
  }
});

module.exports = router;
