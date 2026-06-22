'use strict';

const fs = require('fs');
const { loadConfig } = require('../services/storageFactory.js');
const { updateConfig } = require('../services/atomicUpdate.js');
const { buildCaddyContent } = require('../services/configBuilder.js');
const { loadAcl } = require('../services/aclBuilder.js');
const { isValidUsername, isValidPassword, isValidExpireDays, computeExpiresAt, isExpired, remainingSeconds } = require('../utils/validators.js');
const { reloadNaive } = require('../services/systemAdapter.js');
const { AtomicFileTransaction, caddyValidator } = require('../services/atomicConfig.js');
const { extractCustomBlocks } = require('../caddyfile.js');

function testPath(systemPath) {
  if (process.env.TEST_CONFIG_DIR) {
    return require('path').join(process.env.TEST_CONFIG_DIR, require('path').basename(systemPath));
  }
  return systemPath;
}

const NAIVE_CADDYFILE_PATH = testPath('/etc/naive/Caddyfile');

function writeCaddyfile(cfg) {
  if (!cfg.stack.naive || !cfg.domain) return false;

  let customBlocks = '';
  try {
    if (fs.existsSync(NAIVE_CADDYFILE_PATH)) {
      const existing = fs.readFileSync(NAIVE_CADDYFILE_PATH, 'utf8');
      customBlocks = extractCustomBlocks(existing, cfg.domain, cfg.panelDomain);
    }
  } catch (e) {
    console.warn('[writeCaddyfile] could not preserve custom blocks:', e.message);
  }

  const acl = loadAcl();
  const content = buildCaddyContent(cfg, customBlocks, acl);

  const tx = new AtomicFileTransaction(NAIVE_CADDYFILE_PATH);
  return tx.execute(content, caddyValidator);
}

function enrichUser(u) {
  return {
    ...u,
    expiresAt: u.expiresAt || null,
    remainingSec: remainingSeconds(u),
    expired: isExpired(u)
  };
}

function listUsers(req, res) {
  const cfg = loadConfig();
  res.json({ users: (cfg.naiveUsers || []).map(enrichUser) });
}

async function createUser(req, res) {
  const { username, password, expireDays } = req.body || {};
  if (!isValidUsername(username)) return res.json({ success: false, message: 'Логин 1-32 симв. (A-Z, a-z, 0-9, . _ -)' });
  if (!isValidPassword(password)) return res.json({ success: false, message: 'Пароль 8-128 символов (без пробелов)' });
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0 (бессрочно)' });

  const existing = loadConfig().naiveUsers.find(u => u.username === username);
  if (existing) return res.json({ success: false, message: 'Пользователь уже существует' });

  const expiresAt = computeExpiresAt(expireDays);
  const cfg = updateConfig(c => {
    c.naiveUsers.push({ username, password, createdAt: new Date().toISOString(), expiresAt });
  });

  if (cfg.installed && cfg.stack.naive) {
    writeCaddyfile(cfg);
    await reloadNaive(process.env.TEST_MODE === '1');
  }

  res.json({
    success: true,
    link: cfg.domain ? `naive+https://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${cfg.domain}:${cfg.port}#${encodeURIComponent(username)}` : null,
  });
}

async function deleteUser(req, res) {
  const { username } = req.params;
  const before = loadConfig().naiveUsers.length;
  const cfg = updateConfig(c => {
    c.naiveUsers = c.naiveUsers.filter(u => u.username !== username);
  });
  if (cfg.naiveUsers.length === before) return res.json({ success: false, message: 'Не найден' });
  if (cfg.installed && cfg.stack.naive) {
    writeCaddyfile(cfg);
    await reloadNaive(process.env.TEST_MODE === '1');
  }
  res.json({ success: true });
}

async function updateUser(req, res) {
  const { username } = req.params;
  const { expireDays } = req.body || {};
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0' });

  const user = loadConfig().naiveUsers.find(u => u.username === username);
  if (!user) return res.json({ success: false, message: 'Не найден' });

  const expiresAt = computeExpiresAt(expireDays);
  const cfg = updateConfig(c => {
    const u = c.naiveUsers.find(u => u.username === username);
    if (u) u.expiresAt = expiresAt;
  });

  if (cfg.installed && cfg.stack.naive) {
    writeCaddyfile(cfg);
    await reloadNaive(process.env.TEST_MODE === '1');
  }
  res.json({ success: true, expiresAt });
}

module.exports = { listUsers, createUser, deleteUser, updateUser, writeCaddyfile };
