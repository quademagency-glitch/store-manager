/**
 * Graceful shutdown for the HTTP server.
 *
 * WHY: Railway sends SIGTERM on every deploy and then SIGKILLs roughly 30
 * seconds later. Without a handler the process is killed outright, so any
 * request in flight, a sale being finalized, a stock movement being written, * dies mid-response. The client sees a network error on an operation that may
 * or may not have committed.
 *
 * The sequence is:
 *   1. Mark the process as draining, so /api/health starts returning 503 and
 *      the proxy stops routing new requests here.
 *   2. server.close(), stop accepting new connections, keep serving open ones.
 *   3. server.closeIdleConnections(), see the note below; without this the
 *      whole thing is theatre.
 *   4. Wait for in-flight requests, up to `timeoutMs`.
 *   5. Run onShutdown (stop crons, flush Sentry), then exit 0.
 *
 * THE CRITICAL LINE is closeIdleConnections(). worker.js sets
 * keepAliveTimeout = 65000, so browsers hold idle keep-alive sockets open for
 * 65 seconds. server.close() waits for every socket to become inactive, which
 * means it would sit there for over a minute, far past Railway's SIGKILL, and
 * the drain would never complete. closeIdleConnections() reaps the sockets that
 * are open but not mid-request, which is nearly all of them, leaving close() to
 * wait only on real work. If you ever find yourself "simplifying" this file,
 * that is the line that must survive.
 */

const logger = require('./logger');

// Railway's grace period before SIGKILL is ~30s. Deliberately under it: a timer
// set to the same value as the platform's own deadline never gets to fire, so
// you lose the log line explaining why the shutdown gave up.
const DEFAULT_TIMEOUT_MS = 20_000;

let shuttingDown = false;

/** True once a shutdown signal has been received. Health checks read this. */
function isShuttingDown() {
  return shuttingDown;
}

/**
 * @param {import('http').Server} server
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]   Hard deadline for draining in-flight work.
 * @param {() => Promise<void>} [opts.onShutdown]  Cleanup once connections are closed.
 * @param {string} [opts.name]        Label for log lines.
 */
function installGracefulShutdown(server, opts = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onShutdown = async () => {},
    name = 'server',
  } = opts;

  async function shutdown(signal) {
    // A second signal means someone is impatient (or the platform escalated).
    // Don't restart the sequence, bail out immediately.
    if (shuttingDown) {
      logger.warn({ signal, name }, 'Second shutdown signal, exiting now');
      process.exit(1);
    }
    shuttingDown = true;
    logger.info({ signal, name, pid: process.pid }, 'Shutdown signal received, draining');

    const forceTimer = setTimeout(() => {
      logger.error({ name, timeoutMs }, 'Drain deadline exceeded, forcing connections closed');
      // Node 18.2+/20: kill whatever is still mid-request rather than hanging.
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      process.exit(1);
    }, timeoutMs);
    // Unref'd so this timer alone can never be the reason the process stays up.
    forceTimer.unref();

    server.close(async (err) => {
      clearTimeout(forceTimer);
      if (err) logger.error({ err, name }, 'Error closing server');

      try {
        await onShutdown();
      } catch (cleanupErr) {
        logger.error({ err: cleanupErr, name }, 'Error during shutdown cleanup');
      }

      logger.info({ name, pid: process.pid }, 'Drained cleanly, exiting');
      process.exit(err ? 1 : 0);
    });

    // Must come AFTER server.close(), see the header note. Reaps keep-alive
    // sockets that aren't mid-request so close() doesn't wait out
    // keepAliveTimeout (65s) on every idle browser tab.
    if (typeof server.closeIdleConnections === 'function') {
      server.closeIdleConnections();
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err, name }, 'Uncaught exception, shutting down');
    shutdown('uncaughtException');
  });

  // Logged, NOT fatal. This codebase has deliberate fire-and-forget promises, 
  // touchLastUsed() in apiKeyGuard, the demo reseed timer, the audit logger, 
  // and making an unhandled rejection exit the process would turn any of them
  // into a production crash-loop.
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason, name }, 'Unhandled promise rejection');
  });

  return { isShuttingDown, shutdown };
}

module.exports = { installGracefulShutdown, isShuttingDown, DEFAULT_TIMEOUT_MS };
