'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const DATA_DIR = (process.env.TEST_CONFIG_DIR)
  ? process.env.TEST_CONFIG_DIR
  : path.join(__dirname, '../../data');
const ACL_FILE = path.join(DATA_DIR, 'acl.json');

const REAL_DATA_DIR = path.join(__dirname, '../data');

function loadJsonList(filename, fallback) {
  const candidates = [
    path.join(DATA_DIR, filename),
    ...(DATA_DIR !== REAL_DATA_DIR ? [path.join(REAL_DATA_DIR, filename)] : []),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
  }
  return fallback;
}

const GEOSITE_CATEGORIES = loadJsonList('geosite_categories.json', []);
const GEOIP_COUNTRIES = loadJsonList('geoip_countries.json', []);

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

const MIERU_ACL_PATH = testPath('/etc/mita/acl.json');
const VLESS_GEOIP_PATH = testPath('/etc/xray/geoip.dat');
const VLESS_GEOSITE_PATH = testPath('/etc/xray/geosite.dat');

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

function readVarint(buf, pos) {
  let result = 0, shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [result, pos];
    shift += 7;
  }
  return [0, pos];
}

function readField(buf, pos) {
  if (pos >= buf.length) return null;
  const [tag, newPos] = readVarint(buf, pos);
  const fieldNumber = tag >> 3;
  const wireType = tag & 0x07;
  if (wireType === 2) {
    const [len, endPos] = readVarint(buf, newPos);
    return { fieldNumber, wireType, value: buf.slice(endPos, endPos + len), endPos: endPos + len };
  } else if (wireType === 0) {
    const [val, endPos] = readVarint(buf, newPos);
    return { fieldNumber, wireType, value: val, endPos };
  } else if (wireType === 5) {
    return { fieldNumber, wireType, endPos: newPos + 4 };
  } else if (wireType === 1) {
    return { fieldNumber, wireType, endPos: newPos + 8 };
  }
  return null;
}

function parseGeoSiteCodes(datPath) {
  const categories = [];
  try {
    if (!fs.existsSync(datPath)) return categories;
    const buf = fs.readFileSync(datPath);
    let pos = 0;
    while (pos < buf.length) {
      const field = readField(buf, pos);
      if (!field || field.endPos <= pos || field.endPos > buf.length) break;
      if (field.wireType === 2 && field.fieldNumber === 1) {
        const code = parseGeoSiteEntryCode(field.value);
        if (code) categories.push(code.toLowerCase());
      }
      pos = field.endPos;
    }
  } catch {}
  return [...new Set(categories)].sort();
}

function parseGeoSiteEntryCode(entryBuf) {
  let pos = 0;
  while (pos < entryBuf.length) {
    const field = readField(entryBuf, pos);
    if (!field || field.endPos <= pos || field.endPos > entryBuf.length) break;
    if (field.wireType === 2 && field.fieldNumber === 1) {
      return field.value.toString('utf8');
    }
    pos = field.endPos;
  }
  return null;
}

function parseGeoipEntryCode(entryBuf) {
  let pos = 0;
  while (pos < entryBuf.length) {
    const field = readField(entryBuf, pos);
    if (!field || field.endPos <= pos || field.endPos > entryBuf.length) break;
    if (field.wireType === 2 && field.fieldNumber === 1) {
      return field.value.toString('utf8');
    }
    pos = field.endPos;
  }
  return null;
}

function parseGeoipCodes(datPath) {
  const codes = [];
  try {
    if (!fs.existsSync(datPath)) return codes;
    const buf = fs.readFileSync(datPath);
    let pos = 0;
    while (pos < buf.length) {
      const field = readField(buf, pos);
      if (!field || field.endPos <= pos || field.endPos > buf.length) break;
      if (field.wireType === 2 && field.fieldNumber === 1) {
        const code = parseGeoipEntryCode(field.value);
        if (code && /^[A-Za-z]{2}$/.test(code)) codes.push(code.toLowerCase());
      }
      pos = field.endPos;
    }
  } catch {}
  return [...new Set(codes)].sort();
}

function copyToXrayDir(srcPath) {
  const dest = path.join('/usr/local/share/xray', path.basename(srcPath));
  try {
    execSync(`sudo cp "${srcPath}" "${dest}"`, { timeout: 10000, stdio: 'ignore' });
  } catch {
    try {
      fs.copyFileSync(srcPath, dest);
    } catch {}
  }
}

async function downloadGeoDatasets() {
  const hy2Dir = path.dirname(HY2_GEOIP_PATH);
  fs.mkdirSync(hy2Dir, { recursive: true });
  const xrayDir = path.dirname(VLESS_GEOIP_PATH);
  fs.mkdirSync(xrayDir, { recursive: true });

  const geoipUrl = 'https://github.com/v2fly/geoip/releases/latest/download/geoip.dat';
  const dlcUrl = 'https://github.com/v2fly/domain-list-community/releases/latest/download/dlc.dat';
  const xrayGeositeUrl = 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat';

  const results = { geoip: false, geosite: false, error: null };

  try {
    await downloadFile(geoipUrl, HY2_GEOIP_PATH);
    try { fs.copyFileSync(HY2_GEOIP_PATH, VLESS_GEOIP_PATH); } catch {}
    copyToXrayDir(VLESS_GEOIP_PATH);
    results.geoip = true;
  } catch (e) {
    results.error = `geoip.dat: ${e.message}`;
  }

  try {
    await downloadFile(dlcUrl, HY2_GEOSITE_PATH);
    results.geosite = true;
  } catch (e) {
    results.error = (results.error ? results.error + '; ' : '') + `dlc.dat (hy2): ${e.message}`;
  }

  try {
    await downloadFile(xrayGeositeUrl, VLESS_GEOSITE_PATH);
    copyToXrayDir(VLESS_GEOSITE_PATH);
  } catch (e) {
    results.error = (results.error ? results.error + '; ' : '') + `geosite.dat (xray): ${e.message}`;
  }

  const categories = parseGeoSiteCodes(VLESS_GEOSITE_PATH);
  if (categories.length > 0) {
    try {
      const dataDir = path.join(__dirname, '../data');
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'geosite_categories.json'), JSON.stringify(categories));
    } catch {}
  }

  const geoCountries = parseGeoipCodes(VLESS_GEOIP_PATH);
  if (geoCountries.length > 0) {
    try {
      const dataDir = path.join(__dirname, '../data');
      fs.writeFileSync(path.join(dataDir, 'geoip_countries.json'), JSON.stringify(geoCountries));
    } catch {}
  }

  return results;
}

function geoDatasetsExist() {
  return fs.existsSync(HY2_GEOIP_PATH) && fs.existsSync(HY2_GEOSITE_PATH) && fs.existsSync(VLESS_GEOSITE_PATH);
}

function generateNaiveAcl(acl) {
  const lines = [];

  if (acl.blockPrivateIPs === false) {
    lines.push('    bypass_private');
  }

  if (acl.enabled) {
    (acl.blockDomains || []).forEach(d => {
      const domain = normalizeDomain(d);
      if (domain && domain.length <= 253) {
        lines.push(`    deny *.${domain}`);
        lines.push(`    deny ${domain}`);
      }
    });

    (acl.blockGeosite || []).forEach(c => {
      if (c && GEOSITE_CATEGORIES.includes(c)) {
        lines.push(`    geosite ${c} deny`);
      }
    });

    (acl.blockGeoip || []).forEach(c => {
      if (c && GEOIP_COUNTRIES.includes(c)) {
        lines.push(`    geoip ${c.toUpperCase()} deny`);
      }
    });
  }

  dedupCidrs(acl.directCidrs || []).forEach(cidr => {
    if (cidr && isValidCidr(cidr)) {
      lines.push(`    allow ${cidr}`);
    }
  });

  if (acl.directAll !== false) {
    lines.push('    allow all');
  }

  if (lines.length === 0) return '';

  return '    acl {\n' + lines.join('\n') + '\n    }';
}

function generateVlessRoutingRules(acl) {
  if (!acl.enabled) return null;

  const rules = [];

  if (acl.blockPrivateIPs !== false) {
    PRIVATE_CIDRS.forEach(cidr => {
      rules.push({ type: 'field', ip: [cidr], outboundTag: 'blocked' });
    });
  }

  (acl.blockDomains || []).forEach(d => {
    const domain = normalizeDomain(d);
    if (domain && domain.length <= 253) {
      rules.push({ type: 'field', domain: [domain], outboundTag: 'blocked' });
    }
  });

  (acl.blockGeosite || []).forEach(c => {
    if (c && GEOSITE_CATEGORIES.includes(c)) {
      rules.push({ type: 'field', domain: [`geosite:${c}`], outboundTag: 'blocked' });
    }
  });

  (acl.blockGeoip || []).forEach(c => {
    if (c && GEOIP_COUNTRIES.includes(c)) {
      rules.push({ type: 'field', ip: [`geoip:${c}`], outboundTag: 'blocked' });
    }
  });

  return rules;
}

function generateMieruAclJson(acl) {
  if (!acl.enabled) return null;

  const rules = [];
  (acl.blockDomains || []).forEach(d => {
    const domain = normalizeDomain(d);
    if (domain && domain.length <= 253) {
      rules.push({ action: 'REJECT', criteria: { domainSuffix: domain } });
    }
  });

  (acl.blockGeosite || []).forEach(c => {
    if (c && GEOSITE_CATEGORIES.includes(c)) {
      rules.push({ action: 'REJECT', criteria: { domainSuffix: c } });
    }
  });

  return rules.length > 0 ? { rules } : null;
}

function writeMieruAclFile() {
  const acl = loadAcl();
  try {
    const dir = path.dirname(MIERU_ACL_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const aclJson = generateMieruAclJson(acl);
    if (aclJson) {
      fs.writeFileSync(MIERU_ACL_PATH, JSON.stringify(aclJson, null, 2), 'utf8');
    }
    return true;
  } catch (e) {
    console.error('[acl] mieru write failed:', e.message);
    return false;
  }
}

module.exports = {
  loadAcl, saveAcl, generateAclContent, generateNaiveAcl, writeAclFile,
  generateVlessRoutingRules, generateMieruAclJson, writeMieruAclFile,
  hasBlockRules, needsGeoDatasets, downloadGeoDatasets, geoDatasetsExist,
  isValidCidr, dedupCidrs, testPath,
  GEOSITE_CATEGORIES, GEOIP_COUNTRIES, PRIVATE_CIDRS,
  HY2_ACL_PATH, HY2_GEOIP_PATH, HY2_GEOSITE_PATH,
  MIERU_ACL_PATH, VLESS_GEOIP_PATH, VLESS_GEOSITE_PATH,
};
