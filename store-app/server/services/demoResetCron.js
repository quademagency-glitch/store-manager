/**
 * Keeps the public demo business fresh.
 *
 * Visitors can add products, ring up sales and edit customers — that is the
 * point of a sandbox — so without a reset the demo drifts into whatever the
 * last person left behind. A nightly rebuild puts it back to a store that
 * looks like a going concern.
 *
 * Two separate behaviours, deliberately:
 *
 *   startup   seeds only if there is no demo business at all. Restarting the
 *             API must not wipe the sandbox out from under someone mid-browse,
 *             and Railway restarts on every deploy.
 *   nightly   full teardown and rebuild, at 02:00 Accra time — after the
 *             subscription cron at midnight, and while nobody is looking.
 */

const logger = require('../utils/logger');
const { isDemoEnabled } = require('../config/demo');

let cron;
try {
  cron = require('node-cron');
} catch {
  logger.warn('node-cron not installed. Demo reset cron will not run.');
}

async function runDemoReset({ ifEmpty = false } = {}) {
  if (!isDemoEnabled()) return;

  try {
    // Required here rather than at the top of the file so the seeder — and
    // the `pg` driver it needs to rebuild the sandbox — is loaded only when a
    // reset actually runs. An environment with the demo switched off never
    // touches it, and neither does startup.
    const { reseedDemo } = require('../scripts/seed-demo-data');
    const result = await reseedDemo({ ifEmpty });
    if (!result.skipped) {
      logger.info({ businessId: result.businessId }, '[CRON] Demo business reseeded');
    }
  } catch (err) {
    // Never fatal. A stale demo is a marketing problem; a crashed API is not.
    logger.error({ err }, '[CRON] Demo reseed failed');
  }
}

function initDemoResetCron() {
  if (!isDemoEnabled()) {
    logger.info('Demo mode disabled (set DEMO_MODE_ENABLED=true to enable).');
    return { stop() {} };
  }

  if (!cron) {
    logger.warn('[CRON] node-cron not available. Demo reset disabled.');
    return { stop() {} };
  }

  const task = cron.schedule('0 2 * * *', () => { runDemoReset({ ifEmpty: false }); }, {
    timezone: 'Africa/Accra',
  });

  logger.info('✅ Demo reset cron initialized (rebuilds nightly at 02:00 GMT)');

  // Give the rest of the server a moment to come up before doing any work.
  const startupTimer = setTimeout(() => { runDemoReset({ ifEmpty: true }); }, 8000);

  return {
    stop() {
      clearTimeout(startupTimer);
      task.stop();
    },
  };
}

// isDemoEnabled is re-exported for the handful of callers that already import
// it from here; config/demo.js is the definition.
module.exports = { initDemoResetCron, runDemoReset, isDemoEnabled };
