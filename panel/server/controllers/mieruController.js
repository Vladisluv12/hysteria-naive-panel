'use strict';

const fs = require('fs');
const { loadConfig } = require('../services/storageFactory.js');
const { updateConfig } = require('../services/atomicUpdate.js');
const { buildMieruConfigObject } = require('../services/configBuilder.js');
const { isValidUsername, isValidPassword, isValidExpireDays, computeExpiresAt, isExpired, remainingSeconds } = require('../utils/validators.js');
const { restartMieru, runCommand } = require('../services/systemAdapter.js');
const { AtomicFileTransaction } = require('../services/atomicConfig.js');
const { enqueue } = require('../services/syncService.js');

function testPath(systemPath) {
  if (process.env.TEST_CONFIG_DIR) {
    return require('path').join(process.env.TEST_CONFIG_DIR, require('path').basename(systemPath));
  }
  return systemPath;
}

const MIERU_CONFIG_PATH = testPath('/etc/mita/server.json');

let _tpCache = '';

async function getTrafficPattern() {
  if (_tpCache) return _tpCache;
  const { code, stdout } = await runCommand('mita', ['export', 'traffic-pattern']);
  if (code === 0) _tpCache = stdout.trim();
  return _tpCache;
}

function clearTPCache() { _tpCache = ''; }

function writeMieruConfig(cfg) {
  if (!cfg || !cfg.stack || !cfg.stack.mieru || !cfg.domain) return false;

  const configObj = buildMieruConfigObject(cfg);
  if (!configObj) return false;

  const newContent = JSON.stringify(configObj, null, 2);
  const tx = new AtomicFileTransaction(MIERU_CONFIG_PATH);
  return tx.execute(newContent, () => true);
}

function enrichUser(u) {
  return {
    ...u,
    nickname: u.nickname || '',
    expiresAt: u.expiresAt || null,
    remainingSec: remainingSeconds(u),
    expired: isExpired(u)
  };
}

function listUsers(req, res) {
  const cfg = loadConfig();
  res.json({ users: (cfg.mieruUsers || []).map(enrichUser) });
}

async function createUser(req, res) {
  const { username, password, expireDays, nickname } = req.body || {};
  if (!isValidUsername(username)) return res.json({ success: false, message: 'Логин 1-32 символа' });
  if (!isValidPassword(password)) return res.json({ success: false, message: 'Пароль 8-128 символов' });
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0 (бессрочно)' });

  if (loadConfig().mieruUsers.find(u => u.username === username)) {
    return res.json({ success: false, message: 'Пользователь уже существует' });
  }
  const expiresAt = computeExpiresAt(expireDays);
  const cfg = updateConfig(c => {
    c.mieruUsers.push({ username, password, nickname: nickname || '', createdAt: new Date().toISOString(), expiresAt });
  });

  const linkPort = cfg.mieruPort || cfg.port;
  let link = cfg.domain
    ? `mierus://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${cfg.domain}?profile=default&port=${linkPort}&protocol=TCP&multiplexing=MULTIPLEXING_HIGH`
    : null;
  if (link && cfg.installed) {
    const tp = await getTrafficPattern();
    if (tp) link += `&traffic-pattern=${encodeURIComponent(tp)}`;
  }
  res.json({ success: true, link });
  if (cfg.installed && cfg.stack.mieru) enqueue('mieru', 'create', username);
}

async function getUserLink(req, res) {
  const { username } = req.params;
  const cfg = loadConfig();
  const user = (cfg.mieruUsers || []).find(u => u.username === username);
  if (!user) return res.json({ success: false, message: 'Не найден' });

  const linkPort = cfg.mieruPort || cfg.port;
  let link = cfg.domain
    ? `mierus://${encodeURIComponent(user.username)}:${encodeURIComponent(user.password)}@${cfg.domain}?profile=default&port=${linkPort}&protocol=TCP&multiplexing=MULTIPLEXING_HIGH`
    : null;
  if (link && cfg.installed) {
    const tp = await getTrafficPattern();
    if (tp) link += `&traffic-pattern=${encodeURIComponent(tp)}`;
  }
  res.json({ success: true, link });
}

async function deleteUser(req, res) {
  const { username } = req.params;
  const before = loadConfig().mieruUsers.length;
  const cfg = updateConfig(c => {
    c.mieruUsers = c.mieruUsers.filter(u => u.username !== username);
  });
  if (cfg.mieruUsers.length === before) return res.json({ success: false, message: 'Не найден' });
  if (cfg.installed && cfg.stack.mieru) enqueue('mieru', 'delete', username);
  res.json({ success: true });
}

async function updateUser(req, res) {
  const { username } = req.params;
  const { expireDays, nickname } = req.body || {};
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0' });

  const user = loadConfig().mieruUsers.find(u => u.username === username);
  if (!user) return res.json({ success: false, message: 'Не найден' });

  const expiresAt = computeExpiresAt(expireDays);
  const cfg = updateConfig(c => {
    const u = c.mieruUsers.find(u => u.username === username);
    if (u) {
      u.expiresAt = expiresAt;
      if (nickname !== undefined) u.nickname = nickname;
    }
  });

  if (cfg.installed && cfg.stack.mieru) enqueue('mieru', 'update', username);
  res.json({ success: true, expiresAt });
}

module.exports = { listUsers, createUser, getUserLink, deleteUser, updateUser, writeMieruConfig };
