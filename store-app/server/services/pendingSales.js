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
  const { data, error } = await supabaseAdmin.rpc('cancel_pending_sale', { p_sale_id: saleId });
  if (error) throw error;
  if (data.reversed) logger.info({ saleId, reason: opts.reason || 'cancelled' }, 'Pending sale reversed, stock restored');
  return data;
}

module.exports = { reversePendingSale };
