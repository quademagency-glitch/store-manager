/**
 * Sentry initialisation. Must be required FIRST, before express and before
 * @supabase/supabase-js, so the SDK can instrument them as they load.
 *
 * INERT BY DEFAULT: with no SENTRY_DSN set this module requires nothing and
 * does nothing, so the app runs identically whether or not Sentry is
 * configured. Setting one env var in Railway turns it on.
 *
 * WHY THE GATE IS AROUND require(), NOT JUST init():
 * Calling Sentry.init({ dsn: undefined }) still loads the SDK, which installs
 * OpenTelemetry instrumentation that monkey-patches http/https. That is exactly
 * what would perturb the Jest suites, supertest, and the node-fetch that
 * db/supabase.js uses deliberately instead of undici. Not requiring the module
 * at all is the only way to guarantee zero effect. __tests__/setup.js also
 * deletes SENTRY_DSN so a developer's local .env can't leak into a test run.
 */

require('dotenv').config();

const dsn = process.env.SENTRY_DSN;
const enabled = Boolean(dsn) && process.env.NODE_ENV !== 'test';

// Header and body keys that must never leave the building. The API handles
// Paystack gateway secrets (routes/billing.js) and manager PINs
// (routes/users.js), and Sentry captures request context by default.
const SENSITIVE_KEYS = [
  'authorization', 'cookie', 'x-api-key', 'x-paystack-signature',
  'password', 'pin', 'manager_pin', 'token', 'access_token', 'refresh_token',
  'secret_key', 'public_key', 'webhook_secret', 'key_hash', 'api_key',
];

function scrub(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = SENSITIVE_KEYS.includes(key.toLowerCase())
      ? '[redacted]'
      : (value && typeof value === 'object' ? scrub(value) : value);
  }
  return out;
}

let Sentry = null;

if (enabled) {
  Sentry = require('@sentry/node');

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    // Tracing off unless explicitly turned on, it is the expensive part and
    // this is being adopted for error visibility, not performance work.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // Never auto-attach IPs, cookies or user identity. authGuard sets the
    // user id explicitly, and nothing else about the person is needed.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        if (event.request.headers) event.request.headers = scrub(event.request.headers);
        if (event.request.cookies) event.request.cookies = '[redacted]';
        // Request bodies routinely contain credentials on the auth routes;
        // there is no version of this worth the risk.
        delete event.request.data;
      }
      return event;
    },
  });
}

/**
 * Safe no-op wrapper so call sites never need their own `if (enabled)`.
 */
function captureException(err, context) {
  if (!Sentry) return;
  try {
    if (context) Sentry.withScope((scope) => { scope.setExtras(scrub(context)); Sentry.captureException(err); });
    else Sentry.captureException(err);
  } catch { /* never let telemetry break the caller */ }
}

/** Tag the current request scope. No-op when Sentry is off. */
function setRequestContext({ userId, businessId, role, requestId } = {}) {
  if (!Sentry) return;
  try {
    const scope = Sentry.getCurrentScope();
    if (userId) scope.setUser({ id: userId });
    if (businessId) scope.setTag('business_id', businessId);
    if (role) scope.setTag('role', role);
    if (requestId) scope.setTag('request_id', requestId);
  } catch { /* ignore */ }
}

/** Attach Sentry's express error handler. No-op when Sentry is off. */
function setupExpressErrorHandler(app) {
  if (!Sentry) return;
  Sentry.setupExpressErrorHandler(app);
}

/** Flush buffered events during graceful shutdown. */
async function close(timeoutMs = 2000) {
  if (!Sentry) return;
  try { await Sentry.close(timeoutMs); } catch { /* ignore */ }
}

module.exports = { enabled, captureException, setRequestContext, setupExpressErrorHandler, close };
