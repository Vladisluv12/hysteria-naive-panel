'use strict';

const fs = require('fs');
const { loadConfig, saveConfig } = require('../services/storage.js');
const { buildCaddyContent } = require('../services/configBuilder.js');
const { isValidUsername, isValidPassword, isValidExpireDays, computeExpiresAt, isExpired, remainingSeconds } = require('../utils/validators.js');
const { reloadCaddy } = require('../services/systemAdapter.js');
const { AtomicFileTransaction, caddyValidator } = require('../services/atomicConfig.js');
const { extractCustomBlocks } = require('../caddyfile.js');

function testPath(systemPath) {
  if (process.env.TEST_CONFIG_DIR) {
    return require('path').join(process.env.TEST_CONFIG_DIR, require('path').basename(systemPath));
  }
  return systemPath;
}

function writeCaddyfile(cfg) {
  if (!cfg.stack.naive || !cfg.domain) return false;

  let customBlocks = '';
  try {
    const existingPath = testPath('/etc/caddy/Caddyfile');
    if (fs.existsSync(existingPath)) {
      const existing = fs.readFileSync(existingPath, 'utf8');
      customBlocks = extractCustomBlocks(existing, cfg.domain, cfg.panelDomain);
    }
  } catch (e) {
    console.warn('[writeCaddyfile] could not preserve custom blocks:', e.message);
  }

  const content = buildCaddyContent(cfg, customBlocks);
  const targetPath = testPath('/etc/caddy/Caddyfile');

  const tx = new AtomicFileTransaction(targetPath);
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

  const cfg = loadConfig();
  if (cfg.naiveUsers.find(u => u.username === username)) {
    return res.json({ success: false, message: 'Пользователь уже существует' });
  }
  const expiresAt = computeExpiresAt(expireDays);
  cfg.naiveUsers.push({ username, password, createdAt: new Date().toISOString(), expiresAt });
  saveConfig(cfg);

  if (cfg.installed && cfg.stack.naive) {
    writeCaddyfile(cfg);
    await reloadCaddy(process.env.TEST_MODE === '1', testPath('/etc/caddy/Caddyfile'));
  }

  res.json({
    success: true,
    link: cfg.domain ? `naive+https://${username}:${password}@${cfg.domain}:443` : null,
  });
}

async function deleteUser(req, res) {
  const { username } = req.params;
  const cfg = loadConfig();
  const before = cfg.naiveUsers.length;
  cfg.naiveUsers = cfg.naiveUsers.filter(u => u.username !== username);
  if (cfg.naiveUsers.length === before) return res.json({ success: false, message: 'Не найден' });
  saveConfig(cfg);
  if (cfg.installed && cfg.stack.naive) {
    writeCaddyfile(cfg);
    await reloadCaddy(process.env.TEST_MODE === '1', testPath('/etc/caddy/Caddyfile'));
  }
  res.json({ success: true });
}

async function updateUser(req, res) {
  const { username } = req.params;
  const { expireDays } = req.body || {};
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0' });

  const cfg = loadConfig();
  const user = cfg.naiveUsers.find(u => u.username === username);
  if (!user) return res.json({ success: false, message: 'Не найден' });
  user.expiresAt = computeExpiresAt(expireDays);
  saveConfig(cfg);

  if (cfg.installed && cfg.stack.naive) {
    writeCaddyfile(cfg);
    await reloadCaddy(process.env.TEST_MODE === '1', testPath('/etc/caddy/Caddyfile'));
  }
  res.json({ success: true, expiresAt: user.expiresAt });
}

module.exports = { listUsers, createUser, deleteUser, updateUser, writeCaddyfile };
