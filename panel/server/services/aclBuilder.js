'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { loadConfig } = require('./storageFactory.js');

const DATA_DIR = (process.env.TEST_CONFIG_DIR)
  ? process.env.TEST_CONFIG_DIR
  : path.join(__dirname, '../../data');
const ACL_FILE = path.join(DATA_DIR, 'acl.json');

const GEOSITE_CATEGORIES = [
  'netflix', 'youtube', 'twitter', 'facebook', 'instagram', 'tiktok',
  'spotify', 'discord', 'telegram', 'whatsapp', 'amazon', 'microsoft',
  'apple', 'google', 'cloudflare', 'openai', 'category-games',
];

const GEOIP_COUNTRIES = [
  'cn', 'ru', 'ir', 'kp', 'cu', 'sy', 'by', 'af', 've', 'mm',
];

function testPath(systemPath) {
  if (process.env.TEST_CONFIG_DIR) {
    return path.join(process.env.TEST_CONFIG_DIR, path.basename(systemPath));
  }
  return systemPath;
}

const HY2_ACL_PATH = testPath('/etc/hysteria/acl.rules');
const HY2_GEOIP_PATH = testPath('/etc/hysteria/geoip.dat');
const HY2_GEOSITE_PATH = testPath('/etc/hysteria/geosite.dat');

function loadAcl() {
  try {
    if (!fs.existsSync(ACL_FILE)) {
      const d = { enabled: false, blockDomains: [], blockGeosite: [], blockGeoip: [], directAll: true, updatedAt: null };
      fs.writeFileSync(ACL_FILE, JSON.stringify(d, null, 2));
      return d;
    }
    const raw = JSON.parse(fs.readFileSync(ACL_FILE, 'utf8'));
    raw.enabled = !!raw.enabled;
    if (!Array.isArray(raw.blockDomains)) raw.blockDomains = [];
    if (!Array.isArray(raw.blockGeosite)) raw.blockGeosite = [];
    if (!Array.isArray(raw.blockGeoip)) raw.blockGeoip = [];
    if (raw.directAll === undefined) raw.directAll = true;
    return raw;
  } catch {
    return { enabled: false, blockDomains: [], blockGeosite: [], blockGeoip: [], directAll: true, updatedAt: null };
  }
}

function saveAcl(data) {
  fs.writeFileSync(ACL_FILE, JSON.stringify(data, null, 2));
}

function loadBypass() {
  const BYPASS_FILE = path.join(DATA_DIR, 'bypass.json');
  try {
    if (!fs.existsSync(BYPASS_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(BYPASS_FILE, 'utf8'));
    if (raw.enabled && Array.isArray(raw.cidrs)) return raw.cidrs;
    return [];
  } catch {
    return [];
  }
}

function normalizeDomain(d) {
  return String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

function generateAclContent(acl) {
  const lines = [];

  if (acl.enabled) {
    (acl.blockDomains || []).forEach(d => {
      const domain = normalizeDomain(d);
      if (domain && domain.length <= 253) {
        lines.push(`reject(suffix:${domain})`);
      }
    });

    (acl.blockGeosite || []).forEach(c => {
      if (c && GEOSITE_CATEGORIES.includes(c)) {
        lines.push(`reject(geosite:${c})`);
      }
    });

    (acl.blockGeoip || []).forEach(c => {
      if (c && GEOIP_COUNTRIES.includes(c)) {
        lines.push(`reject(geoip:${c})`);
      }
    });
  }

  const bypassCidrs = loadBypass();
  bypassCidrs.forEach(c => {
    if (c && /^[0-9a-fA-F:.\/]+$/.test(c)) {
      lines.push(`direct(${c})`);
    }
  });

  if (acl.directAll !== false) {
    lines.push('direct(all)');
  }

  return lines.join('\n') + '\n';
}

function writeAclFile() {
  const acl = loadAcl();
  try {
    fs.mkdirSync(path.dirname(HY2_ACL_PATH), { recursive: true });
    fs.writeFileSync(HY2_ACL_PATH, generateAclContent(acl), 'utf8');
    return true;
  } catch (e) {
    console.error('[acl] write failed:', e.message);
    return false;
  }
}

function hasBlockRules() {
  const acl = loadAcl();
  if (!acl.enabled) return false;
  if ((acl.blockDomains || []).length > 0) return true;
  if ((acl.blockGeosite || []).length > 0) return true;
  if ((acl.blockGeoip || []).length > 0) return true;
  return false;
}

function needsGeoDatasets() {
  const acl = loadAcl();
  if (!acl.enabled) return false;
  return (acl.blockGeosite || []).length > 0 || (acl.blockGeoip || []).length > 0;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { timeout: 120000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(destPath); } catch {}
      reject(err);
    });
  });
}

async function downloadGeoDatasets() {
  const baseDir = path.dirname(HY2_GEOIP_PATH);
  fs.mkdirSync(baseDir, { recursive: true });

  const geoipUrl = 'https://github.com/v2fly/geoip/releases/latest/download/geoip.dat';
  const geositeUrl = 'https://github.com/v2fly/geoip/releases/latest/download/geosite.dat';

  const results = { geoip: false, geosite: false, error: null };
  try {
    await downloadFile(geoipUrl, HY2_GEOIP_PATH);
    results.geoip = true;
  } catch (e) {
    results.error = `geoip.dat: ${e.message}`;
  }
  try {
    await downloadFile(geositeUrl, HY2_GEOSITE_PATH);
    results.geosite = true;
  } catch (e) {
    results.error = (results.error ? results.error + '; ' : '') + `geosite.dat: ${e.message}`;
  }
  return results;
}

function geoDatasetsExist() {
  return fs.existsSync(HY2_GEOIP_PATH) && fs.existsSync(HY2_GEOSITE_PATH);
}

module.exports = {
  loadAcl, saveAcl, generateAclContent, writeAclFile,
  hasBlockRules, needsGeoDatasets, downloadGeoDatasets, geoDatasetsExist,
  GEOSITE_CATEGORIES, GEOIP_COUNTRIES,
  HY2_ACL_PATH, HY2_GEOIP_PATH, HY2_GEOSITE_PATH,
};
