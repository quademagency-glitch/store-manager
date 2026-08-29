/**
 * Abandoned sale sweeper.
 *
 * The till reverses a sale the moment a cashier backs out of the payment
 * screen, which covers the ordinary case. This covers the cases where no
 * browser survives to tell us: a closed tab, a flat battery, a crash, a lost
 * connection mid-payment. Without it those sales sit `pending` for good,
 * holding stock off the shelf that nothing will ever reclaim, and the reports
 * were counting them as revenue until they were filtered out.
 *
 * The threshold is deliberately generous. A sale is legitimately pending only
 * while somebody is paying, which is seconds or a couple of minutes, so an
 * hour is far beyond any real payment and well short of leaving stock stranded
 * for a day.
 *
 * It also matters for offline sync. A queued offline sale is replayed in two
 * calls, create then finalize, and a device that drops out between them leaves
 * a pending sale on the server whose till still intends to finish it. An hour
 * gives that retry room, and OfflineStatus recovers a sale swept out from
 * under it by checking the status before re-posting.
 */
const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');
const { claimCronRun } = require('../utils/cronLock');
const { reversePendingSale } = require('./pendingSales');

let cron;
try {
  cron = require('node-cron');
} catch (err) {
  logger.warn('node-cron not installed. Abandoned sale sweeper will not run.');
}

/** Minutes a sale may sit pending before it is treated as abandoned. */
const THRESHOLD_MINUTES = Number(process.env.PENDING_SALE_REVERSE_MINUTES || 60);

/** Reversed per run, so one sweep cannot spend forever on a backlog. */
const BATCH = 200;

async function sweepAbandonedSales() {
  const cutoff = new Date(Date.now() - THRESHOLD_MINUTES * 60_000).toISOString();

  const { data: stale, error } = await supabaseAdmin
    .from('sales')
    .select('id, business_id, created_at')
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(BATCH);

  if (error) {
    logger.error({ err: error }, '[CRON] Could not list abandoned sales');
    return { reversed: 0, skipped: 0 };
  }
  if (!stale || stale.length === 0) return { reversed: 0, skipped: 0 };

  let reversed = 0;
  let skipped = 0;

  for (const sale of stale) {
    try {
      /* One at a time rather than a bulk status update, because putting the
         stock back is the point and it has to happen per line item. A failure
         on one sale must not abandon the rest of the batch. */
      const result = await reversePendingSale(sale.id, { reason: 'abandoned, swept' });
      if (result.reversed) reversed += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      logger.error({ err, saleId: sale.id }, '[CRON] Could not reverse abandoned sale');
    }
  }

  logger.info(
    { reversed, skipped, thresholdMinutes: THRESHOLD_MINUTES },
    '[CRON] Abandoned sale sweep complete',
  );
  return { reversed, skipped };
}

/**
 * Returns a handle with stop() so a graceful shutdown can cancel the schedule.
 */
function initPendingSaleCron() {
  if (!cron) {
    logger.warn('[CRON] node-cron not available. Abandoned sale sweeper disabled.');
    return { stop() {} };
  }

  // Claimed per slot so two replicas cannot both restore the same stock.
  const task = cron.schedule('*/5 * * * *', async () => {
    if (!(await claimCronRun('pending-sale-sweep', 'five-minutes'))) return;
    await sweepAbandonedSales();
  });

  logger.info(
    `✅ Abandoned sale sweeper initialized (every 5 minutes, reverses after ${THRESHOLD_MINUTES}m)`,
  );

  return { stop() { task.stop(); } };
}

module.exports = { initPendingSaleCron, sweepAbandonedSales, THRESHOLD_MINUTES };
