require('dotenv').config();

const { getEnv } = require('./config/env');
getEnv(); // Validate env vars at startup

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
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
const { initSubscriptionCron } = require('./services/subscriptionCron');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// Middleware
// ============================================

// CORS — allow the Vite dev server and production frontend
const allowedOrigins = [
  'http://localhost:5173', 
  'http://127.0.0.1:5173',
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

// Parse JSON request bodies
app.use(express.json());

// Attach request ID and structured request logging
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
  logger.error({ err, reqId: req.id }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong. Please try again.',
  });
});

// ============================================
// Start server
// ============================================

// Start server if this file is run directly (e.g. via `node index.js`)
// This ensures it starts on Railway but skips when imported as a module (e.g. Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Store Manager API started');
    initSubscriptionCron();
  });
}

module.exports = app;
