/**
 * Security audit trail writer (see migration 070).
 *
 * FOUR PROPERTIES THIS MUST HOLD, all of them load-bearing:
 *
 * 1. It NEVER returns a Promise. A caller cannot accidentally `await` it and
 *    slow a request down, and there is no floating promise for an unhandled
 *    rejection handler to trip over. The .catch is attached explicitly rather
 *    than left to chance.
 * 2. It NEVER throws into the request path. Audit logging is observability; it
 *    must not be able to fail a sale or a login.
 * 3. It snapshots `req` synchronously, then defers the write. Reading req.user
 *    inside the deferred callback would race the response lifecycle.
 * 4. Metadata is redacted before it is written. This is the difference between
 *    an audit log and the most sensitive table in the database — routes/billing
 *    handles Paystack gateway secrets and routes/users handles manager PINs.
 */

const { supabaseAdmin } = require('../db/supabase');
const logger = require('./logger');

/**
 * Canonical action names. Kept here rather than typed inline at call sites so
 * the set stays greppable and the viewer's filter can enumerate it.
 */
const AUDIT_ACTIONS = {
  // Authentication
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  SIGNUP: 'auth.signup',
  DEMO_LOGIN: 'auth.demo_login',

  // Users
  USER_CREATED: 'user.created',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_STATUS_CHANGED: 'user.status_changed',
  USER_DELETED: 'user.deleted',
  USER_PIN_SET: 'user.pin_set',

  // Roles
  ROLE_CREATED: 'role.created',
  ROLE_UPDATED: 'role.updated',
  ROLE_DELETED: 'role.deleted',

  // Business
  BUSINESS_UPDATED: 'business.updated',
  BUSINESS_STATUS_CHANGED: 'business.status_changed',

  // Billing
  GATEWAY_CREATED: 'billing.gateway_created',
  GATEWAY_UPDATED: 'billing.gateway_updated',
  SUBSCRIPTION_CHANGED: 'billing.subscription_changed',
  PAYMENT_RECORDED: 'billing.payment_recorded',

  // Integrations
  API_KEY_CREATED: 'integration.api_key_created',
  API_KEY_REVOKED: 'integration.api_key_revoked',

  // Data movement
  IMPORT_COMMITTED: 'data.import_committed',
  IMPORT_UNDONE: 'data.import_undone',
  DATA_EXPORTED: 'data.exported',
  RECEIPTS_DOWNLOADED: 'data.receipts_downloaded',
};

// Anything whose key matches is replaced wholesale. Substring matching rather
// than exact, so `new_manager_pin` and `paystack_secret_key` are caught too.
const SENSITIVE_KEY_PATTERNS = [
  'password', 'pin', 'token', 'secret', 'key_hash', 'api_key',
  'authorization', 'credential', 'session',
];

// Postgres jsonb has no hard size cap, but an unbounded metadata blob turns
// this table into a dumping ground. 8KB is generous for structured detail.
const MAX_METADATA_BYTES = 8 * 1024;

function isSensitive(key) {
  const lower = String(key).toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((p) => lower.includes(p));
}

function redact(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = isSensitive(key) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

function redactAndTruncate(metadata) {
  try {
    const redacted = redact(metadata ?? {});
    const serialised = JSON.stringify(redacted);
    if (serialised && serialised.length > MAX_METADATA_BYTES) {
      return { _truncated: true, _originalBytes: serialised.length };
    }
    return redacted;
  } catch {
    // Circular reference or similar — never let metadata shape break the write.
    return { _unserialisable: true };
  }
}

/**
 * Record an audit event. Fire-and-forget by design.
 *
 * @param {import('express').Request} req  Request the event happened during.
 * @param {string} action        One of AUDIT_ACTIONS.
 * @param {string} resourceType  'user' | 'role' | 'business' | ...
 * @param {string|number|null} resourceId
 * @param {object} [metadata]    Event detail. Redacted before write.
 * @returns {void}               Deliberately not a Promise.
 */
function logAuditEvent(req, action, resourceType, resourceId, metadata = {}) {
  // Jest would otherwise report "Cannot log after tests are done" when the
  // deferred insert resolves after the suite finishes.
  if (process.env.NODE_ENV === 'test') return;

  let row;
  try {
    // req.auditActor lets unauthenticated routes name the actor themselves.
    // The login route is the case that needs it: authGuard has not run (this
    // IS the login), so req.user does not exist yet, but the event is only
    // meaningful with an identity attached.
    const actor = req?.auditActor ?? req?.user ?? {};

    // Snapshot synchronously — req is not safe to read once deferred.
    row = {
      business_id: actor.business_id ?? null,
      actor_user_id: actor.id ?? null,
      actor_email: actor.email ?? null,
      actor_role: actor.role ?? null,
      action,
      resource_type: resourceType,
      resource_id: resourceId != null ? String(resourceId) : null,
      metadata: redactAndTruncate(metadata),
      ip_address: req?.ip ?? null,
      user_agent: (req?.get?.('user-agent') ?? '').slice(0, 500) || null,
      request_id: req?.id ?? null,
    };
  } catch (err) {
    logger.warn({ err, action }, 'audit log: failed to build row');
    return;
  }

  setImmediate(() => {
    supabaseAdmin
      .from('audit_logs')
      .insert([row])
      .then(({ error }) => {
        if (error) logger.warn({ err: error, action }, 'audit log: insert failed');
      })
      .catch((err) => {
        logger.warn({ err, action }, 'audit log: insert threw');
      });
  });
}

/**
 * Delete audit rows older than `days`, in bounded batches.
 *
 * 400 days covers a full year plus an audit cycle. Batched because an unbounded
 * DELETE on the busiest table in the database is a good way to lock it.
 */
async function pruneAuditLogs(days = 400) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { error } = await supabaseAdmin.from('audit_logs').delete().lt('created_at', cutoff);
    if (error) logger.warn({ err: error }, 'audit log: prune failed');
  } catch (err) {
    logger.warn({ err }, 'audit log: prune threw');
  }
}

/**
 * A stand-in "request" for events that happen outside one — the cron jobs.
 *
 * logAuditEvent is req-shaped because almost every event has a human behind it.
 * Automated suspensions and expiries do not, and attributing them to whichever
 * admin last logged in would be a lie. This produces a row with a null actor
 * and an explicit system marker instead.
 */
function systemAuditContext(businessId, jobName) {
  return {
    auditActor: { id: null, email: null, business_id: businessId ?? null, role: 'system' },
    ip: null,
    id: jobName ? `cron:${jobName}` : 'cron',
    get: () => null,
  };
}

module.exports = {
  logAuditEvent,
  pruneAuditLogs,
  systemAuditContext,
  AUDIT_ACTIONS,
  redactAndTruncate,
};
