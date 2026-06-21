'use strict';

const { loadConfig } = require('../services/storageFactory.js');
const {
  loadAcl, saveAcl, writeAclFile, isValidCidr, dedupCidrs,
  downloadGeoDatasets, geoDatasetsExist,
  GEOSITE_CATEGORIES, GEOIP_COUNTRIES,
} = require('../services/aclBuilder.js');
const { restartHysteria, reloadNaive } = require('../services/systemAdapter.js');
const { writeHysteriaConfig } = require('./hysteriaController.js');
const { writeCaddyfile: writeNaiveCaddyfile } = require('./naiveController.js');

function getAcl(req, res) {
  const acl = loadAcl();
  res.json({
    ...acl,
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
  const { enabled, blockDomains, blockGeosite, blockGeoip, blockPrivateIPs, directCidrs, directAll } = req.body || {};
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
  if (typeof blockPrivateIPs === 'boolean') acl.blockPrivateIPs = blockPrivateIPs;
  if (Array.isArray(directCidrs)) {
    acl.directCidrs = dedupCidrs(
      directCidrs
        .map(s => String(s).trim())
        .filter(s => s.length > 0 && isValidCidr(s))
    );
  }
  if (typeof directAll === 'boolean') acl.directAll = directAll;

  acl.updatedAt = new Date().toISOString();
  saveAcl(acl);
  writeAclFile();

  const cfg = loadConfig();
  if (cfg.installed && cfg.stack.hy2) {
    try {
      writeHysteriaConfig(cfg);
      await restartHysteria();
    } catch (e) {
      console.error('[acl] restart failed after save:', e.message);
    }
  }
  if (cfg.installed && cfg.stack.naive) {
    try {
      writeNaiveCaddyfile(cfg);
      await reloadNaive(process.env.TEST_MODE === '1');
    } catch (e) {
      console.error('[acl] caddy reload failed after save:', e.message);
    }
  }

  res.json({ success: true, ...acl, geoSetsExist: geoDatasetsExist() });
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
      try {
        writeHysteriaConfig(cfg);
        await restartHysteria();
      } catch (e) {
        console.error('[acl] restart failed after geo update:', e.message);
      }
    }
    if (cfg.installed && cfg.stack.naive) {
      try {
        writeNaiveCaddyfile(cfg);
        await reloadNaive(process.env.TEST_MODE === '1');
      } catch (e) {
        console.error('[acl] caddy reload failed after geo update:', e.message);
      }
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
