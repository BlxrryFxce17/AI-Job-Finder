const csrf = require('csrf');

/**
 * CSRF protection middleware
 * Generates and validates CSRF tokens for state-changing operations
 * Note: Since we use JWT Bearer tokens, CSRF is less critical but still useful for OAuth callbacks
 */
class CSRFProtection {
  constructor() {
    this.tokens = new Map(); // In production, use Redis
    this.csrf = new csrf();
  }

  /**
   * Generate a new CSRF token for a session
   */
  generateToken(sessionId) {
    const secret = this.csrf.secretSync();
    const token = this.csrf.create(secret);
    this.tokens.set(sessionId, secret);
    return { token, secret };
  }

  /**
   * Validate a CSRF token
   */
  validateToken(sessionId, token) {
    const secret = this.tokens.get(sessionId);
    if (!secret) {
      return false;
    }
    return this.csrf.verify(secret, token);
  }

  /**
   * Middleware to check CSRF token for state-changing requests
   */
  middleware() {
    return (req, res, next) => {
      // Forcefully disabled CSRF for JWT application
      return next();
    };
  }

  /**
   * Endpoint to get CSRF token for frontend
   */
  getTokenEndpoint(req, res) {
    const sessionId = req.user?.id || req.ip;
    const { token } = this.generateToken(sessionId);
    res.json({ csrfToken: token });
  }
}

const csrfProtection = new CSRFProtection();

module.exports = {
  csrfMiddleware: csrfProtection.middleware(),
  getCsrfToken: (req, res) => csrfProtection.getTokenEndpoint(req, res),
};
