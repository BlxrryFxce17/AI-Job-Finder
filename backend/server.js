require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { requireAuth } = require('./src/middleware/auth');
const { apiLimiter } = require('./src/middleware/rateLimiter');
const { initFollowupCron } = require('./src/services/cronService');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const profileRoutes = require('./src/routes/profileRoutes');
const jobRoutes = require('./src/routes/jobRoutes');
const trackingRoutes = require('./src/routes/trackingRoutes');

// Validate critical environment variables at startup
if (config.nodeEnv === 'production' && !config.jwtSecret) {
  throw new Error('JWT_SECRET must be set in production environment');
}

if (!config.mongoUri) {
  logger.error('MONGO_URI is missing from .env! App will not work without it.');
}

const app = express();
const PORT = config.port;

// CORS configuration - restrict to frontend origin
const corsOptions = {
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Apply general rate limiter
app.use(apiLimiter);

// Connect to MongoDB
if (config.mongoUri) {
  mongoose.connect(config.mongoUri)
    .then(() => logger.info('✅ Connected to MongoDB Atlas'))
    .catch(err => logger.error('❌ MongoDB Connection Error', { error: err.message }));
}

// Initialize cron jobs
initFollowupCron();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv
  });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api', trackingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path 
  });
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation error', details: err.message });
  }
  
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(`🚀 Backend server running on http://localhost:${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});