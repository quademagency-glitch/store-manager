const { supabaseAdmin } = require('../db/supabase');

const ORDER_SELECT = `
  *,
  customer:customers!customer_id(id, name, phone, customer_code),
  items:customer_order_items(id, product_id, custom_description, quantity, unit_price,
    product:products!product_id(id, name, sku))
`;

/**
 * Thrown by createOrder for caller-facing failures (bad input, missing
 * customer). Route handlers check err.status; anything without one is a
 * genuine 500.
 */
class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Generate next customer order number for a business.
 * Format: CO-0001, CO-0002, ...
 * NOTE: count-based, not concurrency-safe, pre-existing behavior carried
 * over from routes/customerOrders.js, not fixed as part of this extraction.
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

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new OrderError(400, 'At least one line item is required');
  }
  for (const item of items) {
    if (!item.product_id && !item.custom_description) {
      throw new OrderError(400, 'Each item must have a product_id or custom_description');
    }
    if (!item.quantity || item.quantity <= 0) {
      throw new OrderError(400, 'Each item must have a positive quantity');
    }
  }
}

/**
 * Create a draft customer order with line items. Shared by the internal
 * staff route (routes/customerOrders.js) and the public storefront API
 * (routes/publicApi.js), callers are responsible for resolving/validating
 * the customer_id belongs to businessId before calling this.
 */
async function createOrder({ businessId, customerId, items, notes, dueDate, depositAmount, depositPaid, createdBy }) {
  validateItems(items);

  const orderNumber = await generateOrderNumber(businessId);

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('customer_orders')
    .insert({
      business_id:    businessId,
      customer_id:    customerId,
      order_number:   orderNumber,
      status:         'draft',
      notes:          notes || null,
      due_date:       dueDate || null,
      deposit_amount: parseFloat(depositAmount) || 0,
      deposit_paid:   depositPaid || false,
      total_amount:   0,
      created_by:     createdBy || null,
    })
    .select()
    .single();

  if (orderErr) throw orderErr;

  const itemsToInsert = items.map(item => ({
    customer_order_id:  order.id,
    product_id:          item.product_id || null,
    custom_description:  item.custom_description || null,
    quantity:            parseInt(item.quantity, 10),
    unit_price:           parseFloat(item.unit_price) || 0,
  }));

  const { error: itemsErr } = await supabaseAdmin
    .from('customer_order_items')
    .insert(itemsToInsert);

  if (itemsErr) {
    await supabaseAdmin.from('customer_orders').delete().eq('id', order.id);
    throw itemsErr;
  }

  await syncTotal(order.id);

  const { data: full } = await supabaseAdmin
    .from('customer_orders')
    .select(ORDER_SELECT)
    .eq('id', order.id)
    .single();

  return full;
}

module.exports = {
  OrderError,
  ORDER_SELECT,
  generateOrderNumber,
  syncTotal,
  createOrder,
};
