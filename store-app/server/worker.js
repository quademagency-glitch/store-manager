/**
 * Worker entry point — runs a single Express server instance.
 * Spawned by cluster.js (one per CPU core).
 */

require('dotenv').config();

const { getEnv } = require('./config/env');
getEnv();

const app = require('./index');
const logger = require('./utils/logger');
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, '0.0.0.0', 10000, () => {
  logger.info({ pid: process.pid, port: PORT }, '🔧 Worker started');
});

// Configure keep-alive timeouts slightly higher than standard proxy timeouts
// to prevent race conditions that cause 502/socket hangups under heavy load.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
