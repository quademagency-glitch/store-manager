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

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// Middleware
// ============================================

// CORS — allow the Vite dev server and production frontend
const allowedOrigins = [
  'http://localhost:5173', 
  'http://localhost:3000',
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

app.use(cors({
  origin: allowedOrigins,
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

// Analytics routes
app.use('/api/analytics', analyticsRoutes);

// Roles routes
app.use('/api/roles', rolesRoutes);

// Users routes
app.use('/api/users', usersRoutes);

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

// Start server if not running in a serverless environment
if (process.env.NODE_ENV !== 'production' || process.env.RENDER === 'true' || process.env.RENDER === '1' || process.env.PORT) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Store Manager API running on port ${PORT}`);
    console.log(`   Health check: port ${PORT}/api/health`);
    console.log(`   Auth routes:  port ${PORT}/api/auth\n`);
  });
}

module.exports = app;
