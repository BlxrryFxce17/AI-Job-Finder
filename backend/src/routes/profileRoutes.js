const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { 
  createJob, 
  updateJob 
} = require('../middleware/validation');
const authLimiter = require('../middleware/rateLimiter').authLimiter;
const profileController = require('../controllers/profileController');

router.get('/', requireAuth, profileController.getProfile);
router.put('/', requireAuth, authLimiter, profileController.updateProfile);
router.post('/resume', requireAuth, authLimiter, profileController.uploadResume);
router.get('/resume-pdf', requireAuth, profileController.getResumePdf);

module.exports = router;