/**
 * Subscription Cron Service
 * Runs daily to:
 * 1. Auto-suspend businesses with expired subscriptions
 * 2. Send 3-day expiration warning emails
 * 3. Convert expired trials to 'expired' status
 */

const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');
const { sendExpirationWarning, sendSuspensionNotice } = require('./emailService');

let cron;
try {
  cron = require('node-cron');
} catch (err) {
  logger.warn('node-cron not installed. Subscription cron will not run.');
}

/**
 * Check for expired subscriptions and auto-suspend businesses
 */
async function processExpiredSubscriptions() {
  logger.info('[CRON] Checking for expired subscriptions...');

  try {
    // Find all subscriptions that have expired (period_end is past, status is still active/trialing)
    const { data: expired, error } = await supabaseAdmin
      .from('business_subscriptions')
      .select('*, businesses(*), platform_plans(name)')
      .in('status', ['active', 'trialing', 'past_due'])
      .lt('current_period_end', new Date().toISOString());

    if (error) {
      logger.error('[CRON] Error fetching expired subscriptions:', error);
      return;
    }

    if (!expired || expired.length === 0) {
      logger.info('[CRON] No expired subscriptions found.');
      return;
    }

    logger.info(`[CRON] Found ${expired.length} expired subscription(s).`);

    for (const sub of expired) {
      // Check if this is a free plan (don't suspend free plans)
      if (sub.amount <= 0) {
        // Just renew the free plan automatically
        const newPeriodEnd = new Date();
        newPeriodEnd.setDate(newPeriodEnd.getDate() + 30);

        await supabaseAdmin
          .from('business_subscriptions')
          .update({
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: newPeriodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);

        logger.info(`[CRON] Auto-renewed free plan for business: ${sub.businesses?.name}`);
        continue;
      }

      // Mark subscription as expired
      await supabaseAdmin
        .from('business_subscriptions')
        .update({
          status: 'expired',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id);

      // Suspend the business (set status to 'banned')
      await supabaseAdmin
        .from('businesses')
        .update({ status: 'banned' })
        .eq('id', sub.business_id);

      // Send suspension notice email
      if (sub.businesses) {
        await sendSuspensionNotice(sub.businesses);
      }

      logger.info(`[CRON] Suspended business: ${sub.businesses?.name} (subscription expired)`);
    }
  } catch (err) {
    logger.error('[CRON] Error processing expired subscriptions:', err);
  }
}

/**
 * Send warnings for subscriptions expiring in 3 days
 */
async function sendExpirationWarnings() {
  logger.info('[CRON] Checking for subscriptions expiring soon...');

  try {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const now = new Date();

    // Find subscriptions expiring in the next 3 days
    const { data: expiring, error } = await supabaseAdmin
      .from('business_subscriptions')
      .select('*, businesses(*), platform_plans(name)')
      .in('status', ['active', 'trialing'])
      .gt('current_period_end', now.toISOString())
      .lte('current_period_end', threeDaysFromNow.toISOString())
      .gt('amount', 0); // Don't warn for free plans

    if (error) {
      logger.error('[CRON] Error fetching expiring subscriptions:', error);
      return;
    }

    if (!expiring || expiring.length === 0) {
      logger.info('[CRON] No subscriptions expiring soon.');
      return;
    }

    logger.info(`[CRON] Found ${expiring.length} subscription(s) expiring within 3 days.`);

    for (const sub of expiring) {
      const daysLeft = Math.ceil(
        (new Date(sub.current_period_end) - now) / (1000 * 60 * 60 * 24)
      );

      if (sub.businesses) {
        await sendExpirationWarning(sub.businesses, sub, daysLeft);
        logger.info(`[CRON] Sent expiration warning to ${sub.businesses.name} (${daysLeft} days left)`);
      }
    }
  } catch (err) {
    logger.error('[CRON] Error sending expiration warnings:', err);
  }
}

/**
 * Run all subscription checks
 */
async function runSubscriptionChecks() {
  logger.info('[CRON] === Running daily subscription checks ===');
  await sendExpirationWarnings();
  await processExpiredSubscriptions();
  logger.info('[CRON] === Subscription checks complete ===');
}

/**
 * Initialize the cron job — runs daily at midnight
 */
function initSubscriptionCron() {
  if (!cron) {
    logger.warn('[CRON] node-cron not available. Subscription cron disabled.');
    return;
  }

  // Run daily at midnight
  cron.schedule('0 0 * * *', () => {
    runSubscriptionChecks();
  }, {
    timezone: 'Africa/Accra' // Ghana timezone
  });

  logger.info('✅ Subscription cron job initialized (runs daily at midnight GMT)');

  // Also run immediately on startup (after a short delay to let the server settle)
  setTimeout(() => {
    logger.info('[CRON] Running initial subscription check...');
    runSubscriptionChecks();
  }, 5000);
}

module.exports = {
  initSubscriptionCron,
  runSubscriptionChecks,
  processExpiredSubscriptions,
  sendExpirationWarnings,
};
