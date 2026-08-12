const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  createJob,
  updateJob,
  discoverEmail,
  generateEmail,
  sendEmail,
  singleDraft,
  fetchJobs,
  sendFollowup,
  pagination,
} = require('../middleware/validation');
const {
  apiLimiter,
  aiLimiter,
  emailLimiter,
  fetchJobsLimiter,
} = require('../middleware/rateLimiter');
const jobController = require('../controllers/jobController');

router.get('/', requireAuth, apiLimiter, pagination, jobController.getJobs);
router.post('/', requireAuth, apiLimiter, createJob, jobController.createJob);
router.put('/:id', requireAuth, apiLimiter, updateJob, jobController.updateJob);
router.delete('/:id', requireAuth, apiLimiter, jobController.deleteJob);
router.post('/fetch', requireAuth, fetchJobsLimiter, fetchJobs, jobController.fetchJobs);
router.post('/discover-email', requireAuth, aiLimiter, discoverEmail, jobController.discoverEmail);
router.post('/generate-email', requireAuth, aiLimiter, generateEmail, jobController.generateEmail);
router.post('/send-email', requireAuth, emailLimiter, sendEmail, jobController.sendEmail);
router.post(
  '/single-draft',
  requireAuth,
  aiLimiter,
  emailLimiter,
  singleDraft,
  jobController.singleDraft
);
router.post('/send-followup', requireAuth, emailLimiter, sendFollowup, jobController.sendFollowup);
router.post('/test-email', requireAuth, aiLimiter, emailLimiter, jobController.testEmail);
router.get('/check-bounces', requireAuth, apiLimiter, jobController.checkBounces);

module.exports = router;
