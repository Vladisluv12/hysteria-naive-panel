'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadConfig, saveConfig } = require('../services/storage.js');
const { requireAuth } = require('../middleware/auth.js');
const { isValidUsername, isValidPassword, isValidExpireDays, computeExpiresAt, isExpired, remainingSeconds } = require('../utils/validators.js');
const { extractCustomBlocks } = require('../caddyfile.js');

const router = express.Router();
const TEST_MODE = process.env.TEST_MODE === '1';

function testPath(systemPath) {
  if (process.env.TEST_CONFIG_DIR) {
    return path.join(process.env.TEST_CONFIG_DIR, path.basename(systemPath));
  }
  return systemPath;
}

function writeCaddyfile(cfg) {
  if (!cfg.stack.naive || !cfg.domain) return false;
  const lines = (cfg.naiveUsers || [])
    .filter(u => !isExpired(u))
    .map(u => `    basic_auth ${u.username} ${u.password}`)
    .join('\n');

  const disableH3 = cfg.stack && cfg.stack.hy2;
  const globalBlock = disableH3
    ? `{\n  order forward_proxy before file_server\n  servers {\n    protocols h1 h2\n  }\n}`
    : `{\n  order forward_proxy before file_server\n}`;

  const masqueradeBlock = (cfg.masqueradeMode === 'mirror' && cfg.masqueradeUrl)
    ? `  reverse_proxy ${cfg.masqueradeUrl} {\n    header_up Host {upstream_hostport}\n    transport http {\n      tls_insecure_skip_verify\n    }\n  }`
    : `  file_server {\n    root /var/www/html\n  }`;

  let content = `${globalBlock}\n\n:443, ${cfg.domain} {\n  tls ${cfg.email}\n\n  forward_proxy {\n${lines || '    # no users yet'}\n    hide_ip\n    hide_via\n    probe_resistance\n  }\n\n${masqueradeBlock}\n}\n`;

  const internalPort = process.env.PORT || 3000;
  if (cfg.panelDomain && cfg.panelDomain !== cfg.domain && cfg.sshOnly !== 1) {
    const panelEmail = cfg.panelEmail || cfg.email;
    content += `\n${cfg.panelDomain} {\n  tls ${panelEmail}\n  encode gzip\n  reverse_proxy 127.0.0.1:${internalPort}\n}\n`;
  }

  try {
    const existingPath = testPath('/etc/caddy/Caddyfile');
    if (fs.existsSync(existingPath)) {
      const existing = fs.readFileSync(existingPath, 'utf8');
      const custom = extractCustomBlocks(existing, cfg.domain, cfg.panelDomain);
      if (custom) content += '\n\n' + custom;
    }
  } catch (e) {
    console.warn('[writeCaddyfile] could not preserve custom blocks:', e.message);
  }

  const targetPath = testPath('/etc/caddy/Caddyfile');
  const tmpPath = testPath('/etc/caddy/Caddyfile.new');
  const backupPath = testPath('/etc/caddy/Caddyfile.last');
  try {
    if (fs.existsSync(targetPath)) {
      try { fs.copyFileSync(targetPath, backupPath); } catch (e) { /* best-effort */ }
    }
    fs.writeFileSync(tmpPath, content, 'utf8');
    try {
      const { execSync } = require('child_process');
      execSync(`caddy validate --config ${tmpPath}`, { stdio: 'pipe', timeout: 10000 });
    } catch (validateErr) {
      const stderr = (validateErr && validateErr.stderr) ? validateErr.stderr.toString() : '';
      if (stderr && /error|adapt|parse/i.test(stderr)) {
        console.error('[writeCaddyfile] caddy validate failed:', stderr.slice(0, 500));
        try { fs.unlinkSync(tmpPath); } catch {}
        return false;
      }
    }
    fs.renameSync(tmpPath, targetPath);
    return true;
  } catch (e) {
    console.error('Caddyfile write error:', e.message);
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    try {
      if (fs.existsSync(backupPath) && !fs.existsSync(targetPath)) {
        fs.copyFileSync(backupPath, targetPath);
        console.warn('[writeCaddyfile] Rolled back to previous Caddyfile from backup.');
      }
    } catch (rb) { /* best-effort */ }
    return false;
  }
}

function reloadCaddy() {
  if (TEST_MODE) {
    return new Promise((resolve) => {
      const http = require('http');
      const configPath = testPath('/etc/caddy/Caddyfile');
      try {
        const configData = fs.readFileSync(configPath, 'utf8');
        const req = http.request({
          hostname: 'caddy-naive', port: 2019, path: '/load',
          method: 'POST',
          headers: { 'Content-Type': 'text/caddyfile', 'Content-Length': Buffer.byteLength(configData) },
        }, (res) => {
          let body = '';
          res.on('data', d => body += d);
          res.on('end', () => console.log('[test-mode] caddy reload:', res.statusCode, body.trim().slice(0,200)));
          resolve();
        });
        req.on('error', e => { console.log('[test-mode] caddy reload err:', e.message); resolve(); });
        req.write(configData);
        req.end();
      } catch (e) { console.log('[test-mode] caddy reload fail:', e.message); resolve(); }
    });
  }
  return new Promise((resolve) => {
    const p = spawn('bash', ['-c',
      'caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null'
    ]);
    p.on('close', () => resolve());
    p.on('error', () => resolve());
  });
}

function enrichUser(u) {
  return {
    ...u,
    expiresAt: u.expiresAt || null,
    remainingSec: remainingSeconds(u),
    expired: isExpired(u)
  };
}

router.get('/naive/users', requireAuth, (req, res) => {
  const cfg = loadConfig();
  res.json({ users: (cfg.naiveUsers || []).map(enrichUser) });
});

router.post('/naive/users', requireAuth, async (req, res) => {
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

  let reloaded = true;
  if (cfg.installed && cfg.stack.naive) {
    writeCaddyfile(cfg);
    await reloadCaddy();
  }

  res.json({
    success: true,
    link: cfg.domain ? `naive+https://${username}:${password}@${cfg.domain}:443` : null,
    reloaded
  });
});

router.delete('/naive/users/:username', requireAuth, async (req, res) => {
  const { username } = req.params;
  const cfg = loadConfig();
  const before = cfg.naiveUsers.length;
  cfg.naiveUsers = cfg.naiveUsers.filter(u => u.username !== username);
  if (cfg.naiveUsers.length === before) return res.json({ success: false, message: 'Не найден' });
  saveConfig(cfg);
  if (cfg.installed && cfg.stack.naive) {
    writeCaddyfile(cfg);
    await reloadCaddy();
  }
  res.json({ success: true });
});

router.patch('/naive/users/:username', requireAuth, async (req, res) => {
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
    await reloadCaddy();
  }
  res.json({ success: true, expiresAt: user.expiresAt });
});

router.writeCaddyfile = writeCaddyfile;
router.reloadCaddy = reloadCaddy;

module.exports = router;
