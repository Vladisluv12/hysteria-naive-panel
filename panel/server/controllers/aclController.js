'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../services/storageFactory.js');
const {
  loadAcl, saveAcl, writeAclFile,
  downloadGeoDatasets, geoDatasetsExist,
  GEOSITE_CATEGORIES, GEOIP_COUNTRIES,
} = require('../services/aclBuilder.js');
const { restartHysteria } = require('../services/systemAdapter.js');

function getAcl(req, res) {
  const acl = loadAcl();
  const bypassCidrs = (() => {
    const BYPASS_FILE = path.join(__dirname, '../../data', 'bypass.json');
    try {
      if (!fs.existsSync(BYPASS_FILE)) return [];
      const raw = JSON.parse(fs.readFileSync(BYPASS_FILE, 'utf8'));
      return (raw.enabled && Array.isArray(raw.cidrs)) ? raw.cidrs : [];
    } catch { return []; }
  })();

  res.json({
    ...acl,
    bypassCidrs,
    geoSetsExist: geoDatasetsExist(),
  });
}

function getGeositeList(req, res) {
  res.json({ categories: GEOSITE_CATEGORIES });
}

function getGeoipList(req, res) {
  res.json({ countries: GEOIP_COUNTRIES });
}

async function updateAcl(req, res) {
  const { enabled, blockDomains, blockGeosite, blockGeoip, directAll } = req.body || {};
  const acl = loadAcl();

  if (typeof enabled === 'boolean') acl.enabled = enabled;
  if (Array.isArray(blockDomains)) {
    acl.blockDomains = blockDomains
      .map(d => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
      .filter(d => d.length > 0 && d.length <= 253 && !d.includes(':') && !d.includes('/'));
  }
  if (Array.isArray(blockGeosite)) {
    acl.blockGeosite = blockGeosite.filter(c => GEOSITE_CATEGORIES.includes(c));
  }
  if (Array.isArray(blockGeoip)) {
    acl.blockGeoip = blockGeoip.filter(c => GEOIP_COUNTRIES.includes(c));
  }
  if (typeof directAll === 'boolean') acl.directAll = directAll;

  acl.updatedAt = new Date().toISOString();
  saveAcl(acl);
  writeAclFile();

  const cfg = loadConfig();
  if (cfg.installed && cfg.stack.hy2) {
    const { writeHysteriaConfig } = require('./hysteriaController.js');
    writeHysteriaConfig(cfg);
    await restartHysteria();
  }

  const bypassCidrs = (() => {
    const BYPASS_FILE = path.join(__dirname, '../../data', 'bypass.json');
    try {
      if (!fs.existsSync(BYPASS_FILE)) return [];
      const raw = JSON.parse(fs.readFileSync(BYPASS_FILE, 'utf8'));
      return (raw.enabled && Array.isArray(raw.cidrs)) ? raw.cidrs : [];
    } catch { return []; }
  })();

  res.json({ success: true, ...acl, bypassCidrs, geoSetsExist: geoDatasetsExist() });
}

async function geoUpdate(req, res) {
  try {
    const result = await downloadGeoDatasets();
    if (result.error) {
      return res.status(500).json({ success: false, error: result.error, ...result });
    }

    writeAclFile();
    const cfg = loadConfig();
    if (cfg.installed && cfg.stack.hy2) {
      const { writeHysteriaConfig } = require('./hysteriaController.js');
      writeHysteriaConfig(cfg);
      await restartHysteria();
    }

    res.json({ success: true, geoip: result.geoip, geosite: result.geosite });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}

module.exports = {
  getAcl, updateAcl, geoUpdate,
  getGeositeList, getGeoipList,
};
