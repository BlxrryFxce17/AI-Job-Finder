const { body, param, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

module.exports = {
  validate,
  
  // Job validation
  createJob: [
    body('company').trim().notEmpty().withMessage('Company is required'),
    body('role').trim().notEmpty().withMessage('Role is required'),
    body('jd').optional().isString(),
    body('status').optional().isIn(['Found', 'Drafting', 'Sent', 'Opened', 'Bounced', 'Replied']),
    body('applyLink').optional().isURL(),
    body('location').optional().isString(),
    validate
  ],
  
  updateJob: [
    param('id').notEmpty().withMessage('Job ID is required'),
    body('status').optional().isIn(['Found', 'Drafting', 'Sent', 'Opened', 'Bounced', 'Replied']),
    body('emailRecipient').optional().isEmail(),
    body('emailDraft').optional().isString(),
    body('tracked').optional().isBoolean(),
    validate
  ],
  
  // Profile validation
  updateProfile: [
    body('name').optional().trim().isLength({ max: 100 }),
    body('title').optional().trim().isLength({ max: 100 }),
    body('phone').optional().trim().isLength({ max: 30 }),
    body('linkedin').optional().trim().isURL(),
    body('github').optional().trim().isURL(),
    body('tone').optional().isIn(['Professional', 'Confident & Direct', 'Enthusiastic & Friendly', 'Short & Punchy']),
    body('experienceLevel').optional().trim().isLength({ max: 50 }),
    body('enableFlex').optional().isBoolean(),
    body('aiInstructions').optional().trim().isLength({ max: 1000 }),
    validate
  ],
  
  // Email discovery validation
  discoverEmail: [
    body('company').trim().notEmpty().withMessage('Company name is required'),
    body('jd').optional().isString(),
    body('failedEmails').optional().isArray(),
    validate
  ],
  
  // Generate email validation
  generateEmail: [
    body('company').trim().notEmpty().withMessage('Company is required'),
    body('role').trim().notEmpty().withMessage('Role is required'),
    body('jd').optional().isString(),
    body('type').optional().isString(),
    validate
  ],
  
  // Send email validation
  sendEmail: [
    body('jobId').notEmpty().withMessage('Job ID is required'),
    body('to').isEmail().withMessage('Valid recipient email is required'),
    body('subject').optional().isString(),
    body('body').notEmpty().withMessage('Email body is required'),
    validate
  ],
  
  // Single draft validation
  singleDraft: [
    body('company').optional().trim().isString(),
    body('role').optional().trim().isString(),
    body('recipientEmail').isEmail().withMessage('Valid recipient email is required'),
    body('jd').notEmpty().withMessage('Job description is required'),
    validate
  ],
  
  // Fetch jobs validation
  fetchJobs: [
    body('queries').isArray({ min: 1 }).withMessage('At least one query is required'),
    body('queries.*').trim().notEmpty(),
    validate
  ],
  
  // Follow-up validation
  sendFollowup: [
    body('jobId').notEmpty().withMessage('Job ID is required'),
    body('day').isInt({ min: 1, max: 30 }).withMessage('Day must be between 1 and 30'),
    validate
  ]
};