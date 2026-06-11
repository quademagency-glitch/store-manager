require('dotenv').config();

const express = require('express');
const cors = require('cors');
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
];

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

// Request logging (development)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
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
  console.error('Unhandled error:', err);
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
    console.log(`\n🚀 Store Manager API running on port ${PORT}`);
    console.log(`   Health check: port ${PORT}/api/health`);
    console.log(`   Auth routes:  port ${PORT}/api/auth`);
    console.log(`   Subscriptions: port ${PORT}/api/subscriptions`);
    console.log(`   Billing:       port ${PORT}/api/billing\n`);

    // Initialize subscription cron job
    initSubscriptionCron();
  });
}

module.exports = app;
