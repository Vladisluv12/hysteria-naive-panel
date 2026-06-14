'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const naiveController = require('../controllers/naiveController.js');

const router = express.Router();

router.get('/naive/users', requireAuth, naiveController.listUsers);
router.post('/naive/users', requireAuth, naiveController.createUser);
router.delete('/naive/users/:username', requireAuth, naiveController.deleteUser);
router.patch('/naive/users/:username', requireAuth, naiveController.updateUser);

router.writeCaddyfile = naiveController.writeCaddyfile;

module.exports = router;
