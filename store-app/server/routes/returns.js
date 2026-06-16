const express = require('express');
const logger = require('../utils/logger');
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
    logger.error({ err: err }, 'Error searching returns:');
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

    // 2. Fetch business tracking mode
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('qr_tracking_mode')
      .eq('id', req.user.business_id)
      .single();

    const isDoubleMode = business?.qr_tracking_mode === 'double';

    // 3. Resolve and validate scans to unit_ids
    for (const item of items) {
      if (!item.unit_ids) item.unit_ids = [];

      if (item.scans && Array.isArray(item.scans)) {
        for (const scan of item.scans) {
           if (isDoubleMode) {
             if (!scan.pack_code || !scan.item_code || !scan.serial_number) {
               return res.status(400).json({ error: 'In double mode, you must scan Pack Code, Item Code, and Serial Number for returns.' });
             }
             // Find unit by all three that was sold in this sale
             const { data: unit } = await supabaseAdmin
               .from('inventory_units')
               .select(`
                 id,
                 pack_qr:qr_code_pool!pack_code_id(code),
                 item_qr:qr_code_pool!qr_code_id(code)
               `)
               .eq('serial_number', scan.serial_number)
               .eq('sold_in_sale_id', sale_id)
               .single();

             if (!unit || unit.pack_qr?.code !== scan.pack_code || unit.item_qr?.code !== scan.item_code) {
               return res.status(400).json({ error: `Unit not found in this sale for the scanned codes (Serial: ${scan.serial_number}).` });
             }
             item.unit_ids.push(unit.id);
           } else {
             if (!scan.item_code) return res.status(400).json({ error: 'Item code is required for returns in single tracking mode.' });
             
             const { data: itemQr } = await supabaseAdmin.from('qr_code_pool').select('id').eq('code', scan.item_code).single();
             if (!itemQr) return res.status(400).json({ error: `Invalid item code: ${scan.item_code}` });

             const { data: unit } = await supabaseAdmin
               .from('inventory_units')
               .select('id')
               .eq('qr_code_id', itemQr.id)
               .eq('sold_in_sale_id', sale_id)
               .single();

             if (!unit) return res.status(400).json({ error: `Item ${scan.item_code} was not sold in this sale.` });
             item.unit_ids.push(unit.id);
           }
        }
      }
    }

    // Calculate total refund
    let total_refund_amount = 0;
    for (const item of items) {
      total_refund_amount += item.quantity * item.unit_price;
    }

    // 4. Create the return transaction
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

    // 5. Insert return items & update inventory
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
    logger.error({ err: err }, 'Error processing return:');
    res.status(500).json({ error: 'Failed to process return' });
  }
});

module.exports = router;
