'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const hysteriaController = require('../controllers/hysteriaController.js');

const router = express.Router();

router.get('/bypass', requireAuth, hysteriaController.getBypass);
router.post('/bypass', requireAuth, hysteriaController.updateBypass);
router.delete('/bypass', requireAuth, hysteriaController.clearBypass);
router.get('/hy2/users', requireAuth, hysteriaController.listUsers);
router.post('/hy2/users', requireAuth, hysteriaController.createUser);
router.delete('/hy2/users/:username', requireAuth, hysteriaController.deleteUser);
router.patch('/hy2/users/:username', requireAuth, hysteriaController.updateUser);

router.writeHysteriaConfig = hysteriaController.writeHysteriaConfig;

module.exports = router;
