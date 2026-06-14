'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');
const { loadConfig, saveConfig } = require('../services/storage.js');
const { isValidUsername, isValidPassword, isValidExpireDays, computeExpiresAt, isExpired, remainingSeconds } = require('../utils/validators.js');
const { restartHysteria, findCertFile } = require('../services/systemAdapter.js');
const { AtomicFileTransaction, yamlSelfValidator } = require('../services/atomicConfig.js');

const DATA_DIR = path.join(__dirname, '../../data');
const BYPASS_FILE = path.join(DATA_DIR, 'bypass.json');

function testPath(systemPath) {
  if (process.env.TEST_CONFIG_DIR) {
    return path.join(process.env.TEST_CONFIG_DIR, path.basename(systemPath));
  }
  return systemPath;
}

const HY2_ACL_PATH = testPath('/etc/hysteria/bypass-ru.acl');

function loadBypass() {
  try {
    if (!fs.existsSync(BYPASS_FILE)) {
      const d = { enabled: false, cidrs: [], source: '', updatedAt: null };
      fs.writeFileSync(BYPASS_FILE, JSON.stringify(d, null, 2));
      return d;
    }
    const raw = JSON.parse(fs.readFileSync(BYPASS_FILE, 'utf8'));
    if (!Array.isArray(raw.cidrs)) raw.cidrs = [];
    return raw;
  } catch {
    return { enabled: false, cidrs: [], source: '', updatedAt: null };
  }
}

function saveBypass(b) {
  fs.writeFileSync(BYPASS_FILE, JSON.stringify(b, null, 2));
}

function applyBypassAcl(base) {
  const b = loadBypass();
  if (!b.enabled || !Array.isArray(b.cidrs) || b.cidrs.length === 0) {
    if (base.acl && base.acl.file === HY2_ACL_PATH) delete base.acl;
    try { if (fs.existsSync(HY2_ACL_PATH)) fs.unlinkSync(HY2_ACL_PATH); } catch {}
    return;
  }
  try {
    fs.mkdirSync(path.dirname(HY2_ACL_PATH), { recursive: true });
    const lines = b.cidrs
      .filter(c => /^[0-9a-fA-F:.\/]+$/.test(c))
      .map(c => `direct(${c})`)
      .join('\n');
    fs.writeFileSync(HY2_ACL_PATH, lines + '\n', 'utf8');
    base.acl = { file: HY2_ACL_PATH };
  } catch (e) {
    console.error('[bypass] write acl failed:', e.message);
  }
}

function writeHysteriaConfig(cfg) {
  if (!cfg.stack.hy2 || !cfg.domain) return false;

  const userpass = {};
  (cfg.hy2Users || []).forEach(u => {
    if (u.username && u.password && !isExpired(u)) userpass[u.username] = u.password;
  });
  if (Object.keys(userpass).length === 0) {
    userpass.default = crypto.randomBytes(16).toString('base64url');
  }

  const hyCfgPath = testPath('/etc/hysteria/config.yaml');
  let base = null;

  try {
    const raw = fs.readFileSync(hyCfgPath, 'utf8');
    base = yaml.load(raw);
  } catch {
    base = null;
  }

  if (base && typeof base === 'object') {
    if (!base.auth) base.auth = { type: 'userpass' };
    base.auth.type = 'userpass';
    base.auth.userpass = userpass;

    if (cfg.masqueradeMode === 'mirror' && cfg.masqueradeUrl) {
      base.masquerade = { type: 'proxy', proxy: { url: cfg.masqueradeUrl, rewriteHost: true } };
    } else if (cfg.masqueradeMode === 'local') {
      base.masquerade = { type: 'file', file: { dir: '/var/www/html' } };
    }
    applyBypassAcl(base);
  } else {
    console.warn('[writeHysteriaConfig] /etc/hysteria/config.yaml not found — creating minimal config.');
    const tlsBlock = findCertFile(cfg.domain);
    if (!tlsBlock) {
      console.warn('[writeHysteriaConfig] No Caddy cert found. Hysteria2 will NOT start until TLS is configured manually.');
    }

    const masqueradeBlock = (cfg.masqueradeMode === 'mirror' && cfg.masqueradeUrl)
      ? { type: 'proxy', proxy: { url: cfg.masqueradeUrl, rewriteHost: true } }
      : { type: 'file', file: { dir: '/var/www/html' } };

    base = {
      listen: ':443',
      auth: { type: 'userpass', userpass },
      masquerade: masqueradeBlock,
      ignoreClientBandwidth: true,
      quic: {
        initStreamReceiveWindow: 8388608, maxStreamReceiveWindow: 8388608,
        initConnReceiveWindow: 20971520, maxConnReceiveWindow: 20971520,
        maxIdleTimeout: '30s', keepAlivePeriod: '10s', disablePathMTUDiscovery: false
      }
    };
    if (tlsBlock) base.tls = tlsBlock;
    applyBypassAcl(base);
  }

  const newContent = yaml.dump(base, { lineWidth: 120, quotingType: '"' });
  const tx = new AtomicFileTransaction(hyCfgPath);
  return tx.execute(newContent, (tmpPath) => yamlSelfValidator(fs.readFileSync(tmpPath, 'utf8')));
}

function enrichUser(u) {
  return {
    ...u,
    expiresAt: u.expiresAt || null,
    remainingSec: remainingSeconds(u),
    expired: isExpired(u)
  };
}

function getBypass(req, res) {
  const b = loadBypass();
  res.json({
    enabled: !!b.enabled, count: (b.cidrs || []).length,
    source: b.source || '', updatedAt: b.updatedAt || null,
    preview: (b.cidrs || []).slice(0, 50)
  });
}

async function updateBypass(req, res) {
  const { cidrs, json, enabled, source } = req.body || {};
  const b = loadBypass();

  let newList = null;
  if (Array.isArray(cidrs)) {
    newList = cidrs;
  } else if (json && typeof json === 'object') {
    const set = new Set();
    Object.values(json).forEach(arr => {
      if (Array.isArray(arr)) arr.forEach(c => { if (typeof c === 'string') set.add(c.trim()); });
    });
    newList = Array.from(set);
  }

  if (newList) {
    const re = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$|^[0-9a-fA-F:]+\/\d{1,3}$/;
    b.cidrs = newList.map(s => String(s).trim()).filter(s => re.test(s));
    b.source = typeof source === 'string' ? source.slice(0, 128) : b.source;
    b.updatedAt = new Date().toISOString();
  }
  if (typeof enabled === 'boolean') b.enabled = enabled;
  saveBypass(b);

  const cfg = loadConfig();
  if (cfg.installed && cfg.stack.hy2) {
    writeHysteriaConfig(cfg);
    await restartHysteria();
  }
  res.json({ success: true, enabled: !!b.enabled, count: b.cidrs.length });
}

async function clearBypass(req, res) {
  saveBypass({ enabled: false, cidrs: [], source: '', updatedAt: null });
  const cfg = loadConfig();
  if (cfg.installed && cfg.stack.hy2) {
    writeHysteriaConfig(cfg);
    await restartHysteria();
  }
  res.json({ success: true });
}

function listUsers(req, res) {
  const cfg = loadConfig();
  res.json({ users: (cfg.hy2Users || []).map(enrichUser) });
}

async function createUser(req, res) {
  const { username, password, expireDays } = req.body || {};
  if (!isValidUsername(username)) return res.json({ success: false, message: 'Логин 1-32 символа' });
  if (!isValidPassword(password)) return res.json({ success: false, message: 'Пароль 8-128 символов' });
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0 (бессрочно)' });

  const cfg = loadConfig();
  if (cfg.hy2Users.find(u => u.username === username)) {
    return res.json({ success: false, message: 'Пользователь уже существует' });
  }
  const expiresAt = computeExpiresAt(expireDays);
  cfg.hy2Users.push({ username, password, createdAt: new Date().toISOString(), expiresAt });
  saveConfig(cfg);

  if (cfg.installed && cfg.stack.hy2) {
    writeHysteriaConfig(cfg);
    await restartHysteria();
  }
  res.json({
    success: true,
    link: cfg.domain
      ? `hysteria2://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${cfg.domain}:443?sni=${cfg.domain}&insecure=0#${encodeURIComponent(username)}`
      : null
  });
}

async function deleteUser(req, res) {
  const { username } = req.params;
  const cfg = loadConfig();
  const before = cfg.hy2Users.length;
  cfg.hy2Users = cfg.hy2Users.filter(u => u.username !== username);
  if (cfg.hy2Users.length === before) return res.json({ success: false, message: 'Не найден' });
  saveConfig(cfg);
  if (cfg.installed && cfg.stack.hy2) {
    writeHysteriaConfig(cfg);
    await restartHysteria();
  }
  res.json({ success: true });
}

async function updateUser(req, res) {
  const { username } = req.params;
  const { expireDays } = req.body || {};
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0' });

  const cfg = loadConfig();
  const user = cfg.hy2Users.find(u => u.username === username);
  if (!user) return res.json({ success: false, message: 'Не найден' });
  user.expiresAt = computeExpiresAt(expireDays);
  saveConfig(cfg);

  if (cfg.installed && cfg.stack.hy2) {
    writeHysteriaConfig(cfg);
    await restartHysteria();
  }
  res.json({ success: true, expiresAt: user.expiresAt });
}

module.exports = { getBypass, updateBypass, clearBypass, listUsers, createUser, deleteUser, updateUser, writeHysteriaConfig };
