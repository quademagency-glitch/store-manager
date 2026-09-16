const { z } = require('zod');

const envSchema = z.object({
  // Supabase, required
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  // Server
  PORT: z.coerce.number().int().min(0).default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  // Auth cache, how long to cache user roles/permissions after DB lookup.
  // Default bumped to 5 min (300s) since local JWT verification makes the
  // cache the primary guard against repeated DB hits. invalidateUserCache()
  // still evicts immediately on role/ban changes.
  AUTH_CACHE_TTL_MS: z.coerce.number().int().min(0).default(60000),

  // Email
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().default('info@quaderp.app'),
  PLATFORM_ADMIN_EMAIL: z.string().email().optional().or(z.literal('')),

  // App
  APP_URL: z.string().url().default('https://app.quaderp.app'),
  FRONTEND_URL: z.string().url().optional(),

  // Paystack
  PAYSTACK_SECRET_KEY: z.string().optional(),

  // Error monitoring, entirely optional. With no DSN, instrument.js never even
  // requires the Sentry SDK, so the app behaves identically.
  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),

  // Reverse-proxy hop count for req.ip resolution. See the long note in
  // index.js, this must be a number, never `true`.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(2),

  // Ceiling for the general /api/* limiter, per signed-in session (or per IP
  // when unauthenticated). Tunable without a deploy. Note it is per worker
  // process, so the real ceiling is workers x this value.
  API_RATE_LIMIT: z.coerce.number().int().min(1).default(300),

  // Escape hatch for the HTTPS redirect (index.js). Set to 'false' to disable
  // without a code change.
  FORCE_HTTPS: z.string().optional(),

  // Optional shared secret for /api/health/deep. When set, callers without the
  // matching X-Health-Token header get a bare status with no timings or
  // dependency names.
  HEALTH_CHECK_TOKEN: z.string().optional(),
});

let _env;

/**
 * Required means "the schema will not accept this being absent", which is
 * exactly SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY today. Read off the
 * schema rather than listed here, so adding a field without a default cannot
 * quietly become optional.
 */
function isRequired(key) {
  const field = envSchema.shape[key];
  return field ? !field.isOptional() : false;
}

const describe = (issues) => issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');

/**
 * Validate the environment once, at startup.
 *
 * TWO THINGS THIS USED TO GET WRONG.
 *
 * The fallback was `envSchema.catch(ctx => ctx.input)`, and .catch() on an
 * OBJECT schema replaces the whole object, not the field that failed. So one
 * bad value returned raw process.env and threw away EVERY default: PORT,
 * NODE_ENV, LOG_LEVEL, FROM_EMAIL, APP_URL, TRUST_PROXY_HOPS, API_RATE_LIMIT.
 * The comment said "use defaults for any missing/invalid fields"; the code did
 * the opposite. Dropping just the offending keys and re-parsing gives each
 * remaining field its own default, which is what was meant.
 *
 * And a missing SUPABASE_SERVICE_ROLE_KEY logged a warning and carried on, so
 * the process booted, answered the health check, and failed every real request
 * against a database it could never reach. A service that cannot work should
 * refuse to start and say why: Railway then shows a crashed deploy, which is
 * the truth, instead of a green one serving errors.
 *
 * Note this returns config nothing currently reads, index.js and worker.js
 * call it for the check alone. That is fine, but it does mean this function is
 * the only thing standing between a typo in the Railway dashboard and a
 * confusing outage, so it has to be honest about what it did.
 */
function getEnv() {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);
  if (result.success) {
    _env = result.data;
    return _env;
  }

  const logger = require('../utils/logger');
  const fatal = result.error.issues.filter(i => isRequired(String(i.path[0])));

  if (fatal.length > 0) {
    const message = `Cannot start, required environment variables are missing or invalid:\n${describe(fatal)}`;
    logger.fatal(message);
    throw new Error(message);
  }

  /* Remove only what failed, then re-parse. Each dropped field falls back to
     its own default, or stays absent if it is optional, and everything that
     validated is untouched. */
  const cleaned = { ...process.env };
  for (const issue of result.error.issues) delete cleaned[String(issue.path[0])];
  const retry = envSchema.safeParse(cleaned);
  _env = retry.success ? retry.data : cleaned;

  logger.warn(`Ignoring invalid environment values, using defaults instead:\n${describe(result.error.issues)}`);
  return _env;
}

module.exports = { getEnv };
