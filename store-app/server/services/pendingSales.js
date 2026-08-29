/**
 * Reversing a sale that was started and never paid for.
 *
 * process_sale_transaction writes the sale row and takes the stock down before
 * the payment screen opens, which is the right order: it reserves the goods
 * while the customer is standing there. The cost is that a sale abandoned at
 * the till leaves a `pending` row behind, holding stock off the shelf with
 * nothing to reclaim it.
 *
 * Both callers live here so they cannot drift: the till when the cashier backs
 * out, and the sweeper for every case where no browser is left to tell us,
 * which is a closed tab, a flat battery, a crash or a lost connection.
 */
const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

/**
 * Put the stock back and mark the sale reversed.
 *
 * Marks it `voided`, not `void_pending`. Those are different things and the
 * distinction reaches the accounts: `void_pending` is a finished sale whose
 * void a manager has not yet approved, so the money is in the drawer and the
 * reports count it. This sale was never paid for at all.
 *
 * @param {string} saleId
 * @param {object} [opts]
 * @param {string} [opts.reason] Recorded in the log line, not on the row.
 * @returns {Promise<{reversed: boolean, skipped?: string}>}
 */
async function reversePendingSale(saleId, opts = {}) {
  const { data: sale, error: fetchError } = await supabaseAdmin
    .from('sales')
    .select('id, business_id, status, location_id, sale_items(product_id, quantity)')
    .eq('id', saleId)
    .single();

  if (fetchError || !sale) return { reversed: false, skipped: 'not-found' };

  /* Anything else has moved on: finalised, already reversed, or awaiting a
     manager. Reversing one of those would return stock for a sale that really
     happened. */
  if (sale.status !== 'pending') return { reversed: false, skipped: sale.status };

  for (const item of sale.sale_items || []) {
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
  }

  await supabaseAdmin
    .from('inventory_units')
    .update({ status: 'in_stock', sold_in_sale_id: null })
    .eq('sold_in_sale_id', saleId);

  /* Conditional on the status still being 'pending'. Two reversals racing, the
     cashier's cancel and the sweeper, would otherwise both restore the stock
     and the shelf would gain a phantom unit. The second update matches nothing
     and returns no row. */
  const { data: updated, error: voidError } = await supabaseAdmin
    .from('sales')
    .update({ status: 'voided' })
    .eq('id', saleId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (voidError) throw voidError;
  if (!updated) return { reversed: false, skipped: 'raced' };

  logger.info(
    { saleId, businessId: sale.business_id, reason: opts.reason || 'cancelled' },
    'Pending sale reversed, stock restored',
  );
  return { reversed: true };
}

module.exports = { reversePendingSale };
