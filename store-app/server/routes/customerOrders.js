const express = require('express');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');

const router = express.Router();

// Valid status transitions
const STATUS_TRANSITIONS = {
  draft:     ['confirmed', 'cancelled'],
  confirmed: ['sourcing', 'cancelled'],
  sourcing:  ['ready', 'cancelled'],
  ready:     ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

/**
 * Generate next customer order number for a business.
 * Format: CO-0001, CO-0002, ...
 */
async function generateOrderNumber(businessId) {
  const { count } = await supabaseAdmin
    .from('customer_orders')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId);

  const next = (count || 0) + 1;
  return `CO-${String(next).padStart(4, '0')}`;
}

/**
 * Recalculate and persist total_amount from items.
 */
async function syncTotal(orderId) {
  const { data: items } = await supabaseAdmin
    .from('customer_order_items')
    .select('quantity, unit_price')
    .eq('customer_order_id', orderId);

  const total = (items || []).reduce((sum, i) => sum + i.quantity * parseFloat(i.unit_price), 0);

  await supabaseAdmin
    .from('customer_orders')
    .update({ total_amount: total, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  return total;
}

/**
 * GET /api/customer-orders
 * List orders with optional status/customer filter, paginated.
 */
router.get('/', authGuard, async (req, res) => {
  try {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;
    const { status, customer_id } = req.query;

    let query = supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        customer:customers!customer_id(id, name, phone, customer_code),
        items:customer_order_items(id, product_id, custom_description, quantity, unit_price,
          product:products!product_id(id, name, sku))
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }
    if (status)      query = query.eq('status', status);
    if (customer_id) query = query.eq('customer_id', customer_id);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data: data || [], total: count || 0, page, totalPages: Math.ceil((count || 0) / limit) });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching customer orders:');
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});

/**
 * GET /api/customer-orders/:id
 * Single order with full item + customer detail.
 */
router.get('/:id', authGuard, async (req, res) => {
  try {
    let query = supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        customer:customers!customer_id(id, name, phone, customer_code),
        creator:users!created_by(id, name, email),
        items:customer_order_items(id, product_id, custom_description, quantity, unit_price,
          product:products!product_id(id, name, sku, price))
      `)
      .eq('id', req.params.id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.single();
    if (error || !data) return res.status(404).json({ error: 'Customer order not found' });

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching customer order:');
    res.status(500).json({ error: 'Failed to fetch customer order' });
  }
});

/**
 * POST /api/customer-orders
 * Create a new customer order (draft) with line items.
 */
router.post('/', authGuard, async (req, res) => {
  try {
    const { customer_id, items, notes, due_date, deposit_amount, deposit_paid } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }
    for (const item of items) {
      if (!item.product_id && !item.custom_description) {
        return res.status(400).json({ error: 'Each item must have a product_id or custom_description' });
      }
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: 'Each item must have a positive quantity' });
      }
    }

    // Verify customer belongs to this business
    const { data: customer, error: custErr } = await supabaseAdmin
      .from('customers')
      .select('id, business_id')
      .eq('id', customer_id)
      .single();

    if (custErr || !customer) return res.status(404).json({ error: 'Customer not found' });
    if (req.user.role !== 'Platform Admin' && customer.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const orderNumber = await generateOrderNumber(req.user.business_id);

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('customer_orders')
      .insert({
        business_id:    req.user.business_id,
        customer_id,
        order_number:   orderNumber,
        status:         'draft',
        notes:          notes || null,
        due_date:       due_date || null,
        deposit_amount: parseFloat(deposit_amount) || 0,
        deposit_paid:   deposit_paid || false,
        total_amount:   0,
        created_by:     req.user.id,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Insert items
    const itemsToInsert = items.map(item => ({
      customer_order_id:   order.id,
      product_id:          item.product_id || null,
      custom_description:  item.custom_description || null,
      quantity:            parseInt(item.quantity, 10),
      unit_price:          parseFloat(item.unit_price) || 0,
    }));

    const { error: itemsErr } = await supabaseAdmin
      .from('customer_order_items')
      .insert(itemsToInsert);

    if (itemsErr) {
      await supabaseAdmin.from('customer_orders').delete().eq('id', order.id);
      throw itemsErr;
    }

    await syncTotal(order.id);

    // Return full order
    const { data: full } = await supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        customer:customers!customer_id(id, name, phone, customer_code),
        items:customer_order_items(id, product_id, custom_description, quantity, unit_price,
          product:products!product_id(id, name, sku))
      `)
      .eq('id', order.id)
      .single();

    res.status(201).json({ message: 'Customer order created', order: full });
  } catch (err) {
    logger.error({ err: err }, 'Error creating customer order:');
    res.status(500).json({ error: 'Failed to create customer order' });
  }
});

/**
 * PUT /api/customer-orders/:id
 * Update order details and items.
 * Items and header fields can only be edited on draft orders.
 * Notes, deposit, due_date can be updated at any non-terminal status.
 */
router.put('/:id', authGuard, async (req, res) => {
  try {
    const { id } = req.params;
    const { items, notes, due_date, deposit_amount, deposit_paid } = req.body;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('customer_orders')
      .select('id, status, business_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) return res.status(404).json({ error: 'Customer order not found' });
    if (req.user.role !== 'Platform Admin' && existing.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (['fulfilled', 'cancelled'].includes(existing.status)) {
      return res.status(400).json({ error: `Cannot edit a ${existing.status} order` });
    }

    const headerUpdate = { updated_at: new Date().toISOString() };
    if (notes          !== undefined) headerUpdate.notes          = notes;
    if (due_date       !== undefined) headerUpdate.due_date       = due_date || null;
    if (deposit_amount !== undefined) headerUpdate.deposit_amount = parseFloat(deposit_amount) || 0;
    if (deposit_paid   !== undefined) headerUpdate.deposit_paid   = deposit_paid;

    const { error: updateErr } = await supabaseAdmin
      .from('customer_orders')
      .update(headerUpdate)
      .eq('id', id);

    if (updateErr) throw updateErr;

    // Only replace items on draft orders
    if (Array.isArray(items) && existing.status === 'draft') {
      if (items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

      await supabaseAdmin.from('customer_order_items').delete().eq('customer_order_id', id);

      const itemsToInsert = items.map(item => ({
        customer_order_id:  id,
        product_id:         item.product_id || null,
        custom_description: item.custom_description || null,
        quantity:           parseInt(item.quantity, 10),
        unit_price:         parseFloat(item.unit_price) || 0,
      }));

      const { error: itemsErr } = await supabaseAdmin
        .from('customer_order_items')
        .insert(itemsToInsert);

      if (itemsErr) throw itemsErr;
      await syncTotal(id);
    }

    const { data: updated } = await supabaseAdmin
      .from('customer_orders')
      .select(`
        *,
        customer:customers!customer_id(id, name, phone, customer_code),
        items:customer_order_items(id, product_id, custom_description, quantity, unit_price,
          product:products!product_id(id, name, sku))
      `)
      .eq('id', id)
      .single();

    res.json({ message: 'Customer order updated', order: updated });
  } catch (err) {
    logger.error({ err: err }, 'Error updating customer order:');
    res.status(500).json({ error: 'Failed to update customer order' });
  }
});

/**
 * PUT /api/customer-orders/:id/status
 * Transition order status.
 */
router.put('/:id/status', authGuard, async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body;

    if (!newStatus) return res.status(400).json({ error: 'status is required' });

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('customer_orders')
      .select('id, status, business_id')
      .eq('id', id)
      .single();

    if (fetchErr || !order) return res.status(404).json({ error: 'Customer order not found' });
    if (req.user.role !== 'Platform Admin' && order.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const allowed = STATUS_TRANSITIONS[order.status] || [];
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({
        error: `Cannot move from '${order.status}' to '${newStatus}'. Allowed: ${allowed.join(', ') || 'none'}`
      });
    }

    const update = {
      status:     newStatus,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === 'fulfilled') update.fulfilled_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('customer_orders')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: `Order moved to '${newStatus}'`, order: data });
  } catch (err) {
    logger.error({ err: err }, 'Error updating order status:');
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

/**
 * DELETE /api/customer-orders/:id
 * Delete a draft order.
 */
router.delete('/:id', authGuard, async (req, res) => {
  try {
    if (req.user.role !== 'Business Admin' && req.user.role !== 'Platform Admin') {
      return res.status(403).json({ error: 'Only Business Admins can delete orders' });
    }

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from('customer_orders')
      .select('id, status, business_id')
      .eq('id', req.params.id)
      .single();

    if (fetchErr || !order) return res.status(404).json({ error: 'Customer order not found' });
    if (req.user.role !== 'Platform Admin' && order.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    if (!['draft', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: 'Only draft or cancelled orders can be deleted' });
    }

    const { error } = await supabaseAdmin.from('customer_orders').delete().eq('id', req.params.id);
    if (error) throw error;

    res.json({ message: 'Customer order deleted' });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting customer order:');
    res.status(500).json({ error: 'Failed to delete customer order' });
  }
});

module.exports = router;
