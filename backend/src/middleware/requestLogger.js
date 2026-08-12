const logger = require('../utils/logger');

/**
 * Request logging middleware
 * Logs all incoming requests with timing information
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  // Log request (skip in dev unless error happens later)
  if (process.env.NODE_ENV !== 'development') {
    logger.debug('[Request]', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  }

  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    // In development, only log warnings and errors to reduce noise
    if (process.env.NODE_ENV === 'development' && logLevel === 'info') {
      return;
    }

    logger[logLevel]('[Response]', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip,
    });
  });

  next();
};

module.exports = requestLogger;
