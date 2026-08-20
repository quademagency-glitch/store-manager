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
const { verifyWebhookSignature } = require('../services/paystack');
const { invalidateBusinessCache } = require('../middleware/authGuard');
const logger = require('../utils/logger');

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

    const { data: gateway, error: gatewayError } = await supabaseAdmin
      .from('payment_gateways')
      .select('id, secret_key, webhook_secret')
      .eq('provider', 'paystack')
      .eq('is_active', true)
      .single();

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
 * Applies a successful charge: activate the subscription, clear the trial,
 * record the invoice, and reactivate the business.
 *
 * Merges what the two previous handlers each did, between them they set
 * different subsets of the same columns, so dropping either would have
 * regressed whichever fields only the other one wrote.
 */
async function handleChargeSuccess(event, gateway, reqId) {
  const data = event.data || {};
  const metadata = data.metadata || {};
  const businessId = metadata.business_id;
  const planId = metadata.plan_id;

  if (!businessId || !planId) {
    logger.warn({ reqId, reference: data.reference }, '[WEBHOOK] charge.success without business_id/plan_id, ignoring');
    return;
  }

  const cycle = metadata.billing_cycle || 'monthly';
  const now = new Date();
  const periodEnd = new Date(now);
  // Calendar-correct, unlike the old billing.js which added a flat 365 days.
  if (cycle === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setDate(periodEnd.getDate() + 30);
  }

  const { data: existingSub } = await supabaseAdmin
    .from('business_subscriptions')
    .select('id')
    .eq('business_id', businessId)
    .single();

  const subData = {
    plan_id: planId,
    gateway_id: gateway.id,
    status: 'active',
    billing_cycle: cycle,
    current_period_start: now.toISOString(),
    current_period_end: periodEnd.toISOString(),
    // Clearing this is what actually ends the trial. Only the subscriptions.js
    // handler set it; a payment through the billing.js URL left the trial date
    // in place.
    trial_ends_at: null,
    amount: typeof data.amount === 'number' ? data.amount / 100 : null,
    currency: data.currency || 'GHS',
    paystack_subscription_code: data.reference,
    updated_at: now.toISOString(),
  };

  if (data.customer?.customer_code) {
    subData.paystack_customer_code = data.customer.customer_code;
  }

  let subscriptionId = existingSub?.id ?? null;
  if (existingSub) {
    const { error } = await supabaseAdmin
      .from('business_subscriptions')
      .update(subData)
      .eq('id', existingSub.id);
    if (error) throw error;
  } else {
    const { data: newSub, error } = await supabaseAdmin
      .from('business_subscriptions')
      .insert([{ business_id: businessId, ...subData }])
      .select('id')
      .single();
    if (error) throw error;
    subscriptionId = newSub?.id ?? null;
  }

  const { error: invoiceError } = await supabaseAdmin
    .from('billing_invoices')
    .insert([{
      business_id: businessId,
      subscription_id: subscriptionId,
      amount: typeof data.amount === 'number' ? data.amount / 100 : null,
      currency: data.currency || 'GHS',
      status: 'paid',
      payment_method: data.channel || 'paystack',
      paystack_reference: data.reference,
      description: `${metadata.plan_name || 'Subscription'}, ${cycle} payment`,
      paid_at: now.toISOString(),
    }]);

  // Already recorded, by a webhook retry, or by the client-side
  // /verify-paystack call that races this one. Not an error; the payment is
  // applied either way and re-raising would make Paystack retry forever.
  if (invoiceError && invoiceError.code !== PG_UNIQUE_VIOLATION) throw invoiceError;
  if (invoiceError) {
    logger.info({ reqId, reference: data.reference }, '[WEBHOOK] Invoice already recorded, treating as success');
  }

  const { error: bizError } = await supabaseAdmin
    .from('businesses')
    .update({ status: 'active', subscription_plan_id: planId })
    .eq('id', businessId);
  if (bizError) throw bizError;

  // The whole point of the payment, from the customer's side: they can use the
  // app again. authGuard gates every route on a cached copy of
  // businesses.status, so without this they keep hitting "your trial has ended"
  // on whichever workers still hold the stale entry, having just paid.
  invalidateBusinessCache(businessId);

  logger.info({ reqId, businessId, reference: data.reference }, '[WEBHOOK] Payment applied');
}

module.exports = { paystackWebhookHandler, PG_UNIQUE_VIOLATION };
