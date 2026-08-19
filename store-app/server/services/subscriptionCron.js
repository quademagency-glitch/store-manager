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
const { claimCronRun, pruneCronRuns } = require('../utils/cronLock');
const { logAuditEvent, systemAuditContext, pruneAuditLogs, AUDIT_ACTIONS } = require('../utils/auditLog');
const sentry = require('../instrument');

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
      .select('*, businesses!inner(*), platform_plans(name)')
      .in('status', ['active', 'trialing', 'past_due'])
      // The public sandbox has no subscription today, so this changes nothing
      // yet. It is here so that giving the demo a plan for testing can never
      // suspend it or email a suspension notice to demo@quaderp.app.
      .eq('businesses.is_demo', false)
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

      // Automated, so the audit row has no human actor — see
      // systemAuditContext. Without this an owner locked out overnight has
      // nothing showing why.
      logAuditEvent(
        systemAuditContext(sub.business_id, 'subscription-checks'),
        AUDIT_ACTIONS.BUSINESS_STATUS_CHANGED,
        'business',
        sub.business_id,
        { to_status: 'banned', reason: 'subscription_expired' },
      );

      // Send suspension notice email
      if (sub.businesses) {
        await sendSuspensionNotice(sub.businesses);
      }

      logger.info(`[CRON] Suspended business: ${sub.businesses?.name} (subscription expired)`);
    }
  } catch (err) {
    sentry.captureException(err, { cron: 'subscription-checks', stage: 'expired-subscriptions' });
    logger.error({ err }, '[CRON] Error processing expired subscriptions');
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
 * Lapse self-service free trials whose clock has run out.
 *
 * These have no `business_subscriptions` row at all — nobody has paid, so
 * there is nothing to bill against. The trial lives entirely on the business
 * row (`status = 'trialing'`, `trial_ends_at`), so it has to be swept
 * separately from the subscription checks above.
 *
 * Lands on 'expired', never 'banned': an expired trial is a sales state, and
 * the owner must still be able to sign in and pay. authGuard narrows an
 * expired business down to billing rather than locking it out.
 */
async function processExpiredTrials() {
  logger.info('[CRON] Checking for expired free trials...');

  try {
    const { data: lapsed, error } = await supabaseAdmin
      .from('businesses')
      .update({ status: 'expired' })
      .eq('status', 'trialing')
      .eq('is_demo', false)
      .lt('trial_ends_at', new Date().toISOString())
      .select('id, name, contact_email');

    if (error) {
      logger.error({ err: error }, '[CRON] Error expiring trials');
      return;
    }

    if (!lapsed || lapsed.length === 0) {
      logger.info('[CRON] No trials expired today.');
      return;
    }

    for (const biz of lapsed) {
      logAuditEvent(
        systemAuditContext(biz.id, 'subscription-checks'),
        AUDIT_ACTIONS.BUSINESS_STATUS_CHANGED,
        'business',
        biz.id,
        { to_status: 'expired', reason: 'trial_lapsed' },
      );
    }

    for (const business of lapsed) {
      logger.info({ businessId: business.id, name: business.name }, '[CRON] Free trial expired');
    }
    logger.info(`[CRON] Expired ${lapsed.length} free trial(s).`);
  } catch (err) {
    logger.error({ err }, '[CRON] Error processing expired trials');
  }
}

/**
 * Run all subscription checks
 */
async function runSubscriptionChecks() {
  logger.info('[CRON] === Running daily subscription checks ===');
  await sendExpirationWarnings();
  await processExpiredSubscriptions();
  await processExpiredTrials();
  logger.info('[CRON] === Subscription checks complete ===');
}

/**
 * Initialize the cron job — runs daily at midnight.
 *
 * Returns a handle with stop(), so a graceful shutdown can cancel both the
 * schedule and the pending startup run instead of letting them fire into a
 * process that is already draining.
 */
function initSubscriptionCron() {
  if (!cron) {
    logger.warn('[CRON] node-cron not available. Subscription cron disabled.');
    return { stop() {} };
  }

  // Claim the day's slot before doing anything. Without this, every Railway
  // replica's primary runs the same check and customers get duplicate
  // suspension and expiry emails.
  const runIfClaimed = async (reason) => {
    if (!(await claimCronRun('subscription-checks', 'day'))) return;
    logger.info({ reason }, '[CRON] Running subscription checks');
    await runSubscriptionChecks();
    await pruneCronRuns();
    // Piggy-backed on the existing daily job rather than adding a fourth cron:
    // audit_logs is the highest-insert table here and grows without bound.
    await pruneAuditLogs();
  };

  // Run daily at midnight
  const task = cron.schedule('0 0 * * *', () => {
    runIfClaimed('schedule');
  }, {
    timezone: 'Africa/Accra' // Ghana timezone
  });

  logger.info('✅ Subscription cron job initialized (runs daily at midnight GMT)');

  // Also run shortly after startup. NOTE: this now no-ops when the day's run
  // has already happened — previously every redeploy triggered a fresh full
  // check. That is the intended trade for not emailing customers twice.
  const startupTimer = setTimeout(() => {
    runIfClaimed('startup');
  }, 5000);

  return {
    stop() {
      clearTimeout(startupTimer);
      task.stop();
    },
  };
}

module.exports = {
  initSubscriptionCron,
  runSubscriptionChecks,
  processExpiredSubscriptions,
  processExpiredTrials,
  sendExpirationWarnings,
};
