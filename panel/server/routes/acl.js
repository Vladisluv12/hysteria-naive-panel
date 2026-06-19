'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth.js');
const aclController = require('../controllers/aclController.js');

const router = express.Router();

router.get('/acl', requireAuth, aclController.getAcl);
router.put('/acl', requireAuth, aclController.updateAcl);
router.get('/acl/geosite-list', requireAuth, aclController.getGeositeList);
router.get('/acl/geoip-list', requireAuth, aclController.getGeoipList);
router.post('/acl/geo-update', requireAuth, aclController.geoUpdate);

module.exports = router;
