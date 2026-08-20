/**
 * Webhook Retry Cron Service
 * Sweeps webhook_deliveries every 5 minutes for anything pending a retry
 * (status='pending' with next_retry_at due) and re-attempts delivery.
 * No queue infra in this codebase, this cron sweep is the retry mechanism,
 * following the same optional node-cron pattern as subscriptionCron.js.
 */

const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');
const { attemptDelivery } = require('./webhookDispatcher');
const { claimCronRun } = require('../utils/cronLock');
const sentry = require('../instrument');

let cron;
try {
  cron = require('node-cron');
} catch (err) {
  logger.warn('node-cron not installed. Webhook retry cron will not run.');
}

async function sweepPendingDeliveries() {
  try {
    const { data: due, error } = await supabaseAdmin
      .from('webhook_deliveries')
      .select('*, webhook_endpoints(id, url, secret, status)')
      .eq('status', 'pending')
      .lte('next_retry_at', new Date().toISOString())
      .limit(100);

    if (error) {
      logger.error({ err: error }, '[CRON] Error fetching due webhook deliveries');
      return;
    }

    if (!due || due.length === 0) return;

    logger.info(`[CRON] Retrying ${due.length} webhook delivery(ies).`);

    for (const delivery of due) {
      const endpoint = delivery.webhook_endpoints;
      if (!endpoint || endpoint.status !== 'active') continue;
      await attemptDelivery(delivery, endpoint);
    }
  } catch (err) {
    sentry.captureException(err, { cron: 'webhook-retry-sweep' });
    logger.error({ err }, '[CRON] Error sweeping webhook deliveries');
  }
}

/**
 * Returns a handle with stop() so a graceful shutdown can cancel the schedule.
 */
function initWebhookRetryCron() {
  if (!cron) {
    logger.warn('[CRON] node-cron not available. Webhook retry cron disabled.');
    return { stop() {} };
  }

  // Claimed per 5-minute slot so two replicas can't both re-deliver the same
  // pending webhook, the receiving storefront would see the event twice.
  const task = cron.schedule('*/5 * * * *', async () => {
    if (!(await claimCronRun('webhook-retry-sweep', 'five-minutes'))) return;
    await sweepPendingDeliveries();
  });

  logger.info('✅ Webhook retry cron job initialized (runs every 5 minutes)');

  return { stop() { task.stop(); } };
}

module.exports = { initWebhookRetryCron, sweepPendingDeliveries };
