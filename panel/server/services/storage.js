'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const TEST_CONFIG_DIR = process.env.TEST_CONFIG_DIR || '';
function testPath(systemPath) {
  if (TEST_CONFIG_DIR) {
    return path.join(TEST_CONFIG_DIR, path.basename(systemPath));
  }
  return systemPath;
}

function defaultConfig() {
  return {
    installed: false,
    stack: { naive: false, hy2: false },
    domain: '',
    email: '',
    serverIp: '',
    arch: '',
    naiveUsers: [],
    hy2Users: []
  };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    const cfg = defaultConfig();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    return cfg;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (!raw.stack) {
      raw.stack = { naive: !!raw.installed, hy2: false };
      raw.naiveUsers = raw.proxyUsers || raw.naiveUsers || [];
      raw.hy2Users = raw.hy2Users || [];
      delete raw.proxyUsers;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(raw, null, 2));
    }
    if (!Array.isArray(raw.naiveUsers)) raw.naiveUsers = [];
    if (!Array.isArray(raw.hy2Users)) raw.hy2Users = [];

    if (!raw.panelDomain) {
      try {
        const caddyfile = fs.readFileSync(testPath('/etc/caddy/Caddyfile'), 'utf8');
        const m = caddyfile.match(/\n(\S+)\s*\{\s*\n\s*tls\s+(\S+)\s*\n[^}]*reverse_proxy\s+127\.0\.0\.1/);
        if (m && m[1] && m[1] !== raw.domain && m[1].includes('.')) {
          raw.panelDomain = m[1];
          raw.panelEmail = m[2] || raw.email;
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(raw, null, 2));
          console.log('[migrate] panelDomain восстановлен из Caddyfile:', raw.panelDomain);
        }
      } catch (_) { }
    }

    return raw;
  } catch (e) {
    console.error('config.json parse error, resetting:', e.message);
    const cfg = defaultConfig();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    return cfg;
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function loadUsers() {
  const bcrypt = require('bcryptjs');
  if (!fs.existsSync(USERS_FILE)) {
    const users = { admin: { password: bcrypt.hashSync('admin', 10), role: 'admin' } };
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
    return users;
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

module.exports = {
  loadConfig,
  saveConfig,
  loadUsers,
  saveUsers,
  defaultConfig
};
