// MUST be first, before express and @supabase/supabase-js, so Sentry can
// instrument them as they load. No-ops entirely when SENTRY_DSN is unset.
const sentry = require('./instrument');

require('dotenv').config();

const { getEnv } = require('./config/env');
getEnv(); // Validate env vars at startup

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const salesRoutes = require('./routes/sales');
const stockRoutes = require('./routes/stock');
const analyticsRoutes = require('./routes/analytics');
const rolesRoutes = require('./routes/roles');
const usersRoutes = require('./routes/users');
const businessesRoutes = require('./routes/businesses');
const locationsRoutes = require('./routes/locations');
const alertsRoutes = require('./routes/alerts');
const subscriptionsRoutes = require('./routes/subscriptions');
const billingRoutes = require('./routes/billing');
const customersRoutes = require('./routes/customers');
const qrcodesRoutes = require('./routes/qrcodes');
const unitsRoutes = require('./routes/units');
const stocktakeRoutes = require('./routes/stocktake');
const scannerRoutes = require('./routes/scanner');
const returnsRoutes = require('./routes/returns');
const ledgerRoutes = require('./routes/ledger');
const accountingTemplatesRoutes = require('./routes/accountingTemplates');
const suppliersRoutes = require('./routes/suppliers');
const purchaseOrdersRoutes = require('./routes/purchaseOrders');
const inventoryAnalyticsRoutes = require('./routes/inventoryAnalytics');
const pricingRoutes = require('./routes/pricing');
const customerOrdersRoutes = require('./routes/customerOrders');
const communicationsRoutes = require('./routes/communications');
const platformRoutes = require('./routes/platform');
const crmCommunicationsRoutes = require('./routes/crmCommunications');
const accountsReceivableRoutes = require('./routes/accountsReceivable');
const accountsPayableRoutes = require('./routes/accountsPayable');
const importsRoutes = require('./routes/imports');
const hrRoutes = require('./routes/hr');
const loyaltyRoutes = require('./routes/loyalty');
const reportsRoutes = require('./routes/reports');
const publicApiRoutes = require('./routes/publicApi');
const integrationsRoutes = require('./routes/integrations');
const { paystackWebhookHandler } = require('./routes/paystackWebhook');
const { healthDeepHandler } = require('./routes/healthDeep');
const auditLogsRoutes = require('./routes/auditLogs');
const { cspReportHandler, cspReportSummaryFromDb } = require('./routes/cspReport');
const apiKeyGuard = require('./middleware/apiKeyGuard');
const { isShuttingDown } = require('./utils/gracefulShutdown');
const { initSubscriptionCron } = require('./services/subscriptionCron');
const { initWebhookRetryCron } = require('./services/webhookRetryCron');
const { initDemoResetCron } = require('./services/demoResetCron');
const { initPendingSaleCron } = require('./services/pendingSaleCron');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the reverse proxy in front of us so req.ip is the real client, not
// the proxy socket. Without this every request shares one req.ip and EVERY
// rate limiter below becomes a single platform-wide bucket, loginLimiter
// stops meaning "10 logins per user per 15min" and starts meaning "10 logins
// for the whole platform", which locks out real users with no clue why.
//
// Deliberately a NUMBER, never `true`. express-rate-limit v8 throws
// ERR_ERL_PERMISSIVE_TRUST_PROXY on `true`, and rightly so: `true` takes the
// leftmost X-Forwarded-For entry, which any client can forge, that would make
// every limiter bypassable with one header and poison audit_logs.ip_address.
//
// DEFAULT OF 2, and it is chosen rather than assumed. The ingress paths differ:
//   browser  → Vercel rewrite → Railway edge → app
//   Paystack → Railway edge → app
//
// proxy-addr walks [socket, ...reversed X-Forwarded-For] and returns the first
// address it does not trust, so with n=1 you get the RIGHTMOST forwarded entry
// and with n=2 the one before it. Working that through both paths:
//
//   If Railway appends Vercel's egress IP, browser XFF is "client, vercel",
//     n=1 yields vercel's IP (every user collapses into a few buckets), n=2
//     yields the real client. n=2 wins.
//   If Railway forwards XFF untouched, browser XFF is just "client", n=2 runs
//     out of entries and returns the leftmost, which is still the client. Both
//     work, so n=2 is no worse.
//   Paystack's single-entry XFF behaves the same way under n=2: it runs out and
//     returns the client. Correct either way.
//
// So 2 is right under both possibilities and 1 is right under only one. It is
// also no more spoofable than 1, a single-entry XFF is trusted at either
// setting, and the only traffic on the direct path is signature-verified
// webhooks and limiter-exempt healthchecks.
//
// Override via TRUST_PROXY_HOPS if the topology changes. GET /api/health/deep
// reports { ip, ips, xff, remote } so you can confirm against the real
// deployment rather than reasoning about it.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 2));

// Per-business rate limit for the public storefront API. Keyed by the
// resolved business (from apiKeyGuard, which must run before this), not
// IP, several storefront requests can legitimately share an IP (a
// server-side integration). req.ip is only a fallback for the (rare)
// case apiKeyGuard let a request through with no req.business.
const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.business?.id || rateLimit.ipKeyGenerator(req.ip),
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================
// Middleware
// ============================================

// Security headers. Must come before CORS so every response carries them,
// including CORS rejections.
//
// NOTE ON CSP, deliberately DISABLED here, and that is not an oversight.
// Content-Security-Policy governs documents and workers; it is not applied to
// JSON fetch/XHR responses. A CSP header on /api/sales is parsed by nobody. The
// policy that actually constrains this product's frontend has to be attached to
// the HTML document, which Vercel serves, so the real CSP (Supabase, Recharts
// inline styles, the PWA worker) lives in vercel.json. Adding directives here
// would look like security while doing nothing. See vercel.json for the live one.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,

  // Helmet defaults this to same-origin, which would break the binary
  // attachments this API deliberately serves cross-origin, the receipts ZIP
  // (routes/ledger.js), the payroll CSV (routes/hr.js) and the business export.
  // CORP does not gate CORS-enabled fetches, so this does not widen data
  // access; the CORS allowlist above is still what authorises callers.
  crossOriginResourcePolicy: { policy: 'cross-origin' },

  // 2 years, but WITHOUT includeSubDomains, intentionally.
  //
  // Vercel rewrites /api/* to this server, so these headers reach the browser
  // under quaderp.app rather than the Railway host. includeSubDomains would
  // therefore pin every *.quaderp.app name to HTTPS for two years, in every
  // visitor's browser, with no way to revoke it, including the per-business
  // subdomains that emailService's resolveBusinessLoginUrl generates. Turn it
  // on only after confirming every subdomain is HTTPS-only.
  hsts: { maxAge: 63072000, includeSubDomains: false, preload: false },

  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
}));

// CORS, allow the Vite dev server and production frontend
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5178',
  'http://127.0.0.1:5178',
  'http://localhost:3000',
  'https://store-manager-app-one.vercel.app',
  'https://store-manager-app-quademagency-glitchs-projects.vercel.app',
  'https://quaderp.app',
  'https://www.quaderp.app',
  'https://app.quaderp.app',
];

if (process.env.APP_URL) {
  allowedOrigins.push(process.env.APP_URL);
}
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Also allow any Vercel preview deployment URLs for this project
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (e.g. server-to-server, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow all Vercel preview deployments for this project
    if (origin.match(/https:\/\/store-manager-.*\.vercel\.app$/)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Redirect plaintext HTTP to HTTPS.
//
// HONEST ASSESSMENT: this will almost never fire. Vercel and Railway both
// terminate TLS and redirect at their edge, so a plaintext request should never
// reach this process. It exists as defence-in-depth against a future custom
// domain being misconfigured, and note that by the time it *does* fire, the
// credentials have already crossed a plaintext hop. HSTS above is the control
// that actually prevents that. Kept behind FORCE_HTTPS so it can be disabled
// without a deploy if it ever misbehaves.
const HTTPS_REDIRECT_ENABLED =
  process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS !== 'false';

app.use((req, res, next) => {
  if (!HTTPS_REDIRECT_ENABLED) return next();

  // A redirected preflight is not followed by browsers, it surfaces as an
  // opaque CORS failure that looks like nothing at all.
  if (req.method === 'OPTIONS') return next();

  // Railway's platform healthcheck and any private-network call arrive with no
  // x-forwarded-proto. Redirecting those turns the healthcheck into a non-2xx
  // and fails the deploy. Only act when the header explicitly says http.
  const proto = req.get('x-forwarded-proto');
  if (!proto) return next();
  if (proto.split(',')[0].trim() === 'https') return next();

  if (req.path === '/api/health' || req.path.startsWith('/api/health/')) return next();

  // 308, never 301/302. A 301 would rewrite POST to GET and drop the body,
  // POST /api/sales would silently become a GET, return a list, and the sale
  // would vanish with the client seeing a success.
  return res.redirect(308, `https://${req.get('host')}${req.originalUrl}`);
});

// Attach request ID and structured request logging.
//
// This runs BEFORE the body parsers on purpose: a body that blows the size
// limit is rejected by the parser itself, and if the request had no req.id yet
// there'd be nothing to correlate that 413 with in the logs.
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      reqId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
    }, `${req.method} ${req.path}`);
  });
  next();
});

// CSP violation reports, registered before the global JSON parser because
// browsers send these as application/csp-report or application/reports+json,
// neither of which express.json() accepts by default.
//
// Public and unauthenticated by necessity: browsers post these with no
// credentials. Hard rate limit because the body is entirely attacker-controlled
// and this is a cheap thing to spray. 64kb is generous for a report.
const cspReportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => rateLimit.ipKeyGenerator(req.ip),
  standardHeaders: false,
  legacyHeaders: false,
  // Reports are fire-and-forget; a throttled reporter should not see an error.
  handler: (req, res) => res.status(204).end(),
});
app.post(
  '/api/csp-report',
  cspReportLimiter,
  express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '64kb' }),
  // Swallow parse failures. Four-argument middleware only runs when something
  // before it errored, so this is skipped on the happy path. express.json is
  // strict by default and rejects bodies that aren't an object or array, which
  // would otherwise surface as a 400, and a report collector should never hand
  // an error back to a browser that was only trying to tell us something.
  // eslint-disable-next-line no-unused-vars
  (err, req, res, next) => res.status(204).end(),
  cspReportHandler,
);

// Paystack webhooks, MUST be registered before the JSON parser below.
//
// Signature verification HMACs the exact bytes Paystack signed, and once
// express.json() has drained the request stream those bytes are gone for good
// (a later express.raw() is a silent no-op, body-parser skips when the stream
// is already finished). This is the only point in the middleware chain where
// the raw body still exists.
//
// Two URLs, one handler: both were live historically and which one is set in
// the Paystack dashboard isn't knowable from here. Registering both costs
// nothing; guessing wrong drops payments silently.
//
// app.post with an exact path rather than app.use with a prefix, app.use would
// also match /api/billing/paystack/webhook/anything, which is free attack
// surface for no benefit.
const paystackRawBody = express.raw({ type: '*/*', limit: '256kb' });
app.post('/api/billing/paystack/webhook', paystackRawBody, paystackWebhookHandler);
app.post('/api/subscriptions/paystack-webhook', paystackRawBody, paystackWebhookHandler);

// Parse JSON request bodies.
//
// The default limit is 100kb, which is the right ceiling for essentially every
// route here, the biggest legitimate body is a sale's unit_ids array (~2,000
// UUIDs at 100kb), and letterheads store Supabase Storage URLs rather than
// base64 (LetterheadBuilder uploads client-side).
//
// Bulk import is the one genuine exception. /api/imports/preview takes the file
// as multipart (10MB, see middleware/upload.js) but then the client holds the
// parsed rows in memory and POSTs them back as a JSON array to /validate and
// /commit, so a ~1,000-row product import is ~200kb of JSON and was being
// rejected outright.
//
// This has to be ONE parser that varies its limit by path, not a second
// express.json() mounted in front of those routes: body-parser 2.x skips when
// onFinished.isFinished(req) is true, so once the global parser has drained the
// stream any later parser is a silent no-op that leaves req.body untouched.
const LARGE_JSON_PATHS = [/^\/api\/imports\/(validate|commit)$/];
const jsonSmall = express.json({ limit: '100kb' });
const jsonLarge = express.json({ limit: '20mb' });
app.use((req, res, next) =>
  (LARGE_JSON_PATHS.some((re) => re.test(req.path)) ? jsonLarge : jsonSmall)(req, res, next));

// ============================================
// Routes
// ============================================

// Health check (liveness). Railway's healthcheckPath points here, keep it
// dependency-free so a transient Supabase blip can never block a deploy.
app.get('/api/health', (req, res) => {
  // Once a shutdown signal has landed, report unhealthy so the proxy stops
  // routing new requests here while in-flight ones drain. Returning 200 during
  // a drain is what causes the 502s people blame on the deploy itself.
  if (isShuttingDown()) {
    return res.status(503).json({
      status: 'shutting_down',
      timestamp: new Date().toISOString(),
    });
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Deep health check (readiness), pings dependencies and reports timings.
//
// Its own limiter, mounted before the general one so a deep check never
// consumes an app-wide budget. The 10s result cache inside the handler is the
// real anti-amplification control; this is belt-and-braces for a cold cache.
//
// Deliberately NOT railway.toml's healthcheckPath, see routes/healthDeep.js.
const healthDeepLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 6,
  keyGenerator: (req) => rateLimit.ipKeyGenerator(req.ip),
  message: { error: 'Too many health checks' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.get('/api/health/deep', healthDeepLimiter, healthDeepHandler);

// Aggregated CSP violations, for deciding whether the policy is safe to
// enforce. Reads from Postgres rather than process memory: the API runs one
// worker per core and reports are spread across them, so an in-memory tally is
// a one-in-N sample, it answered "0 violations" while sibling workers were
// recording them. A false all-clear is the one answer this must never give.
//
// Same token gate as the deep health check: it reveals which resources the app
// loads, which is reconnaissance.
app.get('/api/csp-report/summary', healthDeepLimiter, async (req, res) => {
  const expected = process.env.HEALTH_CHECK_TOKEN;
  if (expected && req.get('x-health-token') !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    // Nonsense input falls back to the default rather than clamping to 1.
    // Clamping would silently narrow the window to a single day, and on this
    // endpoint a narrow window reads as "no violations", the one answer it
    // must never give wrongly.
    const requested = parseInt(req.query.days, 10);
    const sinceDays = Number.isFinite(requested) && requested > 0 ? Math.min(90, requested) : 30;
    const violations = await cspReportSummaryFromDb({ sinceDays });
    const enforced = violations.filter((v) => v.disposition === 'enforce');
    res.json({
      windowDays: sinceDays,
      distinct: violations.length,
      total: violations.reduce((n, v) => n + v.count, 0),
      violations,
      note: violations.length === 0
        ? 'No violations in this window. If real traffic has exercised the main flows, the policy looks safe to switch from Report-Only to enforcing.'
        : enforced.length > 0
          ? 'Some violations have disposition=enforce, meaning resources were actually BLOCKED for real users. Fix these first.'
          : 'These would be blocked once enforcing. Allow the legitimate ones in vercel.json before switching the header name.',
    });
  } catch (err) {
    logger.error({ err, reqId: req.id }, 'Failed to read CSP violation summary');
    res.status(500).json({ error: 'Failed to read CSP violations' });
  }
});

// ── General API rate limit ───────────────────────────────────────────
//
// Everything except the public storefront API and the scanner was completely
// unthrottled. This is the abuse ceiling, not a quota.
//
// KEYED BY SESSION, NOT IP. Six cashiers on one shop's NAT'd connection share
// a single public IP, and useHR.js alone has 12 call sites, a busy till would
// cross a naive per-IP limit during normal work. Hashing the Authorization
// header gives each signed-in session its own budget, while unauthenticated
// traffic (the thing actually worth throttling) still lands on the IP bucket.
// A token-rotating attacker evades the session bucket, but that traffic is
// attributable and revocable, which anonymous flooding is not.
//
// MOUNTED AT THE ROOT, not app.use('/api', ...). Inside a path-mounted
// middleware Express strips the prefix, so req.path would be '/auth/login' and
// every skip below would silently never match, the limiter would look correct
// and quietly throttle the health check.
//
// Under cluster the real ceiling is workers x limit, because MemoryStore is
// per-process. Fine for an abuse ceiling; it is not a precise number, and
// pretending otherwise would be worse than saying so.
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT ?? 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Slow down for a moment and try again.',
  },
  keyGenerator: (req) => {
    const auth = req.headers.authorization;
    if (auth) {
      // Hashed, never stored raw, this key ends up in memory and in logs.
      return 'jwt:' + crypto.createHash('sha256').update(auth).digest('base64url').slice(0, 22);
    }
    return 'ip:' + rateLimit.ipKeyGenerator(req.ip);
  },
  skip: (req) =>
    // Railway's healthcheck and any uptime monitor must never be throttled,
    // and must never consume someone else's budget.
    req.path === '/api/health' ||
    req.path.startsWith('/api/health/') ||
    // Already limited per business at 120/min. A storefront integration running
    // at 110rpm from one server IP is inside its budget but would be cut off by
    // an IP-keyed limiter, this is the one genuine conflict.
    req.path.startsWith('/api/v1/public/') ||
    // scanLimiter is 60/min, tighter than this, so it always trips first.
    req.path.startsWith('/api/scanner/') ||
    // Fire-and-forget browser reports with their own 60/min limit.
    req.path === '/api/csp-report',
  // NOTE: /api/auth/* is deliberately NOT skipped. loginLimiter (10/15min) and
  // signupLimiter (5/hr) are far tighter, so they always trip first and there
  // is no double penalty in practice, but this still caps someone hammering
  // /api/auth/me, which nothing else does.
});
app.use(generalApiLimiter);

// Auth routes
app.use('/api/auth', authRoutes);

// Products routes
app.use('/api/products', productsRoutes);

// Sales routes
app.use('/api/sales', salesRoutes);

// Stock routes
app.use('/api/stock', stockRoutes);

// Customers routes
app.use('/api/customers', customersRoutes);

// Analytics routes
app.use('/api/analytics', analyticsRoutes);

// Roles routes
app.use('/api/roles', rolesRoutes);

// Users routes
app.use('/api/users', usersRoutes);

// Businesses routes
app.use('/api/businesses', businessesRoutes);

// Locations routes
app.use('/api/locations', locationsRoutes);

// Alerts routes
app.use('/api/alerts', alertsRoutes);

// Subscriptions routes
app.use('/api/subscriptions', subscriptionsRoutes);

// Billing routes
app.use('/api/billing', billingRoutes);

// QR Codes routes (Platform Admin)
app.use('/api/qrcodes', qrcodesRoutes);

// Inventory Units routes
app.use('/api/units', unitsRoutes);

// Stock Take routes
app.use('/api/stocktake', stocktakeRoutes);

// Scanner routes
app.use('/api/scanner', scannerRoutes);

// Returns routes
app.use('/api/returns', returnsRoutes);

// Ledger routes
app.use('/api/ledger', ledgerRoutes);

// Accounting Templates routes
app.use('/api/accounting/templates', accountingTemplatesRoutes);

// Suppliers routes
app.use('/api/suppliers', suppliersRoutes);

// Purchase Orders routes
app.use('/api/purchase-orders', purchaseOrdersRoutes);

// Inventory Analytics routes
app.use('/api/inventory-analytics', inventoryAnalyticsRoutes);
app.use('/api/pricing', pricingRoutes);

// Customer Orders routes (CRM)
app.use('/api/customer-orders', customerOrdersRoutes);

// CRM Communications routes
app.use('/api/crm-communications', crmCommunicationsRoutes);

// Accounts Receivable / Payable routes
app.use('/api/ar', accountsReceivableRoutes);
app.use('/api/ap', accountsPayableRoutes);

// Bulk import routes
app.use('/api/imports', importsRoutes);

// Platform Admin Communications and Settings
app.use('/api/communications', communicationsRoutes);
app.use('/api/platform', platformRoutes);

// HR routes
app.use('/api/hr', hrRoutes);

// Loyalty routes
app.use('/api/loyalty', loyaltyRoutes);

// Reports routes
app.use('/api/reports', reportsRoutes);

// Security audit trail, read-only, manage_business gated
app.use('/api/audit-logs', auditLogsRoutes);

// Ecommerce integrations, admin CRUD for API keys/webhooks (staff auth)
app.use('/api/integrations', integrationsRoutes);

// Public storefront API, API-key auth, not staff JWT. apiKeyGuard must run
// before publicApiLimiter so the limiter can key by req.business.id.
app.use('/api/v1/public', apiKeyGuard, publicApiLimiter, publicApiRoutes);

// ============================================
// Error handling
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found.`,
  });
});

// Sentry's error handler. Goes AFTER the 404 handler (which responds without
// calling next(), so 404s never reach Sentry, correct, they are not errors)
// and BEFORE the handler below, which terminates the chain.
sentry.setupExpressErrorHandler(app);

// Global error handler
app.use((err, req, res, next) => {
  // Streaming routes (the receipts ZIP in routes/ledger.js, the business
  // export) have already flushed headers by the time they can fail. Writing a
  // JSON 500 on top of that throws ERR_HTTP_HEADERS_SENT from inside the error
  // handler itself, replacing a useful error with a confusing one. Hand it to
  // Express, which destroys the socket, the client sees a truncated transfer,
  // which is at least detectable.
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;

  // body-parser rejects an oversized body with a 413. Without this branch it
  // fell through to the generic 500 below, so a user importing too many rows
  // saw "Internal server error" and had no idea the request was simply too big.
  if (status === 413) {
    logger.warn({ reqId: req.id, path: req.path, limit: err.limit }, 'Request body too large');
    return res.status(413).json({
      error: 'Payload too large',
      message: 'That request was too large to process. Try again with fewer records at a time.',
    });
  }

  if (status === 400 && err.type === 'entity.parse.failed') {
    logger.warn({ reqId: req.id, path: req.path }, 'Malformed JSON body');
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'The request body could not be parsed as JSON.',
    });
  }

  logger.error({ err, reqId: req.id }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong. Please try again.',
  });
});

// ============================================
// Start server
// ============================================

// Start server if this file is run directly (e.g. via `node index.js`).
// When run via cluster.js, workers import this as a module, they call
// app.listen() themselves and the primary process handles the cron.
if (require.main === module) {
  const cluster = require('node:cluster');
  const { installGracefulShutdown } = require('./utils/gracefulShutdown');
  const cronTasks = [];

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Store Manager API started');
    // Only init cron if running standalone (not via cluster.js)
    if (!cluster.isWorker) {
      cronTasks.push(
        initSubscriptionCron(),
        initWebhookRetryCron(),
        initDemoResetCron(),
        initPendingSaleCron(),
      );
    }
  });

  installGracefulShutdown(server, {
    name: 'standalone',
    onShutdown: async () => {
      cronTasks.forEach((task) => task?.stop?.());
      const posthog = require('./utils/posthog');
      if (posthog) await posthog.shutdown();
    },
  });
}

module.exports = app;
