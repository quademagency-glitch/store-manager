/**
 * Deep health check, dependency status for external monitoring.
 *
 * Distinct from GET /api/health, which is a dependency-free liveness probe and
 * is what railway.toml's healthcheckPath points at. Keep it that way: if the
 * platform healthcheck depended on Supabase, a transient Supabase blip would
 * block deploys and turn a minor incident into an outage.
 *
 * ANTI-AMPLIFICATION: the result is cached for 10 seconds at module scope. That
 * matters more than the rate limiter, without it, an attacker converts N cheap
 * HTTP requests into N Supabase round-trips. With it, concurrent callers all
 * receive the same cached object and only one query happens per window,
 * regardless of request volume.
 */

const crypto = require('crypto');
const os = require('node:os');
const { supabaseAdmin } = require('../db/supabase');
const logger = require('../utils/logger');

const CACHE_TTL_MS = 10_000;
const SUPABASE_TIMEOUT_MS = 2_000;

let cached = null;

/**
 * db/supabase.js uses node-fetch with no default timeout, so a hung Supabase
 * would hang this handler indefinitely, your monitoring becoming the outage.
 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      t.unref();
    }),
  ]);
}

async function checkSupabase() {
  const startedAt = Date.now();
  try {
    // Cheapest real round-trip: a HEAD count against a tiny table. Proves the
    // connection, auth and RLS path all work without pulling any rows.
    const { error } = await withTimeout(
      supabaseAdmin.from('platform_plans').select('id', { head: true, count: 'exact' }).limit(1),
      SUPABASE_TIMEOUT_MS,
      'supabase',
    );
    if (error) throw error;
    return { status: 'ok', ms: Date.now() - startedAt };
  } catch (err) {
    return { status: 'fail', ms: Date.now() - startedAt, error: err.message };
  }
}

/**
 * Configuration presence only, deliberately does NOT call Resend's API.
 * A monitor polling every 60s would otherwise burn quota and hit their rate
 * limit around the clock to learn something a string check already tells us.
 */
function checkResend() {
  const configured = Boolean(process.env.RESEND_API_KEY);
  return {
    status: configured ? 'ok' : 'degraded',
    ms: 0,
    ...(configured ? {} : { error: 'RESEND_API_KEY not set, outbound email disabled' }),
  };
}

/**
 * Worth checking because the failure is silent and expensive: if the JWKS key
 * never loaded, authGuard falls back to a Supabase round-trip per request and
 * latency quietly multiplies with nothing in the logs to say why.
 */
function checkJwks() {
  try {
    const { getCachedKeyStatus } = require('../utils/jwtVerifier');
    if (typeof getCachedKeyStatus !== 'function') {
      return { status: 'unknown', ms: 0 };
    }
    const loaded = getCachedKeyStatus();
    return {
      status: loaded ? 'ok' : 'degraded',
      ms: 0,
      ...(loaded ? {} : { error: 'JWKS key not loaded, falling back to per-request Supabase verification' }),
    };
  } catch {
    return { status: 'unknown', ms: 0 };
  }
}

async function buildReport() {
  const startedAt = Date.now();
  const [supabase, resend, jwks] = [await checkSupabase(), checkResend(), checkJwks()];

  // 503 ONLY for Supabase. Nothing works without it, so it is genuinely
  // unhealthy. A missing Resend key is degraded-but-serving: pulling the
  // instance out of rotation over an email misconfiguration would be worse
  // than the misconfiguration.
  const healthy = supabase.status === 'ok';

  return {
    status: healthy ? 'ok' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    pid: process.pid,
    hostname: os.hostname(),
    totalMs: Date.now() - startedAt,
    checks: { supabase, resend, jwks },
  };
}

function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function healthDeepHandler(req, res) {
  const expectedToken = process.env.HEALTH_CHECK_TOKEN;
  const authorised = !expectedToken || tokenMatches(req.get('x-health-token'), expectedToken);

  let report;
  if (cached && cached.expiresAt > Date.now()) {
    report = cached.report;
  } else {
    report = await buildReport();
    cached = { report, expiresAt: Date.now() + CACHE_TTL_MS };
    if (report.status !== 'ok') {
      logger.warn({ checks: report.checks }, 'Deep health check reported unhealthy');
    }
  }

  const httpStatus = report.status === 'ok' ? 200 : 503;

  // Unauthenticated callers get liveness only. Timings, dependency names and
  // driver error strings all leak infrastructure detail (hostnames, connection
  // info) and there is no reason to hand that to an anonymous caller.
  if (!authorised) {
    return res.status(httpStatus).json({ status: report.status, timestamp: report.timestamp });
  }

  return res.status(httpStatus).json({
    ...report,
    // Diagnostic for choosing TRUST_PROXY_HOPS (see index.js). Hit this through
    // app.quaderp.app and again directly against the Railway host, then compare:
    // `ip` should be the real client on the path you care about. Authorised
    // callers only, this echoes request headers.
    proxy: {
      ip: req.ip,
      ips: req.ips,
      xff: req.get('x-forwarded-for') ?? null,
      xfProto: req.get('x-forwarded-proto') ?? null,
      remoteAddress: req.socket?.remoteAddress ?? null,
      trustProxySetting: req.app.get('trust proxy'),
    },
  });
}

/** Test hook, the module-level cache would otherwise leak between cases. */
function _resetCache() {
  cached = null;
}

module.exports = { healthDeepHandler, _resetCache, CACHE_TTL_MS };
