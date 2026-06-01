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
 * Fetch a single sale with full details.
 * Access: All authenticated staff
 */
router.get('/:id', authGuard, async (req, res) => {
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
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Sale not found' });

    res.json(data);
  } catch (err) {
    console.error('Error fetching sale:', err);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

/**
 * POST /api/sales
 * Create a new sale.
 *
 * Body: {
 *   items: [{ product_id: uuid, quantity: number }],
 *   payment_method: 'cash' | 'card' | 'mobile'
 * }
 *
 * Flow:
 *   1. Validate input
 *   2. Look up product prices and stock
 *   3. Validate stock availability (all-or-nothing)
 *   4. Insert sale record
 *   5. Insert sale_items records
 *   6. Decrement stock on each product
 *   7. Return the completed sale
 *
 * Access: All authenticated staff
 */
router.post('/', authGuard, permissionCheck('create_sales'), async (req, res) => {
  try {
    const { items, payment_method, discount_amount = 0 } = req.body;

    // ── Validation ──────────────────────────────────────

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'At least one item is required.',
      });
    }

    const validPaymentMethods = ['cash', 'card', 'mobile'];
    if (!payment_method || !validPaymentMethods.includes(payment_method)) {
      return res.status(400).json({
        error: 'Bad request',
        message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(', ')}.`,
      });
    }

    // Validate each item has the required fields
    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Each item must have a valid product_id and quantity >= 1.',
        });
      }
    }

    // ── Look up products ────────────────────────────────

    const productIds = items.map(i => i.product_id);

    // Get user location
    const { data: userRec } = await supabaseAdmin.from('users').select('location_id, business_id').eq('id', req.user.id).single();
    let location_id = userRec?.location_id;
    
    if (!location_id) {
      // Fallback to first location in business
      const { data: loc } = await supabaseAdmin.from('locations').select('id').eq('business_id', userRec.business_id).limit(1).single();
      location_id = loc?.id;
    }

    const { data: products, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, name, price, product_inventory(location_id, quantity)')
      .in('id', productIds);

    if (productError) throw productError;

    // Check all products exist
    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map(p => p.id));
      const missing = productIds.filter(id => !foundIds.has(id));
      return res.status(400).json({
        error: 'Bad request',
        message: `Product(s) not found: ${missing.join(', ')}`,
      });
    }

    // Build a product lookup map
    const productMap = {};
    for (const p of products) {
      productMap[p.id] = p;
    }

    // ── Validate stock (all-or-nothing) ─────────────────

    const stockErrors = [];
    for (const item of items) {
      const product = productMap[item.product_id];
      const invRecord = product.product_inventory?.find(inv => inv.location_id === location_id);
      const stock = invRecord ? invRecord.quantity : 0;
      
      if (stock < item.quantity) {
        stockErrors.push(
          `"${product.name}" — requested ${item.quantity}, only ${stock} in stock at this location`
        );
      }
    }

    if (stockErrors.length > 0) {
      return res.status(409).json({
        error: 'Insufficient stock',
        message: `Cannot complete sale. Stock issues:\n${stockErrors.join('\n')}`,
      });
    }

    // ── Compute total ───────────────────────────────────

    let totalAmount = 0;
    const saleItemsPayload = items.map(item => {
      const product = productMap[item.product_id];
      const lineTotal = Number(product.price) * item.quantity;
      totalAmount += lineTotal;
      return {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: product.price,
      };
    });

    // Apply discount
    totalAmount = totalAmount - Number(discount_amount);
    if (totalAmount < 0) totalAmount = 0; // prevent negative totals

    totalAmount = Math.round(totalAmount * 100) / 100; // avoid floating point drift

    // ── Insert sale ─────────────────────────────────────

    const { data: sale, error: saleError } = await supabaseAdmin
      .from('sales')
      .insert({
        salesperson_id: req.user.id,
        business_id: req.user.business_id,
        location_id: location_id,
        total_amount: totalAmount,
        payment_method,
        discount_amount,
        status: 'completed',
      })
      .select()
      .single();

    if (saleError) throw saleError;

    // ── Insert sale items ───────────────────────────────

    const itemsWithSaleId = saleItemsPayload.map(item => ({
      ...item,
      sale_id: sale.id,
      business_id: req.user.business_id,
    }));

    const { data: saleItems, error: itemsError } = await supabaseAdmin
      .from('sale_items')
      .insert(itemsWithSaleId)
      .select(`
        id,
        quantity,
        unit_price,
        product:products!product_id(id, name, sku)
      `);

    if (itemsError) {
      // Rollback: delete the sale (cascade will clean up any items)
      await supabaseAdmin.from('sales').delete().eq('id', sale.id);
      throw itemsError;
    }

    // ── Decrement stock and log movements ───────────────

    for (const item of items) {
      const product = productMap[item.product_id];
      const invRecord = product.product_inventory?.find(inv => inv.location_id === location_id);
      const newQty = (invRecord ? invRecord.quantity : 0) - item.quantity;

      // Update product inventory
      const { error: stockError } = await supabaseAdmin
        .from('product_inventory')
        .update({ quantity: newQty })
        .eq('product_id', item.product_id)
        .eq('location_id', location_id);

      if (stockError) {
        console.error(`Failed to decrement stock for product ${item.product_id}:`, stockError);
        // Don't fail the whole sale — the sale is recorded, stock can be adjusted
      } else {
        // Log movement
        const { error: movementError } = await supabaseAdmin
          .from('stock_movements')
          .insert({
            product_id: item.product_id,
            user_id: req.user.id,
            business_id: req.user.business_id,
            location_id: location_id,
            quantity_change: -item.quantity,
            movement_type: 'SALE',
            reference_id: sale.id,
            notes: 'Sale via POS'
          });

        if (movementError) {
          console.error(`Failed to insert stock movement for product ${item.product_id}:`, movementError);
        }
      }
    }

    // ── Return completed sale ───────────────────────────

    res.status(201).json({
      ...sale,
      salesperson: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      },
      sale_items: saleItems,
    });
  } catch (err) {
    console.error('Error creating sale:', err);
    res.status(500).json({ error: 'Failed to create sale' });
  }
});

/**
 * POST /api/sales/:id/void
 * Void an existing sale.
 * Access: Managers only
 */
router.post('/:id/void', authGuard, permissionCheck('manage_sales'), async (req, res) => {
  try {
    const saleId = req.params.id;

    // 1. Fetch the sale and its items
    let query = supabaseAdmin
      .from('sales')
      .select('id, status, location_id, sale_items(product_id, quantity)')
      .eq('id', saleId);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data: sale, error: fetchError } = await query.single();

    if (fetchError || !sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.status === 'voided') {
      return res.status(400).json({ error: 'Sale is already voided' });
    }

    // 2. Mark the sale as voided
    const { error: updateError } = await supabaseAdmin
      .from('sales')
      .update({ status: 'voided' })
      .eq('id', saleId);

    if (updateError) throw updateError;

    // 3. Revert stock and log movements
    for (const item of sale.sale_items) {
      // Get current stock
      const { data: inv, error: invError } = await supabaseAdmin
        .from('product_inventory')
        .select('quantity')
        .eq('product_id', item.product_id)
        .eq('location_id', sale.location_id)
        .single();

      if (invError) continue;

      const newQty = inv.quantity + item.quantity;

      // Update product stock
      await supabaseAdmin
        .from('product_inventory')
        .update({ quantity: newQty })
        .eq('product_id', item.product_id)
        .eq('location_id', sale.location_id);

      // Log movement (VOID)
      await supabaseAdmin
        .from('stock_movements')
        .insert({
          product_id: item.product_id,
          user_id: req.user.id,
          business_id: req.user.business_id,
          location_id: sale.location_id,
          quantity_change: item.quantity,
          movement_type: 'VOID',
          reference_id: saleId,
          notes: 'Sale voided by manager'
        });
    }

    res.json({ message: 'Sale voided successfully' });
  } catch (err) {
    console.error('Error voiding sale:', err);
    res.status(500).json({ error: 'Failed to void sale' });
  }
});

module.exports = router;
