'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const systemController = require('../controllers/systemController.js');

const router = express.Router();

router.get('/config', requireAuth, systemController.getConfig);
router.get('/system/version', requireAuth, systemController.getVersion);
router.get('/status', requireAuth, systemController.getStatus);
router.get('/traffic', requireAuth, systemController.getTraffic);
router.post('/service/:kind/:action', requireAuth, systemController.serviceAction);

module.exports = router;
