'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { loadConfig } = require('../services/storageFactory.js');
const { updateConfig } = require('../services/atomicUpdate.js');
const { buildHysteriaConfigObject } = require('../services/configBuilder.js');
const { isValidUsername, isValidPassword, isValidExpireDays, computeExpiresAt, isExpired, remainingSeconds } = require('../utils/validators.js');
const { restartHysteria, findCertFile } = require('../services/systemAdapter.js');
const { AtomicFileTransaction, yamlSelfValidator } = require('../services/atomicConfig.js');
const { HY2_ACL_PATH, testPath } = require('../services/aclBuilder.js');

function writeHysteriaConfig(cfg) {
  if (!cfg.stack.hy2 || !cfg.domain) return false;

  const hyCfgPath = testPath('/etc/hysteria/config.yaml');
  let existing = null;
  try {
    const raw = fs.readFileSync(hyCfgPath, 'utf8');
    existing = yaml.load(raw);
  } catch {}

  const tlsBlock = findCertFile(cfg.domain);
  const configObj = buildHysteriaConfigObject(cfg, existing, tlsBlock);
  if (!configObj) return false;

  configObj.acl = { file: HY2_ACL_PATH };

  const newContent = yaml.dump(configObj, { lineWidth: 120, quotingType: '"' });
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

function listUsers(req, res) {
  const cfg = loadConfig();
  res.json({ users: (cfg.hy2Users || []).map(enrichUser) });
}

async function createUser(req, res) {
  const { username, password, expireDays } = req.body || {};
  if (!isValidUsername(username)) return res.json({ success: false, message: 'Логин 1-32 символа' });
  if (!isValidPassword(password)) return res.json({ success: false, message: 'Пароль 8-128 символов' });
  if (!isValidExpireDays(expireDays)) return res.json({ success: false, message: 'Срок: 1..3650 дней или 0 (бессрочно)' });

  if (loadConfig().hy2Users.find(u => u.username === username)) {
    return res.json({ success: false, message: 'Пользователь уже существует' });
  }
  const expiresAt = computeExpiresAt(expireDays);
  const cfg = updateConfig(c => {
    c.hy2Users.push({ username, password, createdAt: new Date().toISOString(), expiresAt });
  });

  if (cfg.installed && cfg.stack.hy2) {
    writeHysteriaConfig(cfg);
    await restartHysteria();
  }
  res.json({
    success: true,
    link: cfg.domain
      ? `hysteria2://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${cfg.domain}:${cfg.port}?sni=${cfg.domain}&insecure=0#${encodeURIComponent(username)}`
      : null
  });
}

async function deleteUser(req, res) {
  const { username } = req.params;
  const before = loadConfig().hy2Users.length;
  const cfg = updateConfig(c => {
    c.hy2Users = c.hy2Users.filter(u => u.username !== username);
  });
  if (cfg.hy2Users.length === before) return res.json({ success: false, message: 'Не найден' });
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

  const user = loadConfig().hy2Users.find(u => u.username === username);
  if (!user) return res.json({ success: false, message: 'Не найден' });

  const expiresAt = computeExpiresAt(expireDays);
  const cfg = updateConfig(c => {
    const u = c.hy2Users.find(u => u.username === username);
    if (u) u.expiresAt = expiresAt;
  });

  if (cfg.installed && cfg.stack.hy2) {
    writeHysteriaConfig(cfg);
    await restartHysteria();
  }
  res.json({ success: true, expiresAt });
}

module.exports = { listUsers, createUser, deleteUser, updateUser, writeHysteriaConfig };
