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
 * `rawBody` MUST be the exact bytes Paystack sent, a Buffer or the raw string.
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

/**
 * The Paystack gateway this request should use.
 *
 * Production ALWAYS uses the live row in payment_gateways. Test mode needs TWO
 * independent conditions to be true — PAYSTACK_MODE=test AND
 * NODE_ENV !== 'production' — so a stray environment variable on Railway
 * cannot point real customers' payments at test keys. That failure would be
 * silent and expensive: Paystack would accept the transaction, the app would
 * record a paid invoice, and no money would ever arrive. One switch was enough
 * to build this; it is not enough to make it safe.
 *
 * Test keys come from the environment and never from payment_gateways. That
 * table lives in the production database, so a test secret in it would be one
 * more thing to keep straight and one more thing to leak.
 *
 * `id` is null in test mode. business_subscriptions.gateway_id is nullable
 * (verified against the live schema, and it is the only foreign key pointing
 * at payment_gateways), so a test payment records with no gateway row instead
 * of violating the constraint.
 *
 * Returns { gateway, error }. A null gateway always means "do not take a
 * payment": callers fail closed, and the webhook deliberately answers 5xx so
 * Paystack retries rather than dropping a real event.
 */
function isPaystackTestMode() {
  return process.env.PAYSTACK_MODE === 'test' && process.env.NODE_ENV !== 'production';
}

async function resolvePaystackGateway(supabaseAdmin) {
  if (isPaystackTestMode()) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return { gateway: null, error: new Error('PAYSTACK_MODE=test but PAYSTACK_SECRET_KEY is not set') };
    }
    return {
      gateway: {
        id: null,
        provider: 'paystack',
        display_name: 'Paystack (test mode)',
        secret_key: secretKey,
        public_key: process.env.PAYSTACK_PUBLIC_KEY || null,
        webhook_secret: null,
        is_active: true,
        mode: 'test',
      },
      error: null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('payment_gateways')
    .select('*')
    .eq('provider', 'paystack')
    .eq('is_active', true)
    .single();

  if (error || !data) return { gateway: null, error: error || null };
  return { gateway: { ...data, mode: 'live' }, error: null };
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  resolvePaystackGateway,
  isPaystackTestMode,
};
