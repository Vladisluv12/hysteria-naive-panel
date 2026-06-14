'use strict';

const express = require('express');
const { loginLimiter, requireAuth } = require('../middleware/auth.js');
const authController = require('../controllers/authController.js');

const router = express.Router();

router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.post('/config/change-password', requireAuth, authController.changePassword);

module.exports = router;
