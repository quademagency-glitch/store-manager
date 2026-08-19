/**
 * Cluster entry point — spawns one worker per CPU core.
 *
 * WHY: Node.js is single-threaded. A single process can only use one CPU core.
 * Under load, the event loop saturates and connections start timing out.
 * The `cluster` module forks the app across all available cores, giving
 * near-linear throughput scaling (e.g., 4 cores ≈ 4× throughput).
 *
 * HOW IT WORKS:
 *   - The primary process manages workers and runs the subscription cron.
 *   - Each worker runs a full Express server sharing the same port (kernel
 *     distributes incoming connections round-robin).
 *   - If a worker crashes, the primary auto-restarts it.
 *
 * CRON SAFETY:
 *   The subscription cron only runs in the primary process to prevent
 *   duplicate job execution.
 */

// Must be first — see instrument.js. The primary runs the crons, so their
// failures should be reported too. No-op when SENTRY_DSN is unset.
const sentry = require('./instrument');

require('dotenv').config();

const cluster = require('node:cluster');
const os = require('node:os');
const path = require('node:path');
const logger = require('./utils/logger');
const cacheBus = require('./utils/cacheBus');

// Railway typically gives 1-8 vCPUs depending on plan.
// Default to all available cores, or override via WEB_CONCURRENCY env var.
const WORKER_COUNT = parseInt(process.env.WEB_CONCURRENCY, 10) || os.availableParallelism?.() || os.cpus().length;

// Handles for the crons started below, so shutdown can stop them.
const cronTasks = [];

// Set once the primary has been signalled, so the exit handler stops re-forking
// workers that are leaving on purpose.
let shuttingDown = false;

// Hard deadline for the whole cluster to drain. Sits above the workers' own
// 20s budget (utils/gracefulShutdown.js) but below Railway's ~30s SIGKILL, so
// the primary always gets to log why it gave up.
const CLUSTER_SHUTDOWN_TIMEOUT_MS = 25_000;

// Escalating restart delay for crash-looping workers: 0, 250, 500, 1000, …
// capped at 5s. Resets after a minute without a crash, so an isolated failure
// hours later still restarts instantly.
let consecutiveCrashes = 0;
let lastCrashAt = 0;
function restartBackoffMs() {
  const now = Date.now();
  if (now - lastCrashAt > 60_000) consecutiveCrashes = 0;
  lastCrashAt = now;
  const delay = consecutiveCrashes === 0 ? 0 : Math.min(250 * 2 ** (consecutiveCrashes - 1), 5_000);
  consecutiveCrashes += 1;
  return delay;
}

if (cluster.isPrimary) {
  // Tell cluster to use worker.js as the entry point for forked processes
  cluster.setupPrimary({
    exec: path.join(__dirname, 'worker.js'),
  });

  // Workers cannot message each other directly; every cache invalidation has
  // to be relayed through here. Without this, invalidating on the worker that
  // handled a payment leaves the other N-1 serving the stale entry.
  cacheBus.installPrimaryRelay();

  logger.info({ pid: process.pid, workers: WORKER_COUNT }, '🚀 Primary process started');

  // Fork workers
  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }

  // Auto-restart crashed workers — but ONLY genuine crashes.
  //
  // This used to fork unconditionally, which meant that during a deploy the
  // primary re-spawned every worker it had just asked to exit. The primary
  // ended up fighting the shutdown until the container was SIGKILLed, so a
  // "graceful" deploy never was one. exitedAfterDisconnect covers workers we
  // killed deliberately; the shuttingDown flag covers the window after the
  // primary itself has been signalled.
  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown || worker.exitedAfterDisconnect) {
      logger.info(
        { pid: worker.process.pid, code, signal },
        'Worker exited intentionally — not restarting'
      );
      return;
    }

    // Back off before re-forking. A worker that dies during startup (bad env
    // var, port already bound) otherwise respawns in a tight loop, pinning a
    // core and burying the actual error in log spam.
    const delay = restartBackoffMs();
    logger.warn(
      { pid: worker.process.pid, code, signal, restartInMs: delay },
      '⚠️  Worker died — restarting'
    );
    setTimeout(() => {
      if (!shuttingDown) cluster.fork();
    }, delay).unref();
  });

  // Run the crons ONLY in the primary process (prevents duplicate
  // emails/suspensions/resets from multiple workers).
  //
  // All THREE must be listed here. index.js starts three crons in its
  // standalone branch, but this file previously started only the subscription
  // one — and `npm start` is `node cluster.js`, so in production the webhook
  // retry sweep and the demo reset had never run at all. Failed storefront
  // webhook deliveries sat at `pending` forever and the public demo was never
  // rebuilt. If you add a cron to index.js, add it here too.
  //
  // CAVEAT: "primary" means "primary of this replica". If Railway is ever
  // scaled beyond 1 replica each replica runs its own primary and therefore its
  // own copy of these — duplicate suspension emails, and two concurrent
  // teardown-and-reseed cycles of the demo tenant. The cron_runs advisory row
  // (migration 069) is what makes that safe; until then keep replicas at 1.
  const { initSubscriptionCron } = require('./services/subscriptionCron');
  const { initWebhookRetryCron } = require('./services/webhookRetryCron');
  const { initDemoResetCron } = require('./services/demoResetCron');

  cronTasks.push(
    initSubscriptionCron(),
    initWebhookRetryCron(),
    initDemoResetCron(),
  );

  logger.info('📋 Crons initialized in primary process');

  // Fan the shutdown signal out to the workers.
  //
  // Node's cluster module does NOT forward signals to children, and Railway
  // only signals PID 1. So without this the workers never learn a deploy is
  // happening: they keep serving until the container is SIGKILLed, and every
  // request in flight at that moment dies mid-response.
  function shutdownPrimary(signal) {
    if (shuttingDown) {
      logger.warn({ signal }, 'Second shutdown signal — exiting now');
      process.exit(1);
    }
    shuttingDown = true;
    logger.info({ signal, pid: process.pid }, 'Primary shutting down — signalling workers');

    cronTasks.forEach((task) => task?.stop?.());
    sentry.close(2000).catch(() => {});

    const workers = Object.values(cluster.workers ?? {});
    workers.forEach((worker) => {
      // kill() sets exitedAfterDisconnect, which the exit handler above reads
      // to distinguish a deliberate exit from a crash.
      try { worker.kill('SIGTERM'); } catch { /* already gone */ }
    });

    if (workers.length === 0) process.exit(0);

    const hardTimer = setTimeout(() => {
      logger.error({ timeoutMs: CLUSTER_SHUTDOWN_TIMEOUT_MS }, 'Workers did not exit in time — forcing');
      workers.forEach((worker) => {
        try { worker.process.kill('SIGKILL'); } catch { /* already gone */ }
      });
      process.exit(1);
    }, CLUSTER_SHUTDOWN_TIMEOUT_MS);
    hardTimer.unref();

    // Exit as soon as the last worker is actually gone, rather than always
    // waiting out the full timeout.
    cluster.on('exit', () => {
      if (shuttingDown && Object.keys(cluster.workers ?? {}).length === 0) {
        clearTimeout(hardTimer);
        logger.info('All workers exited — primary exiting');
        process.exit(0);
      }
    });
  }

  process.on('SIGTERM', () => shutdownPrimary('SIGTERM'));
  process.on('SIGINT', () => shutdownPrimary('SIGINT'));
} else {
  // This branch is reached when cluster.js is the exec target itself.
  // We use a separate worker.js file instead, so this shouldn't run.
  require('./worker');
}
