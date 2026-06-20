'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

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

const PRIVATE_CIDRS = [
  '10.0.0.0/8',
  '127.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '::1/128',
  'fe80::/10',
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

const DEFAULT_ACL = {
  enabled: false,
  blockDomains: [],
  blockGeosite: [],
  blockGeoip: [],
  blockPrivateIPs: true,
  directCidrs: [...PRIVATE_CIDRS],
  directAll: true,
  updatedAt: null,
};

function loadAcl() {
  try {
    if (!fs.existsSync(ACL_FILE)) {
      fs.writeFileSync(ACL_FILE, JSON.stringify(DEFAULT_ACL, null, 2));
      return { ...DEFAULT_ACL };
    }
    const raw = JSON.parse(fs.readFileSync(ACL_FILE, 'utf8'));
    raw.enabled = !!raw.enabled;
    if (!Array.isArray(raw.blockDomains)) raw.blockDomains = [];
    if (!Array.isArray(raw.blockGeosite)) raw.blockGeosite = [];
    if (!Array.isArray(raw.blockGeoip)) raw.blockGeoip = [];
    if (raw.blockPrivateIPs === undefined) raw.blockPrivateIPs = true;
    if (!Array.isArray(raw.directCidrs)) raw.directCidrs = [];
    if (raw.directAll === undefined) raw.directAll = true;
    return raw;
  } catch {
    return { ...DEFAULT_ACL };
  }
}

function saveAcl(data) {
  fs.writeFileSync(ACL_FILE, JSON.stringify(data, null, 2));
}

function normalizeDomain(d) {
  return String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

function isValidCidr(cidr) {
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;
  const prefix = parseInt(parts[1], 10);
  if (isNaN(prefix)) return false;
  const addr = parts[0];
  if (addr.includes(':')) {
    if (prefix > 128) return false;
    return /^[:\da-fA-F]+$/.test(addr);
  }
  const octets = addr.split('.');
  if (octets.length !== 4 || prefix > 32) return false;
  return octets.every(o => {
    const n = parseInt(o, 10);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === o;
  });
}

function dedupCidrs(cidrs) {
  return [...new Set(cidrs)];
}

function generateAclContent(acl) {
  const lines = [];

  if (acl.blockPrivateIPs !== false) {
    PRIVATE_CIDRS.forEach(cidr => {
      lines.push(`reject(${cidr})`);
    });
  }

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

  const privateCidrSet = new Set(acl.blockPrivateIPs !== false ? PRIVATE_CIDRS : []);
  dedupCidrs(acl.directCidrs || []).forEach(cidr => {
    if (cidr && isValidCidr(cidr) && !privateCidrSet.has(cidr)) {
      lines.push(`direct(${cidr})`);
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

function downloadFile(url, destPath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 120000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        downloadFile(response.headers.location, destPath, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        file.close();
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function downloadGeoDatasets() {
  const baseDir = path.dirname(HY2_GEOIP_PATH);
  fs.mkdirSync(baseDir, { recursive: true });

  const geoipUrl = 'https://github.com/v2fly/geoip/releases/latest/download/geoip.dat';
  const geositeUrl = 'https://github.com/v2fly/domain-list-community/releases/latest/download/geosite.dat';

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
  isValidCidr, dedupCidrs, testPath,
  GEOSITE_CATEGORIES, GEOIP_COUNTRIES, PRIVATE_CIDRS,
  HY2_ACL_PATH, HY2_GEOIP_PATH, HY2_GEOSITE_PATH,
};
