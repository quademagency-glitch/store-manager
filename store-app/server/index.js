require('dotenv').config();

const { getEnv } = require('./config/env');
getEnv(); // Validate env vars at startup

const express = require('express');
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
const apiKeyGuard = require('./middleware/apiKeyGuard');
const { initSubscriptionCron } = require('./services/subscriptionCron');
const { initWebhookRetryCron } = require('./services/webhookRetryCron');
const { initDemoResetCron } = require('./services/demoResetCron');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust the reverse proxy in front of us so req.ip is the real client, not
// the proxy socket. Without this every request shares one req.ip and EVERY
// rate limiter below becomes a single platform-wide bucket — loginLimiter
// stops meaning "10 logins per user per 15min" and starts meaning "10 logins
// for the whole platform", which locks out real users with no clue why.
//
// Deliberately a NUMBER, never `true`. express-rate-limit v8 throws
// ERR_ERL_PERMISSIVE_TRUST_PROXY on `true`, and rightly so: `true` takes the
// leftmost X-Forwarded-For entry, which any client can forge — that would make
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
//   If Railway appends Vercel's egress IP, browser XFF is "client, vercel" —
//     n=1 yields vercel's IP (every user collapses into a few buckets), n=2
//     yields the real client. n=2 wins.
//   If Railway forwards XFF untouched, browser XFF is just "client" — n=2 runs
//     out of entries and returns the leftmost, which is still the client. Both
//     work, so n=2 is no worse.
//   Paystack's single-entry XFF behaves the same way under n=2: it runs out and
//     returns the client. Correct either way.
//
// So 2 is right under both possibilities and 1 is right under only one. It is
// also no more spoofable than 1 — a single-entry XFF is trusted at either
// setting — and the only traffic on the direct path is signature-verified
// webhooks and limiter-exempt healthchecks.
//
// Override via TRUST_PROXY_HOPS if the topology changes. GET /api/health/deep
// reports { ip, ips, xff, remote } so you can confirm against the real
// deployment rather than reasoning about it.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 2));

// Per-business rate limit for the public storefront API. Keyed by the
// resolved business (from apiKeyGuard, which must run before this), not
// IP — several storefront requests can legitimately share an IP (a
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

// CORS — allow the Vite dev server and production frontend
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

// Parse JSON request bodies.
//
// The default limit is 100kb, which is the right ceiling for essentially every
// route here — the biggest legitimate body is a sale's unit_ids array (~2,000
// UUIDs at 100kb), and letterheads store Supabase Storage URLs rather than
// base64 (LetterheadBuilder uploads client-side).
//
// Bulk import is the one genuine exception. /api/imports/preview takes the file
// as multipart (10MB, see middleware/upload.js) but then the client holds the
// parsed rows in memory and POSTs them back as a JSON array to /validate and
// /commit — so a ~1,000-row product import is ~200kb of JSON and was being
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

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

// Ecommerce integrations — admin CRUD for API keys/webhooks (staff auth)
app.use('/api/integrations', integrationsRoutes);

// Public storefront API — API-key auth, not staff JWT. apiKeyGuard must run
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

// Global error handler
app.use((err, req, res, next) => {
  // Streaming routes (the receipts ZIP in routes/ledger.js, the business
  // export) have already flushed headers by the time they can fail. Writing a
  // JSON 500 on top of that throws ERR_HTTP_HEADERS_SENT from inside the error
  // handler itself, replacing a useful error with a confusing one. Hand it to
  // Express, which destroys the socket — the client sees a truncated transfer,
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
// When run via cluster.js, workers import this as a module — they call
// app.listen() themselves and the primary process handles the cron.
if (require.main === module) {
  const cluster = require('node:cluster');
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Store Manager API started');
    // Only init cron if running standalone (not via cluster.js)
    if (!cluster.isWorker) {
      initSubscriptionCron();
      initWebhookRetryCron();
      initDemoResetCron();
    }
  });
}

module.exports = app;
