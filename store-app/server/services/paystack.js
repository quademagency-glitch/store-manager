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
 * @param {string} payload - The raw request body as string
 * @param {string} signature - The 'x-paystack-signature' header
 * @param {string} secretKey - The Paystack Secret Key
 * @returns {boolean} - True if signature is valid
 */
function verifyWebhookSignature(payload, signature, secretKey) {
  const hash = crypto.createHmac('sha512', secretKey).update(payload).digest('hex');
  return hash === signature;
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature
};
