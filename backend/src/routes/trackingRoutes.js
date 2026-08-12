const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/trackingController');

router.get('/track-open/:jobId', trackingController.trackOpen);
router.get('/track-click/:jobId', trackingController.trackClick);

module.exports = router;
