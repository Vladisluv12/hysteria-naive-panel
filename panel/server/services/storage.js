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
    stack: { naive: false, hy2: false, mieru: false, vless: false },
    domain: '',
    email: '',
    serverIp: '',
    arch: '',
    port: 443,
    naiveUsers: [],
    hy2Users: [],
    mieruUsers: [],
    vlessUsers: []
  };
}

function loadConfig() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const cfgPath = testPath(CONFIG_FILE);
  const usrPath = testPath(USERS_FILE);
  if (!fs.existsSync(cfgPath)) {
    const cfg = defaultConfig();
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    return cfg;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (!raw.stack) {
      raw.stack = { naive: !!raw.installed, hy2: false };
      raw.naiveUsers = raw.proxyUsers || raw.naiveUsers || [];
      raw.hy2Users = raw.hy2Users || [];
      delete raw.proxyUsers;
      fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
    }
    if (!Array.isArray(raw.naiveUsers)) raw.naiveUsers = [];
    if (!Array.isArray(raw.hy2Users)) raw.hy2Users = [];
    if (!Array.isArray(raw.mieruUsers)) raw.mieruUsers = [];
    if (!Array.isArray(raw.vlessUsers)) raw.vlessUsers = [];

    // Migrate mieruUsers + mieruPort from /etc/mita/server.json if panel config is empty
    if (raw.mieruUsers.length === 0) {
      try {
        const mitaPath = testPath('/etc/mita/server.json');
        if (fs.existsSync(mitaPath)) {
          const mitaCfg = JSON.parse(fs.readFileSync(mitaPath, 'utf8'));
          if (mitaCfg.users && Array.isArray(mitaCfg.users) && mitaCfg.users.length > 0) {
            raw.mieruUsers = mitaCfg.users.map(u => ({
              username: u.name,
              password: u.password,
              createdAt: new Date().toISOString()
            }));
            if (mitaCfg.portBindings && mitaCfg.portBindings[0] && mitaCfg.portBindings[0].port) {
              raw.mieruPort = mitaCfg.portBindings[0].port;
            }
            fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
            console.log('[migrate] mieruUsers imported from /etc/mita/server.json:', raw.mieruUsers.length, 'users');
          }
        }
      } catch (e) { console.error('[migrate] mieruUsers migration skipped:', e.message); }
    }

    if (typeof raw.port !== 'number' || raw.port < 1 || raw.port > 65535) {
      raw.port = 443;
      fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
    }

    if (!raw.panelDomain) {
      try {
        const caddyfile = fs.readFileSync(testPath('/etc/caddy/Caddyfile'), 'utf8');
        const m = caddyfile.match(/\n(\S+)\s*\{\s*\n\s*tls\s+(\S+)\s*\n[^}]*reverse_proxy\s+127\.0\.0\.1/);
        if (m && m[1] && m[1] !== raw.domain && m[1].includes('.')) {
          raw.panelDomain = m[1];
          raw.panelEmail = m[2] || raw.email;
          fs.writeFileSync(cfgPath, JSON.stringify(raw, null, 2));
          console.log('[migrate] panelDomain восстановлен из Caddyfile:', raw.panelDomain);
        }
      } catch (_) { }
    }

    return raw;
  } catch (e) {
    console.error('config.json parse error, resetting:', e.message);
    backupConfig(cfgPath);
    const cfg = defaultConfig();
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    return cfg;
  }
}

function backupConfig(cfgPath) {
  try {
    if (fs.existsSync(cfgPath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const bakPath = cfgPath + '.' + ts + '.bak';
      fs.copyFileSync(cfgPath, bakPath);
      // Keep only last 5 backups
      const dir = path.dirname(cfgPath);
      const base = path.basename(cfgPath);
      const baks = fs.readdirSync(dir)
        .filter(f => f.startsWith(base + '.') && f.endsWith('.bak'))
        .sort().reverse();
      baks.slice(5).forEach(f => {
        try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
      });
    }
  } catch (e) {
    console.error('[storage] backup failed:', e.message);
  }
}

function saveConfig(cfg) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const cfgPath = testPath(CONFIG_FILE);
  backupConfig(cfgPath);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

function loadUsers() {
  const bcrypt = require('bcryptjs');
  const p = testPath(USERS_FILE);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(p)) {
    const users = { admin: { password: bcrypt.hashSync('admin', 10), role: 'admin' } };
    fs.writeFileSync(p, JSON.stringify(users, null, 2), { mode: 0o600 });
    return users;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function saveUsers(users) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(testPath(USERS_FILE), JSON.stringify(users, null, 2), { mode: 0o600 });
}

module.exports = {
  loadConfig,
  saveConfig,
  loadUsers,
  saveUsers,
  defaultConfig
};
