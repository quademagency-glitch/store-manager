/**
 * Subscription Cron Service
 * Runs daily to:
 * 1. Auto-suspend businesses with expired subscriptions
 * 2. Send 3-day expiration warning emails
 * 3. Convert expired trials to 'expired' status
 * 4. Remind self-serve trials, once, that they end within 3 days
 */

const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');
const { sendExpirationWarning, sendSuspensionNotice, sendTrialEndingReminder } = require('./emailService');
const { claimCronRun, pruneCronRuns } = require('../utils/cronLock');
const { invalidateBusinessCache } = require('../middleware/authGuard');
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

      // Runs in the PRIMARY, which holds no cache of its own, cacheBus.publish
      // detects that and broadcasts straight to the workers. Without it a
      // suspended business would keep working for up to the cache TTL.
      invalidateBusinessCache(sub.business_id);

      // Automated, so the audit row has no human actor, see
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
 * These have no `business_subscriptions` row at all, nobody has paid, so
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
      invalidateBusinessCache(biz.id);
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

const DAY_MS = 24 * 60 * 60 * 1000;
/* Three days, matching the paid-subscription warning above, so a customer on
   either path hears at the same point. */
const TRIAL_REMINDER_WINDOW_MS = 3 * DAY_MS;

/**
 * Remind a self-serve trial, once, that it ends within three days.
 *
 * Until 2026-09-11 nothing did. sendExpirationWarnings reads
 * business_subscriptions, which a self-serve trial never has, and
 * processExpiredTrials below sends nothing, so a real signup reached day 30
 * with no warning and no notice.
 *
 * ONCE, AND ONLY ONCE. The window is three days wide and this runs daily, so
 * businesses.trial_reminder_sent_at (migration 078) records the send. It is
 * claimed with a conditional update BEFORE sending, so only the run whose
 * update matched a null sends, and it is released if the send fails so the
 * next day retries. claimCronRun already stops two workers running on the
 * same day, but a manual run or a pruned claim row would otherwise send
 * twice, and a duplicate email to a prospect is worse than a late one.
 *
 * If the column is missing the whole sweep is skipped rather than run
 * without it. Without the record there is no way to send once, only daily.
 */
async function sendTrialEndingReminders() {
  logger.info('[CRON] Checking for free trials ending soon...');

  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + TRIAL_REMINDER_WINDOW_MS);

    const { data: ending, error } = await supabaseAdmin
      .from('businesses')
      .select('id, name, slug, contact_email, trial_ends_at, trial_reminder_sent_at')
      .eq('status', 'trialing')
      .eq('is_demo', false)
      .is('trial_reminder_sent_at', null)
      .gt('trial_ends_at', now.toISOString())
      .lte('trial_ends_at', horizon.toISOString());

    if (error) {
      if (/trial_reminder_sent_at|PGRST204|42703/.test(`${error.code} ${error.message}`)) {
        logger.warn('[CRON] businesses.trial_reminder_sent_at is missing; migration 078 not applied. Trial reminders skipped.');
        return;
      }
      logger.error({ err: error }, '[CRON] Error fetching trials ending soon');
      return;
    }

    if (!ending || ending.length === 0) {
      logger.info('[CRON] No free trials ending soon.');
      return;
    }

    for (const biz of ending) {
      if (!biz.contact_email) {
        logger.warn({ businessId: biz.id }, '[CRON] Trial ending soon but no contact_email; no reminder possible');
        continue;
      }

      const claimedAt = new Date().toISOString();
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from('businesses')
        .update({ trial_reminder_sent_at: claimedAt })
        .eq('id', biz.id)
        .is('trial_reminder_sent_at', null)
        .select('id');

      if (claimError) {
        logger.error({ err: claimError, businessId: biz.id }, '[CRON] Could not claim trial reminder');
        continue;
      }
      if (!claimed || claimed.length === 0) continue; // already sent by another run

      const daysLeft = Math.max(1, Math.ceil((new Date(biz.trial_ends_at) - now) / DAY_MS));
      let result;
      try {
        result = await sendTrialEndingReminder(biz, { daysLeft, trialEndsAt: biz.trial_ends_at });
      } catch (err) {
        result = { success: false, error: err.message };
      }

      if (!result?.success) {
        // Released by matching our own stamp, so a release can never clear a
        // reminder that a later run has since sent.
        await supabaseAdmin
          .from('businesses')
          .update({ trial_reminder_sent_at: null })
          .eq('id', biz.id)
          .eq('trial_reminder_sent_at', claimedAt);
        logger.error({ businessId: biz.id, error: result?.error }, '[CRON] Trial reminder failed; claim released for tomorrow');
        continue;
      }

      logger.info({ businessId: biz.id, name: biz.name, daysLeft }, '[CRON] Sent trial ending reminder');
    }
  } catch (err) {
    logger.error({ err }, '[CRON] Error sending trial reminders');
  }
}

/**
 * Run all subscription checks
 */
async function runSubscriptionChecks() {
  logger.info('[CRON] === Running daily subscription checks ===');
  await sendExpirationWarnings();
  await sendTrialEndingReminders();
  await processExpiredSubscriptions();
  await processExpiredTrials();
  logger.info('[CRON] === Subscription checks complete ===');
}

/**
 * Initialize the cron job, runs daily at midnight.
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
  // has already happened, previously every redeploy triggered a fresh full
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
  sendTrialEndingReminders,
};
