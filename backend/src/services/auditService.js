const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Audit logging service for sensitive actions
 */
const AUDIT_ACTIONS = {
  // Auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  OAUTH_CALLBACK: 'OAUTH_CALLBACK',

  // Profile
  PROFILE_UPDATE: 'PROFILE_UPDATE',
  RESUME_UPLOAD: 'RESUME_UPLOAD',
  RESUME_DELETE: 'RESUME_DELETE',

  // Jobs
  JOB_CREATE: 'JOB_CREATE',
  JOB_UPDATE: 'JOB_UPDATE',
  JOB_DELETE: 'JOB_DELETE',
  JOB_FETCH: 'JOB_FETCH',

  // Email
  EMAIL_SEND: 'EMAIL_SEND',
  EMAIL_DRAFT: 'EMAIL_DRAFT',
  EMAIL_DISCOVER: 'EMAIL_DISCOVER',
  FOLLOWUP_SEND: 'FOLLOWUP_SEND',
  TEST_EMAIL_SEND: 'TEST_EMAIL_SEND',

  // Batch
  BATCH_SEND_START: 'BATCH_SEND_START',
  BATCH_SEND_COMPLETE: 'BATCH_SEND_COMPLETE',
};

/**
 * Log an audit event
 */
async function logAudit({
  userId,
  action,
  resourceType,
  resourceId,
  details,
  req,
  success = true,
  errorMessage,
}) {
  try {
    const auditEntry = {
      userId,
      action,
      resourceType,
      resourceId,
      details,
      success,
      errorMessage,
    };

    // Add request info if available
    if (req) {
      auditEntry.ip = req.ip;
      auditEntry.userAgent = req.get('user-agent');
    }

    await AuditLog.create(auditEntry);

    // Also log to structured logger
    const logLevel = success ? 'info' : 'warn';
    logger[logLevel](`[Audit] ${action}`, {
      userId,
      resourceType,
      resourceId,
      success,
      ...details,
    });

    return auditEntry;
  } catch (err) {
    // Don't throw - audit logging should never break the main flow
    logger.error('[Audit] Failed to write audit log', {
      error: err.message,
      action,
      userId,
    });
  }
}

/**
 * Middleware to automatically audit certain actions
 */
const auditMiddleware = (action, resourceType) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    const userId = req.user?.id;

    res.send = function (body) {
      // Log after response is sent
      const success = res.statusCode < 400;
      const resourceId = req.params.id;
      let details = {};

      if (req.body) {
        // Sanitize sensitive data from details
        const { jd, emailDraft, body: emailBody, ...safeBody } = req.body;
        details = safeBody;
      }

      if (userId) {
        logAudit({
          userId,
          action,
          resourceType,
          resourceId,
          details,
          req,
          success: res.statusCode < 400,
          errorMessage: success ? undefined : body,
        }).catch(() => {}); // Fire and forget
      }

      return originalSend.call(this, body);
    };

    next();
  };
};

module.exports = {
  logAudit,
  auditMiddleware,
  AUDIT_ACTIONS,
};
