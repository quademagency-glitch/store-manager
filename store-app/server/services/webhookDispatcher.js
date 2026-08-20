const crypto = require('crypto');
const fetch = require('node-fetch');
const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

// Capped exponential backoff: 1m, 5m, 30m. Once attempt_count exceeds this,
// retries are exhausted and the delivery is marked permanently failed.
const RETRY_BACKOFF_MIN = [1, 5, 30];
const DELIVERY_TIMEOUT_MS = 8000;

function nextRetryTime(attemptCount) {
  const backoffMin = RETRY_BACKOFF_MIN[attemptCount - 1];
  if (backoffMin === undefined) return null;
  return new Date(Date.now() + backoffMin * 60 * 1000).toISOString();
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Creating the webhook_deliveries row has been observed to intermittently
// fail with a spurious RLS error from Supabase's REST layer (service_role
// has BYPASSRLS at the Postgres role level, and the exact same insert always
// succeeds when retried moments later, this looks like a transient
// PostgREST-side inconsistency, not a real authorization failure). Without
// a retry here, that flakiness would silently drop the event entirely since
// there'd be no delivery row for the cron sweep to pick up. 3 attempts with
// a short backoff turns an intermittent platform issue into a non-issue.
async function insertDeliveryWithRetry(insertPayload, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabaseAdmin
      .from('webhook_deliveries')
      .insert(insertPayload)
      .select()
      .single();

    if (!error && data) return { data, error: null };
    lastError = error;
    if (i < attempts - 1) await sleep(300 * (i + 1));
  }
  return { data: null, error: lastError };
}

/**
 * Fan out an event to every active webhook endpoint on a business that's
 * subscribed to it. Fire-and-forget from the caller's perspective, never
 * await this in a request handler's critical path.
 */
async function dispatchWebhook(businessId, event, payload) {
  try {
    const { data: endpoints, error } = await supabaseAdmin
      .from('webhook_endpoints')
      .select('id, url, secret, events')
      .eq('business_id', businessId)
      .eq('status', 'active');

    if (error) throw error;

    for (const endpoint of (endpoints || [])) {
      if (!endpoint.events.includes(event)) continue;

      const insertPayload = { business_id: businessId, webhook_endpoint_id: endpoint.id, event, payload, status: 'pending' };
      const { data: delivery, error: insertErr } = await insertDeliveryWithRetry(insertPayload);

      if (insertErr || !delivery) {
        logger.error({ err: insertErr }, 'Failed to record webhook delivery');
        continue;
      }

      attemptDelivery(delivery, endpoint);
    }
  } catch (err) {
    logger.error({ err }, 'Error dispatching webhook');
  }
}

/**
 * Attempt to deliver a single webhook_deliveries row, updating its status
 * based on the outcome. Used both for the initial attempt (dispatchWebhook)
 * and for cron-driven retries (webhookRetryCron).
 */
async function attemptDelivery(delivery, endpoint) {
  const body = JSON.stringify({ event: delivery.event, data: delivery.payload, delivery_id: delivery.id });
  const signature = crypto.createHmac('sha256', endpoint.secret).update(body).digest('hex');
  const attemptCount = delivery.attempt_count + 1;

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Event': delivery.event,
      },
      body,
      timeout: DELIVERY_TIMEOUT_MS,
    });

    const responseBody = await res.text().catch(() => '');
    const delivered = res.status >= 200 && res.status < 300;
    const retryAt = delivered ? null : nextRetryTime(attemptCount);

    await supabaseAdmin
      .from('webhook_deliveries')
      .update({
        status: delivered ? 'delivered' : (retryAt ? 'pending' : 'failed'),
        attempt_count: attemptCount,
        last_attempt_at: new Date().toISOString(),
        next_retry_at: retryAt,
        response_status: res.status,
        response_body: responseBody.slice(0, 2000),
      })
      .eq('id', delivery.id);
  } catch (err) {
    const retryAt = nextRetryTime(attemptCount);
    await supabaseAdmin
      .from('webhook_deliveries')
      .update({
        status: retryAt ? 'pending' : 'failed',
        attempt_count: attemptCount,
        last_attempt_at: new Date().toISOString(),
        next_retry_at: retryAt,
        response_body: String(err.message).slice(0, 2000),
      })
      .eq('id', delivery.id);
  }
}

module.exports = { dispatchWebhook, attemptDelivery };
