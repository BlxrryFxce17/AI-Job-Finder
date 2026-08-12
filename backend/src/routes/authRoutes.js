const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');
const { getCsrfToken } = require('../middleware/csrf');

router.get('/google', authLimiter, authController.googleAuth);
router.get('/google/callback', authController.googleCallback);
router.get('/csrf-token', requireAuth, authLimiter, getCsrfToken);

module.exports = router;
