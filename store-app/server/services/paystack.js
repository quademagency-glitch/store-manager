const crypto = require('crypto');
const logger = require('../utils/logger');

// Utility to make requests to Paystack API
async function paystackRequest(endpoint, method = 'GET', body = null, secretKey) {
  const url = `https://api.paystack.co${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  };

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Paystack API Error');
  }
  
  return data;
}

/**
 * Initializes a transaction with Paystack.
 * @param {Object} params - { amount, email, plan, metadata, callback_url }
 * @param {string} secretKey - The Paystack Secret Key
 */
async function initializeTransaction(params, secretKey) {
  // amount should be in pesewas/kobo (so multiply by 100)
  const body = {
    email: params.email,
    amount: Math.round(params.amount * 100),
    callback_url: params.callback_url,
    metadata: params.metadata || {}
  };
  
  if (params.plan) {
    body.plan = params.plan; // Paystack Plan Code
  }

  return await paystackRequest('/transaction/initialize', 'POST', body, secretKey);
}

/**
 * Verifies a transaction using the transaction reference.
 * @param {string} reference - The transaction reference
 * @param {string} secretKey - The Paystack Secret Key
 */
async function verifyTransaction(reference, secretKey) {
  return await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, 'GET', null, secretKey);
}

/**
 * Verifies the signature of an incoming webhook from Paystack.
 *
 * `rawBody` MUST be the exact bytes Paystack sent — a Buffer or the raw string.
 * Passing a re-serialized object (JSON.stringify(req.body)) does not work: key
 * order, whitespace and number formatting all differ from what was signed, so
 * verification becomes a coin flip. The caller is responsible for capturing the
 * body with express.raw() BEFORE any JSON parser has drained the stream.
 *
 * @param {Buffer|string} rawBody - The raw request body, exactly as received
 * @param {string} signature - The 'x-paystack-signature' header (sha512 hex)
 * @param {string} secretKey - The Paystack Secret Key (Paystack signs with this,
 *                             not with a separate webhook secret)
 * @returns {boolean} - True if the signature is valid
 */
function verifyWebhookSignature(rawBody, signature, secretKey) {
  if (!secretKey || rawBody == null) return false;

  // Reject anything that isn't a well-formed sha512 hex digest up front. This
  // is not just tidiness: timingSafeEqual throws RangeError on buffers of
  // unequal length, which would turn a malformed header into a 500.
  if (typeof signature !== 'string' || !/^[0-9a-f]{128}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length) return false;

  return crypto.timingSafeEqual(expected, received);
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature
};
