const express = require('express');
const logger = require('../utils/logger');
const { getPagination, buildPaginationMeta } = require('../utils/paginate');
const { supabaseAdmin } = require('../db/supabase');
const authGuard = require('../middleware/authGuard');
const permissionCheck = require('../middleware/permissionCheck');
const { invalidateCachePrefix } = require('../middleware/apiCache');
const { resolveCurrency } = require('../utils/currency');

const router = express.Router();

/**
 * Helper: Generate next PO number for a business.
 * Uses the po_number_sequences table with upsert for atomicity.
 */
async function generatePoNumber(businessId) {
  const { data, error } = await supabaseAdmin.rpc('generate_po_number', {
    p_business_id: businessId
  });

  if (error) {
    // Fallback: generate from timestamp if RPC fails
    logger.error({ err: error }, 'PO number generation RPC failed, using fallback:');
    return `PO-${Date.now().toString(36).toUpperCase()}`;
  }

  return data;
}

/**
 * GET /api/purchase-orders
 * List purchase orders (paginated, filterable by status).
 * Access: Inventory managers
 */
router.get('/', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const statusFilter = req.query.status; // optional: draft, sent, partial, received, cancelled

    /* Do NOT embed `creator:users!created_by` or `receiver:users!received_by`
       here. purchase_orders.created_by and received_by are foreign keys to
       auth.users, NOT to public.users, so PostgREST has no relationship to
       follow and answers the whole request with
       PGRST200 "Could not find a relationship between 'purchase_orders' and
       'users' in the schema cache".

       One unresolvable embed fails the ENTIRE select, so this route and the
       detail route below both returned 500 and the purchase order list was
       always empty. Creating a PO worked, because POST does not embed users,
       which made it look as though saving a PO silently lost it. Reported
       exactly that way on 2026-09-14, with the PO sitting in the table the
       whole time.

       Nothing rendered these fields; they were dead weight that broke the
       feature. If a creator name is ever wanted, read public.users
       separately by id (public.users.id IS the auth user id) and stitch. */
    let query = supabaseAdmin
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers!supplier_id(id, name, contact_person),
        items:purchase_order_items(
          id, product_id, quantity, received_quantity, unit_cost, total,
          product:products!product_id(id, name, sku)
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      data: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching purchase orders:');
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

/**
 * GET /api/purchase-orders/:id
 * Get a single PO with full details.
 * Access: Inventory managers
 */
router.get('/:id', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    let query = supabaseAdmin
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers!supplier_id(id, name, contact_person, phone, email, address),
        items:purchase_order_items(
          id, product_id, quantity, received_quantity, unit_cost, total, notes,
          product:products!product_id(id, name, sku, price, category)
        )
      `)
      .eq('id', id);

    if (req.user.role !== 'Platform Admin') {
      query = query.eq('business_id', req.user.business_id);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching purchase order:');
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

/**
 * POST /api/purchase-orders
 * Create a new purchase order (draft) with line items.
 * PO number is auto-generated.
 * Access: Inventory managers
 */
router.post('/', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { supplier_id, items, expected_date, notes } = req.body;

    if (!supplier_id) {
      return res.status(400).json({ error: 'Bad request', message: 'supplier_id is required.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Bad request', message: 'At least one line item is required.' });
    }

    // Validate items
    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: 'Bad request', message: 'Each item must have a product_id and positive quantity.' });
      }
    }

    const currency = await resolveCurrency(supabaseAdmin, req.user.business_id, req.user.active_location_id);

    // Generate PO number
    const poNumber = await generatePoNumber(req.user.business_id);

    // Create PO
    const { data: po, error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .insert({
        business_id: req.user.business_id,
        supplier_id,
        po_number: poNumber,
        status: 'draft',
        expected_date: expected_date || null,
        notes: notes || null,
        currency,
        created_by: req.user.id,
        total_amount: 0
      })
      .select()
      .single();

    if (poErr) throw poErr;

    // Insert line items
    const itemsToInsert = items.map(item => ({
      purchase_order_id: po.id,
      product_id: item.product_id,
      quantity: parseInt(item.quantity, 10),
      unit_cost: parseFloat(item.unit_cost) || 0,
      received_quantity: 0,
      notes: item.notes || null
    }));

    const { error: itemsErr } = await supabaseAdmin
      .from('purchase_order_items')
      .insert(itemsToInsert);

    if (itemsErr) {
      // Rollback: delete the PO if items failed
      await supabaseAdmin.from('purchase_orders').delete().eq('id', po.id);
      throw itemsErr;
    }

    // Fetch the complete PO with items
    const { data: completePO } = await supabaseAdmin
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers!supplier_id(id, name),
        items:purchase_order_items(
          id, product_id, quantity, received_quantity, unit_cost, total,
          product:products!product_id(id, name, sku)
        )
      `)
      .eq('id', po.id)
      .single();

    res.status(201).json({
      message: 'Purchase order created',
      purchase_order: completePO
    });
  } catch (err) {
    logger.error({ err: err }, 'Error creating purchase order:');
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
});

/**
 * PUT /api/purchase-orders/:id
 * Update PO details and items (only if draft).
 * Access: Inventory managers
 */
router.put('/:id', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;
    const { supplier_id, items, expected_date, notes } = req.body;

    // Verify PO exists and is in draft status
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status, business_id')
      .eq('id', id)
      .single();

    if (fetchErr || !existing) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    if (req.user.role !== 'Platform Admin' && existing.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (existing.status !== 'draft') {
      return res.status(400).json({ error: 'Bad request', message: 'Only draft purchase orders can be edited.' });
    }

    // Update PO header
    const updatePayload = { updated_at: new Date().toISOString() };
    if (supplier_id) updatePayload.supplier_id = supplier_id;
    if (expected_date !== undefined) updatePayload.expected_date = expected_date || null;
    if (notes !== undefined) updatePayload.notes = notes;

    const { error: updateErr } = await supabaseAdmin
      .from('purchase_orders')
      .update(updatePayload)
      .eq('id', id);

    if (updateErr) throw updateErr;

    // Replace items if provided
    if (Array.isArray(items)) {
      // Delete existing items
      await supabaseAdmin
        .from('purchase_order_items')
        .delete()
        .eq('purchase_order_id', id);

      // Insert new items
      if (items.length > 0) {
        const itemsToInsert = items.map(item => ({
          purchase_order_id: id,
          product_id: item.product_id,
          quantity: parseInt(item.quantity, 10),
          unit_cost: parseFloat(item.unit_cost) || 0,
          received_quantity: 0,
          notes: item.notes || null
        }));

        const { error: itemsErr } = await supabaseAdmin
          .from('purchase_order_items')
          .insert(itemsToInsert);

        if (itemsErr) throw itemsErr;
      }
    }

    // Fetch updated PO
    const { data: updatedPO } = await supabaseAdmin
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers!supplier_id(id, name),
        items:purchase_order_items(
          id, product_id, quantity, received_quantity, unit_cost, total,
          product:products!product_id(id, name, sku)
        )
      `)
      .eq('id', id)
      .single();

    res.json({ message: 'Purchase order updated', purchase_order: updatedPO });
  } catch (err) {
    logger.error({ err: err }, 'Error updating purchase order:');
    res.status(500).json({ error: 'Failed to update purchase order' });
  }
});

/**
 * PUT /api/purchase-orders/:id/send
 * Mark a draft PO as "sent" to the supplier.
 * Access: Inventory managers
 */
router.put('/:id/send', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: po, error: fetchErr } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status, business_id')
      .eq('id', id)
      .single();

    if (fetchErr || !po) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    if (req.user.role !== 'Platform Admin' && po.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (po.status !== 'draft') {
      return res.status(400).json({ error: 'Bad request', message: `Cannot send a PO that is in '${po.status}' status.` });
    }

    const { data, error } = await supabaseAdmin
      .from('purchase_orders')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Purchase order sent', purchase_order: data });
  } catch (err) {
    logger.error({ err: err }, 'Error sending purchase order:');
    res.status(500).json({ error: 'Failed to send purchase order' });
  }
});

/**
 * PUT /api/purchase-orders/:id/cancel
 * Cancel a PO (only if draft or sent).
 * Access: Inventory managers
 */
router.put('/:id/cancel', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: po, error: fetchErr } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status, business_id')
      .eq('id', id)
      .single();

    if (fetchErr || !po) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    if (req.user.role !== 'Platform Admin' && po.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!['draft', 'sent'].includes(po.status)) {
      return res.status(400).json({ error: 'Bad request', message: `Cannot cancel a PO that is in '${po.status}' status.` });
    }

    const { data, error } = await supabaseAdmin
      .from('purchase_orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Purchase order cancelled', purchase_order: data });
  } catch (err) {
    logger.error({ err: err }, 'Error cancelling purchase order:');
    res.status(500).json({ error: 'Failed to cancel purchase order' });
  }
});

/**
 * POST /api/purchase-orders/:id/receive
 * Receive goods against a PO.
 * - Updates received_quantity on PO items
 * - Adjusts product_inventory stock
 * - Creates stock_movements (RECEIPT)
 * - Updates PO status (partial / received)
 * Access: Inventory managers
 */
router.post('/:id/receive', authGuard, permissionCheck('manage_inventory'), async (req, res) => {
  try {
    const { id } = req.params;
    const { items, location_id, notes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Bad request', message: 'Items array with received quantities is required.' });
    }

    if (!location_id) {
      return res.status(400).json({ error: 'Bad request', message: 'location_id is required to receive goods.' });
    }

    // Fetch PO with items
    const { data: po, error: fetchErr } = await supabaseAdmin
      .from('purchase_orders')
      .select(`
        *,
        items:purchase_order_items(id, product_id, quantity, received_quantity, unit_cost),
        supplier:suppliers!supplier_id(name)
      `)
      .eq('id', id)
      .single();

    if (fetchErr || !po) {
      return res.status(404).json({ error: 'Purchase order not found.' });
    }

    if (req.user.role !== 'Platform Admin' && po.business_id !== req.user.business_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!['sent', 'partial'].includes(po.status)) {
      return res.status(400).json({ error: 'Bad request', message: `Cannot receive goods on a PO in '${po.status}' status.` });
    }

    const receivedItems = [];

    for (const receiveItem of items) {
      const { item_id, received_qty } = receiveItem;
      if (!item_id || !received_qty || received_qty <= 0) continue;

      // Find the PO item
      const poItem = po.items.find(i => i.id === item_id);
      if (!poItem) continue;

      // Validate not over-receiving
      const maxReceivable = poItem.quantity - poItem.received_quantity;
      const actualReceive = Math.min(received_qty, maxReceivable);
      if (actualReceive <= 0) continue;

      // Update received_quantity on PO item
      const { error: updateItemErr } = await supabaseAdmin
        .from('purchase_order_items')
        .update({ received_quantity: poItem.received_quantity + actualReceive })
        .eq('id', item_id);

      if (updateItemErr) {
        logger.error({ err: updateItemErr }, 'Error updating PO item:');
        continue;
      }

      // Upsert product_inventory, add received qty
      const { data: currentInv } = await supabaseAdmin
        .from('product_inventory')
        .select('quantity')
        .eq('product_id', poItem.product_id)
        .eq('location_id', location_id)
        .single();

      const newQty = (currentInv?.quantity || 0) + actualReceive;

      await supabaseAdmin
        .from('product_inventory')
        .upsert({
          product_id: poItem.product_id,
          location_id,
          quantity: newQty
        }, { onConflict: 'product_id,location_id' });

      /* Record what the goods actually cost.
       *
       * Receiving used to read unit_cost, put it in the response, and never
       * write it anywhere. So a shop could receive five air conditioners at
       * GHS 4,500 each and the product's cost_price stayed 0.00: every margin
       * read as if the stock were free, and "Set price from cost" skipped the
       * product entirely because it has no cost to mark up.
       *
       * Last cost wins, deliberately, rather than a weighted average against
       * the existing figure. Nearly every product here still has cost_price 0
       * because bulk import never captured one, and averaging against that
       * zero would invent a cost far below what was really paid. A zero or
       * missing unit_cost on the line is left alone for the same reason: it
       * means "not recorded", not "free".
       */
      const unitCost = parseFloat(poItem.unit_cost);
      if (Number.isFinite(unitCost) && unitCost > 0) {
        const { error: costErr } = await supabaseAdmin
          .from('products')
          .update({ cost_price: unitCost })
          .eq('id', poItem.product_id)
          .eq('business_id', req.user.business_id);

        if (costErr) logger.error({ err: costErr, product_id: poItem.product_id }, 'Failed to update cost price on receipt:');
      }

      // Create stock movement
      await supabaseAdmin.from('stock_movements').insert({
        product_id: poItem.product_id,
        user_id: req.user.id,
        business_id: req.user.business_id,
        location_id,
        quantity_change: actualReceive,
        movement_type: 'RECEIPT',
        reference_id: po.id,
        notes: `PO ${po.po_number}, received ${actualReceive} units${notes ? '. ' + notes : ''}`
      });

      receivedItems.push({
        product_id: poItem.product_id,
        quantity: actualReceive,
        unit_cost: poItem.unit_cost
      });
    }

    /* Receiving changes both the stock counts and the cost prices that
       GET /api/products serves, and that route is wrapped in apiCache(5). */
    if (receivedItems.length > 0) invalidateCachePrefix('/api/products');

    // Determine new PO status
    const { data: updatedItems } = await supabaseAdmin
      .from('purchase_order_items')
      .select('quantity, received_quantity')
      .eq('purchase_order_id', id);

    const allFullyReceived = (updatedItems || []).every(i => i.received_quantity >= i.quantity);
    const anyReceived = (updatedItems || []).some(i => i.received_quantity > 0);

    let newStatus = po.status;
    if (allFullyReceived) {
      newStatus = 'received';
    } else if (anyReceived) {
      newStatus = 'partial';
    }

    const poUpdate = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    if (newStatus === 'received') {
      poUpdate.received_date = new Date().toISOString().split('T')[0];
      poUpdate.received_by = req.user.id;
    }

    await supabaseAdmin
      .from('purchase_orders')
      .update(poUpdate)
      .eq('id', id);

    // Fetch updated PO for response
    const { data: finalPO } = await supabaseAdmin
      .from('purchase_orders')
      .select(`
        *,
        supplier:suppliers!supplier_id(id, name),
        items:purchase_order_items(
          id, product_id, quantity, received_quantity, unit_cost, total,
          product:products!product_id(id, name, sku)
        )
      `)
      .eq('id', id)
      .single();

    res.json({
      message: `Goods received. ${receivedItems.length} item(s) processed. PO status: ${newStatus}`,
      purchase_order: finalPO,
      received_items: receivedItems,
      grn_data: {
        po_number: po.po_number,
        supplier_name: po.supplier?.name || 'Unknown',
        items: receivedItems,
        notes: notes || '',
        date: new Date().toISOString(),
        received_by: req.user.name || req.user.email
      }
    });
  } catch (err) {
    logger.error({ err: err }, 'Error receiving goods:');
    res.status(500).json({ error: 'Failed to receive goods' });
  }
});

module.exports = router;
