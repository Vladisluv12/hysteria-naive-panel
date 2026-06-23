'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const diagController = require('../controllers/diagController.js');

const router = express.Router();

router.get('/logs/:kind', requireAuth, diagController.getLogs);
router.get('/diag/ports', requireAuth, diagController.getPorts);
router.get('/diag/hysteria-config', requireAuth, diagController.getHysteriaConfig);
router.get('/diag/caddyfile', requireAuth, diagController.getCaddyfile);
router.post('/diag/fix-hy2-tls', requireAuth, diagController.fixHy2Tls);
router.get('/tuning/status', requireAuth, diagController.getTuningStatus);
router.post('/tuning/apply', requireAuth, diagController.applyTuning);

module.exports = router;
