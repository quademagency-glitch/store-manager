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

require('dotenv').config();

const cluster = require('node:cluster');
const os = require('node:os');
const path = require('node:path');
const logger = require('./utils/logger');

// Railway typically gives 1-8 vCPUs depending on plan.
// Default to all available cores, or override via WEB_CONCURRENCY env var.
const WORKER_COUNT = parseInt(process.env.WEB_CONCURRENCY, 10) || os.availableParallelism?.() || os.cpus().length;

if (cluster.isPrimary) {
  // Tell cluster to use worker.js as the entry point for forked processes
  cluster.setupPrimary({
    exec: path.join(__dirname, 'worker.js'),
  });

  logger.info({ pid: process.pid, workers: WORKER_COUNT }, '🚀 Primary process started');

  // Fork workers
  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }

  // Auto-restart crashed workers
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(
      { pid: worker.process.pid, code, signal },
      '⚠️  Worker died — restarting'
    );
    cluster.fork();
  });

  // Run the subscription cron ONLY in the primary process
  // (prevents duplicate emails/suspensions from multiple workers)
  const { initSubscriptionCron } = require('./services/subscriptionCron');
  initSubscriptionCron();

  logger.info('📋 Subscription cron initialized in primary process');
} else {
  // This branch is reached when cluster.js is the exec target itself.
  // We use a separate worker.js file instead, so this shouldn't run.
  require('./worker');
}
