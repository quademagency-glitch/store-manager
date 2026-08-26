/**
 * Worker entry point, runs a single Express server instance.
 * Spawned by cluster.js (one per CPU core).
 */

// Must be first, see instrument.js. No-op when SENTRY_DSN is unset.
const sentry = require('./instrument');

require('dotenv').config();

const { getEnv } = require('./config/env');
getEnv();

const app = require('./index');
const logger = require('./utils/logger');
const { installGracefulShutdown } = require('./utils/gracefulShutdown');
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, '0.0.0.0', 10000, () => {
  // trustProxy is logged deliberately: when it is wrong, the symptom is users
  // being rate-limited as though they were one person, with nothing anywhere
  // saying why. Having the resolved value in the deploy log turns a baffling
  // outage into a one-line check.
  logger.info({
    pid: process.pid,
    port: PORT,
    trustProxy: app.get('trust proxy'),
    sentry: sentry.enabled ? 'on' : 'off',
  }, '🔧 Worker started');
});

// Configure keep-alive timeouts slightly higher than standard proxy timeouts
// to prevent race conditions that cause 502/socket hangups under heavy load.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Drain in-flight requests on deploy instead of dying mid-response. The primary
// fans SIGTERM out to each worker (node's cluster does not do this for us), and
// the keepAliveTimeout above is exactly why gracefulShutdown has to call
// closeIdleConnections, otherwise close() waits 65s per idle socket.
// Crons live in the primary, so there is nothing worker-side to stop here.
installGracefulShutdown(server, {
  name: 'worker',
  // Flush anything Sentry and PostHog have buffered before the process goes away.
  onShutdown: async () => {
    const posthog = require('./utils/posthog');
    if (posthog) await posthog.shutdown();
    await sentry.close(2000);
  },
});
