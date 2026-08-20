/**
 * Cross-worker cache invalidation over the cluster IPC channel.
 *
 * WHY: authGuard caches each user's role, permissions and business status in
 * process memory. The API runs one worker per core, so clearing an entry in the
 * worker that handled the write leaves the other seven serving the old value
 * until it expires.
 *
 * The user-visible symptom is not abstract. A business pays, the webhook flips
 * businesses.status to 'active', and the customer keeps seeing "Your free trial
 * has ended", on some requests but not others, depending which worker answered
 *, until the cache expires. They have paid and the app still says no.
 *
 * DELIBERATELY KNOWS NOTHING ABOUT CACHES. authGuard subscribes to it rather
 * than the other way round, so there is no require cycle, and apiKeyGuard can
 * subscribe later for revoked API keys without touching this file.
 *
 * Honest about what it is: best-effort, fire-and-forget, no durability and no
 * replay. A worker forked after an invalidation never sees it, which is
 * harmless, because it starts with an empty cache. This is a stopgap that
 * removes the common case; Redis is the answer if strict consistency is ever
 * required.
 */

const cluster = require('node:cluster');

// Namespaced so this can never be confused with another IPC message.
const ENVELOPE = '__erp_cache';

const subscribers = [];

/** Primary → every worker. */
function broadcast(msg) {
  for (const worker of Object.values(cluster.workers ?? {})) {
    try {
      worker.send({ [ENVELOPE]: msg });
    } catch {
      // Worker is exiting; its cache dies with it.
    }
  }
}

/**
 * Publish an invalidation to every other process.
 *
 * The isPrimary branch is the piece most likely to be dropped by someone
 * simplifying this: the cron jobs run in the PRIMARY, which has no userCache of
 * its own and cannot process.send() to itself. Without it, the nightly
 * suspension and trial-expiry sweeps would invalidate nothing at all, the
 * case with the longest-lived staleness.
 */
function publish(msg) {
  if (cluster.isPrimary) return broadcast(msg);

  // Gate on cluster.isWorker, NOT on process.send existing. Jest runs its
  // tests in IPC-connected child processes, so process.send is defined there
  // too, publishing on that basis would inject unexpected messages into
  // Jest's own worker protocol. Only a real cluster worker has anywhere
  // meaningful to send this.
  if (!cluster.isWorker || typeof process.send !== 'function') return;

  try {
    process.send({ [ENVELOPE]: msg });
  } catch {
    // Channel closing during shutdown.
  }
}

/** Register a handler for invalidations arriving from another process. */
function subscribe(fn) {
  subscribers.push(fn);
  if (!cluster.isWorker) return; // standalone/tests: nothing will ever arrive
  if (subscribers.length > 1) return; // one process listener, many subscribers

  process.on('message', (m) => {
    if (!m || !m[ENVELOPE]) return;
    for (const handler of subscribers) {
      try {
        handler(m[ENVELOPE]);
      } catch {
        // A broken subscriber must not take down the IPC listener.
      }
    }
  });
}

/**
 * Relay worker → primary → all workers. Called once from cluster.js.
 *
 * Workers cannot talk to each other directly; every message has to go via the
 * primary, which is why this exists at all.
 */
function installPrimaryRelay() {
  if (!cluster.isPrimary) return;
  cluster.on('message', (_worker, m) => {
    if (m && m[ENVELOPE]) broadcast(m[ENVELOPE]);
  });
}

module.exports = { publish, subscribe, installPrimaryRelay, ENVELOPE };
