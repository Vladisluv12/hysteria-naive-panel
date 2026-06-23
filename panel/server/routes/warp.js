'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const warpController = require('../controllers/warpController.js');

const router = express.Router();

router.get('/warp/status', requireAuth, warpController.getWarpStatus);
router.get('/warp/config', requireAuth, warpController.getWarpConfig);
router.put('/warp/config', requireAuth, warpController.updateWarpConfig);
router.post('/warp/start', requireAuth, warpController.startWarp);
router.post('/warp/stop', requireAuth, warpController.stopWarp);
router.post('/warp/restart', requireAuth, warpController.restartWarp);

module.exports = router;
