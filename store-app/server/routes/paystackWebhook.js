/**
 * Paystack webhook, the single handler for incoming payment events.
 *
 * WHY THIS FILE EXISTS
 * There used to be two webhook endpoints, in routes/billing.js and
 * routes/subscriptions.js, and both were broken in the same way: they computed
 * the HMAC over `JSON.stringify(req.body)` rather than the bytes Paystack
 * actually signed. subscriptions.js appeared to guard against this with
 * express.raw(), but that parser was a no-op, the global express.json() in
 * index.js had already drained the stream, and body-parser skips when
 * onFinished.isFinished(req) is true. So any signature that verified did so by
 * luck. On top of that, billing.js only enforced the signature when
 * NODE_ENV === 'production', meaning any unsigned POST to a non-production
 * deployment could mint a paid subscription for an arbitrary business_id.
 *
 * The fix has to live outside a router, mounted in index.js ABOVE the global
 * JSON parser, because that is the only place the raw bytes still exist.
 *
 * BOTH legacy URLs are registered against this one handler. Which of the two is
 * configured in the Paystack dashboard isn't knowable from the code, and
 * guessing wrong drops payments silently, so both keep working.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../db/supabase');
const { verifyWebhookSignature, resolvePaystackGateway } = require('../services/paystack');
const logger = require('../utils/logger');
const { applySubscriptionPayment, fromPaystack } = require('../services/subscriptionPayments');

// Postgres unique-violation. Both this handler and POST /verify-paystack insert
// an invoice for the same payment, and Paystack retries on any non-2xx, so
// hitting this is expected rather than exceptional, see migration 069, which
// adds the unique index that makes it happen.
const PG_UNIQUE_VIOLATION = '23505';

async function paystackWebhookHandler(req, res) {
  const reqId = req.id;

  try {
    const signature = req.headers['x-paystack-signature'];

    // req.body is a Buffer here (express.raw). Guard anyway: if this handler is
    // ever remounted below a JSON parser it must fail closed, not silently
    // start verifying a re-serialized object again.
    if (!Buffer.isBuffer(req.body)) {
      logger.error({ reqId }, '[WEBHOOK] Raw body unavailable, handler is mounted below a body parser');
      return res.status(500).send('Webhook misconfigured');
    }
    const rawBody = req.body;

    /* Through the resolver, so a local run with PAYSTACK_MODE=test verifies
       signatures against the test secret. In production the resolver cannot
       return the test gateway, whatever the environment says. */
    const { gateway, error: gatewayError } = await resolvePaystackGateway(supabaseAdmin);

    // 500, not 200. The old subscriptions.js handler returned 200 here, which
    // told Paystack the event was handled and stopped it retrying, a real
    // payment acknowledged and thrown away. A 5xx makes Paystack retry, so a
    // misconfigured gateway becomes a recoverable delay instead of lost money.
    if (gatewayError || !gateway) {
      logger.error({ reqId, err: gatewayError }, '[WEBHOOK] No active Paystack gateway configured');
      return res.status(500).send('Paystack gateway not configured');
    }

    // Paystack signs with the SECRET KEY. webhook_secret is only a fallback for
    // any deployment that stored it there; preferring it (as the old
    // subscriptions.js handler did) means 401-ing every genuine webhook.
    const signingKey = gateway.secret_key || gateway.webhook_secret;

    // Enforced in EVERY environment. The old production-only check meant a
    // staging deployment pointed at a shared database was a live mint.
    if (!verifyWebhookSignature(rawBody, signature, signingKey)) {
      logger.warn({ reqId }, '[WEBHOOK] Invalid Paystack signature, rejected');
      return res.status(401).send('Invalid signature');
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      // Signature verified but the payload isn't JSON. Retrying won't help.
      logger.error({ reqId }, '[WEBHOOK] Signed payload was not valid JSON');
      return res.status(400).send('Malformed payload');
    }

    logger.info({ reqId, event: event.event }, '[WEBHOOK] Paystack event received');

    if (event.event !== 'charge.success') {
      // Acknowledge events we don't act on so Paystack stops retrying them.
      return res.sendStatus(200);
    }

    await handleChargeSuccess(event, gateway, reqId);
    return res.sendStatus(200);
  } catch (err) {
    // 500 so Paystack retries. The old handler returned 200 from its catch
    // ("always return 200 to Paystack"), so any transient DB error silently
    // discarded the payment with no second attempt.
    logger.error({ err, reqId }, '[WEBHOOK] Error processing Paystack webhook');
    return res.status(500).send('Webhook handler failed');
  }
}

/**
 * Applies a successful charge through services/subscriptionPayments, the same
 * path the Billing page's verify call takes. Whichever of the two arrives
 * second finds the payment already applied (it is keyed on the reference).
 */
async function handleChargeSuccess(event, gateway, reqId) {
  const claim = fromPaystack(event.data || {});
  if (!claim.businessId || !claim.planId) {
    logger.warn({ reqId, reference: claim.reference }, '[WEBHOOK] charge.success without business_id/plan_id, ignoring');
    return;
  }
  const outcome = await applySubscriptionPayment(claim);
  if (outcome.error) {
    // Logged for a refund or manual review; not thrown, or Paystack retries forever.
    logger.warn({ reqId, reference: claim.reference, businessId: claim.businessId, reason: outcome.error }, '[WEBHOOK] Charge does not match what it claims to buy, nothing granted');
    return;
  }
  logger.info({ reqId, businessId: claim.businessId, reference: claim.reference, already: outcome.already }, outcome.already ? '[WEBHOOK] Charge already applied' : '[WEBHOOK] Payment applied');
}

module.exports = { paystackWebhookHandler, PG_UNIQUE_VIOLATION };
