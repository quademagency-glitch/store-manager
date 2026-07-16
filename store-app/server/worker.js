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

app.listen(PORT, () => {
  logger.info({ pid: process.pid, port: PORT }, '🔧 Worker started');
});
