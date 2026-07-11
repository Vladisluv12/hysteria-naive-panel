'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const mieruController = require('../controllers/mieruController.js');

const router = express.Router();

router.get('/mieru/users', requireAuth, mieruController.listUsers);
router.post('/mieru/users', requireAuth, mieruController.createUser);
router.get('/mieru/users/:username/link', requireAuth, mieruController.getUserLink);
router.delete('/mieru/users/:username', requireAuth, mieruController.deleteUser);
router.patch('/mieru/users/:username', requireAuth, mieruController.updateUser);

router.writeMieruConfig = mieruController.writeMieruConfig;

module.exports = router;
