'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const vlessController = require('../controllers/vlessController.js');

const router = express.Router();

router.get('/vless/users', requireAuth, vlessController.listUsers);
router.post('/vless/users', requireAuth, vlessController.createUser);
router.delete('/vless/users/:username', requireAuth, vlessController.deleteUser);
router.patch('/vless/users/:username', requireAuth, vlessController.updateUser);

router.writeVlessConfig = vlessController.writeVlessConfig;

module.exports = router;
