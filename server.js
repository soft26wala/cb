const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const { accessLogStream } = require('./utils/logger');
const { globalRateLimiter } = require('./middleware/rateLimiter.middleware');
const { errorHandler } = require('./middleware/error.middleware');
const apiRoutes = require('./routes');
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 4000;

// Security & Optimization Middleware
app.disable('x-powered-by');
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(cookieParser());
// Stripe Webhook Raw Body Handler (Must precede express.json)
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV === 'production') {
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(globalRateLimiter);
  app.use(morgan('combined', { stream: accessLogStream }));
} else {
  app.use(morgan('dev'));
}



app.get('/', (req, res, next) => {
  res.send({
    status: 'UP',
    message: 'Production Ready Express & PostgreSQL Server is running cleanly',
    timestamp: new Date().toISOString(),
    db: process.env.DB_NAME
  })
})



// Static Directories
app.use('/public', express.static(path.join(__dirname, 'public')));

// Root Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    message: 'Production Ready Express & PostgreSQL Server is running cleanly',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api', apiRoutes);
app.use('/', apiRoutes); // Direct root route matching as requested in prompt

// 404 Route Handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.originalUrl}`,
  });
});







// Global Error Handler Middleware
app.use(errorHandler);

const seedDatabase = require('./database/seed');

// Start Server
const server = app.listen(PORT, () => {
  console.log(`🚀 Production Express.js Server listening on http://localhost:${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  seedDatabase().catch((e) => console.warn('Seed initialization error:', e.message));
});

// Graceful Shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n⚠️ Received ${signal}. Shutting down HTTP server and PostgreSQL pool...`);
  server.close(() => {
    console.log('HTTP server closed.');
    db.pool.end(() => {
      console.log('PostgreSQL database pool closed. Process terminating.');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
