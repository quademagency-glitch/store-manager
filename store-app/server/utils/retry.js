/**
 * Retries an async function with exponential backoff.
 * @param {Function} fn - Async function to retry
 * @param {Object} opts
 * @param {number} opts.attempts - Max attempts (default 3)
 * @param {number} opts.baseDelayMs - Initial delay in ms (default 300)
 * @param {string} opts.label - Label for logging
 */
async function withRetry(fn, { attempts = 3, baseDelayMs = 300, label = 'operation' } = {}) {
  const logger = require('./logger');
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const delay = baseDelayMs * 2 ** i;
        logger.warn({ err, attempt: i + 1, delayMs: delay }, `${label} failed, retrying`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

module.exports = { withRetry };
