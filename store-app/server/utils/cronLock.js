/**
 * Cross-process/replica locking for scheduled jobs.
 *
 * WHY: cluster.js runs the crons in the primary process, which makes them run
 * once per *replica*. That is correct at 1 replica and wrong at any more, each
 * replica has its own primary, so scaling out silently doubles every job.
 * For subscriptionCron that means duplicate suspension emails; for
 * demoResetCron it means two concurrent teardown-and-reseed cycles of the same
 * tenant, which is destructive.
 *
 * Postgres advisory locks would be the obvious tool and are not usable here:
 * queries go through PostgREST via the Supabase client, and each request may
 * land on a different pooled connection, so a session-scoped lock cannot be
 * held for the duration of a job.
 *
 * Instead this is a claim table (public.cron_runs, migration 069). Each job
 * INSERTs a row keyed by (job_name, scheduled_for) before doing any work.
 * Exactly one INSERT can succeed per slot; everyone else gets a unique
 * violation and stands down. No lock to release, no lease to renew, and a
 * crashed job simply leaves its claim behind, which is the safe failure
 * direction for jobs that email customers or rebuild tenants.
 */

const os = require('node:os');
const { supabaseAdmin } = require('../db/supabase');
const logger = require('./logger');

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Round a time down to a bucket, so every instance computing "the current slot"
 * independently arrives at the same timestamp and therefore collides.
 *
 * @param {Date} date
 * @param {'day'|'five-minutes'} granularity
 */
function bucketFor(date, granularity) {
  const d = new Date(date);
  if (granularity === 'day') {
    d.setUTCHours(0, 0, 0, 0);
  } else {
    d.setUTCSeconds(0, 0);
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5);
  }
  return d;
}

/**
 * Try to claim a run slot.
 *
 * @param {string} jobName
 * @param {'day'|'five-minutes'} granularity
 * @param {Date} [now]
 * @returns {Promise<boolean>} true if this process owns the slot and should work.
 */
async function claimCronRun(jobName, granularity, now = new Date()) {
  const scheduledFor = bucketFor(now, granularity);

  const { error } = await supabaseAdmin
    .from('cron_runs')
    .insert([{
      job_name: jobName,
      scheduled_for: scheduledFor.toISOString(),
      instance: `${os.hostname()}:${process.pid}`,
    }]);

  if (!error) return true;

  if (error.code === PG_UNIQUE_VIOLATION) {
    logger.info({ jobName, scheduledFor: scheduledFor.toISOString() },
      '[CRON] Slot already claimed by another instance, skipping');
    return false;
  }

  // Anything else (table missing because 069 hasn't been applied, network
  // blip, RLS misconfiguration) must NOT silently disable the job. Failing
  // open keeps today's single-replica behaviour exactly as it is; the only
  // cost of being wrong is the duplicate-run risk that existed before this
  // file, and a loud log line.
  logger.error({ err: error, jobName },
    '[CRON] Could not claim run slot, proceeding anyway (fail-open)');
  return true;
}

/**
 * Delete claims older than `days`. The table is append-only otherwise and would
 * grow forever; nothing reads rows this old.
 */
async function pruneCronRuns(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from('cron_runs').delete().lt('started_at', cutoff);
  if (error) logger.warn({ err: error }, '[CRON] Failed to prune cron_runs');
}

module.exports = { claimCronRun, pruneCronRuns, bucketFor, PG_UNIQUE_VIOLATION };
