'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { loadConfig } = require('../services/storageFactory.js');
const { updateConfig } = require('../services/atomicUpdate.js');
const { buildVlessConfigObject } = require('../services/configBuilder.js');
const { isValidUsername, isValidPassword, isValidExpireDays, computeExpiresAt, isExpired, remainingSeconds } = require('../utils/validators.js');
const { restartVless } = require('../services/systemAdapter.js');
const { AtomicFileTransaction } = require('../services/atomicConfig.js');
const { enqueue } = require('../services/syncService.js');

function testPath(systemPath) {
  if (process.env.TEST_CONFIG_DIR) {
    return require('path').join(process.env.TEST_CONFIG_DIR, require('path').basename(systemPath));
  }
  return systemPath;
}

const VLESS_CONFIG_PATH = testPath('/etc/xray/config.json');

function generateUuid() {
  return crypto.randomUUID();
}

function writeVlessConfig(cfg) {
  if (!cfg || !cfg.stack || !cfg.stack.vless || !cfg.domain) return false;

  const configObj = buildVlessConfigObject(cfg);
  if (!configObj) return false;

  const newContent = JSON.stringify(configObj, null, 2);
  const tx = new AtomicFileTransaction(VLESS_CONFIG_PATH);
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
  res.json({ users: (cfg.vlessUsers || []).map(enrichUser) });
}

async function createUser(req, res) {
  const { username, password, expireDays, nickname } = req.body || {};
  if (!isValidUsername(username)) return res.json({ success: false, message: 'Логин 1-32 символа' });
  if (!isValidPassword(password)) return res.json({ success: false, message: 'Пароль 8-128 символов' });
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0 (бессрочно)' });

  if (loadConfig().vlessUsers.find(u => u.username === username)) {
    return res.json({ success: false, message: 'Пользователь уже существует' });
  }
  const expiresAt = computeExpiresAt(expireDays);
  const uuid = generateUuid();
  const cfg = updateConfig(c => {
    c.vlessUsers.push({ username, password, uuid, nickname: nickname || '', createdAt: new Date().toISOString(), expiresAt });
  });

  const linkPort = cfg.vlessPort || cfg.port;
  const linkUsername = encodeURIComponent(nickname || username);
  const pbk = cfg.vlessRealityPublicKey || '';
  const encryption = encodeURIComponent(cfg.vlessEncryption || 'none');
  res.json({
    success: true,
    link: cfg.domain && pbk
      ? `vless://${uuid}@${cfg.domain}:${linkPort}?encryption=${encryption}&security=reality&sni=${cfg.domain}&fp=chrome&type=xhttp&path=/xhttp&mode=packet-up&noGRPCHeader=true&xmux.maxConcurrency=32-64&pbk=${pbk}#${linkUsername}`
      : null
  });
  if (cfg.installed && cfg.stack.vless) enqueue('vless', 'create', username);
}

function getUserLink(req, res) {
  const { username } = req.params;
  const cfg = loadConfig();
  const user = (cfg.vlessUsers || []).find(u => u.username === username);
  if (!user) return res.json({ success: false, message: 'Не найден' });

  const linkPort = cfg.vlessPort || cfg.port;
  const linkUsername = encodeURIComponent(user.nickname || user.username);
  const pbk = cfg.vlessRealityPublicKey || '';
  const encryption = encodeURIComponent(cfg.vlessEncryption || 'none');

  res.json({
    success: true,
    link: cfg.domain && pbk
      ? `vless://${user.uuid}@${cfg.domain}:${linkPort}?encryption=${encryption}&security=reality&sni=${cfg.domain}&fp=chrome&type=xhttp&path=/xhttp&mode=packet-up&noGRPCHeader=true&xmux.maxConcurrency=32-64&pbk=${pbk}#${linkUsername}`
      : null,
  });
}

async function deleteUser(req, res) {
  const { username } = req.params;
  const before = loadConfig().vlessUsers.length;
  const cfg = updateConfig(c => {
    c.vlessUsers = c.vlessUsers.filter(u => u.username !== username);
  });
  if (cfg.vlessUsers.length === before) return res.json({ success: false, message: 'Не найден' });
  if (cfg.installed && cfg.stack.vless) enqueue('vless', 'delete', username);
  res.json({ success: true });
}

async function updateUser(req, res) {
  const { username } = req.params;
  const { expireDays, nickname } = req.body || {};
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0' });

  const user = loadConfig().vlessUsers.find(u => u.username === username);
  if (!user) return res.json({ success: false, message: 'Не найден' });

  const expiresAt = computeExpiresAt(expireDays);
  const cfg = updateConfig(c => {
    const u = c.vlessUsers.find(u => u.username === username);
    if (u) {
      u.expiresAt = expiresAt;
      if (nickname !== undefined) u.nickname = nickname;
    }
  });

  if (cfg.installed && cfg.stack.vless) enqueue('vless', 'update', username);
  res.json({ success: true, expiresAt });
}

module.exports = { listUsers, createUser, getUserLink, deleteUser, updateUser, writeVlessConfig };
