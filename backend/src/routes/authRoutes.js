const express = require('express');
const router = express.Router();
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

router.get('/google', authLimiter, authController.googleAuth);
router.get('/google/callback', authController.googleCallback);

module.exports = router;