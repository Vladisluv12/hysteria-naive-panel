'use strict';

const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.SQLITE_DB_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'panel.db');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const storage = require('./storage.js');

const TEST_CONFIG_DIR = process.env.TEST_CONFIG_DIR || '';
function testPath(systemPath) {
  if (TEST_CONFIG_DIR) {
    return path.join(TEST_CONFIG_DIR, path.basename(systemPath));
  }
  return systemPath;
}

let db;
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  const row = db.prepare('SELECT COUNT(*) AS cnt FROM meta').get();
  if (row.cnt === 0) {
    const cfg = storage.loadConfig();
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (\'config\', ?)').run(JSON.stringify(cfg));
    const users = storage.loadUsers();
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (\'users\', ?)').run(JSON.stringify(users));
  }
} catch (e) {
  console.error('[sqliteStorage] init error:', e.message);
  throw e;
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
  try {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('config');
    if (!row) return defaultConfig();
    const cfg = JSON.parse(row.value);
    if (!cfg.stack) cfg.stack = { naive: !!cfg.installed, hy2: false };
    if (!Array.isArray(cfg.naiveUsers)) cfg.naiveUsers = [];
    if (!Array.isArray(cfg.hy2Users)) cfg.hy2Users = [];
    if (!Array.isArray(cfg.mieruUsers)) cfg.mieruUsers = [];
    if (!Array.isArray(cfg.vlessUsers)) cfg.vlessUsers = [];

    // Migrate mieruUsers + mieruPort from /etc/mita/server.json if panel config is empty
    if (cfg.mieruUsers.length === 0) {
      try {
        const mitaPath = testPath('/etc/mita/server.json');
        if (fs.existsSync(mitaPath)) {
          const mitaCfg = JSON.parse(fs.readFileSync(mitaPath, 'utf8'));
          if (mitaCfg.users && Array.isArray(mitaCfg.users) && mitaCfg.users.length > 0) {
            cfg.mieruUsers = mitaCfg.users.map(u => ({
              username: u.name,
              password: u.password,
              createdAt: new Date().toISOString()
            }));
            if (mitaCfg.portBindings && mitaCfg.portBindings[0] && mitaCfg.portBindings[0].port) {
              cfg.mieruPort = mitaCfg.portBindings[0].port;
            }
            db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (\'config\', ?)').run(JSON.stringify(cfg));
            console.log('[migrate] mieruUsers imported from /etc/mita/server.json:', cfg.mieruUsers.length, 'users');
          }
        }
      } catch (e) { console.error('[migrate] mieruUsers migration skipped:', e.message); }
    }

    if (typeof cfg.port !== 'number' || cfg.port < 1 || cfg.port > 65535) {
      cfg.port = 443;
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (\'config\', ?)').run(JSON.stringify(cfg));
    }
    return cfg;
  } catch (e) {
    console.error('[sqliteStorage] loadConfig error:', e.message);
    return defaultConfig();
  }
}

function saveConfig(cfg) {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (\'config\', ?)').run(JSON.stringify(cfg));
}

function loadUsers() {
  try {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('users');
    if (!row) {
      const bcrypt = require('bcryptjs');
      const users = { admin: { password: bcrypt.hashSync('admin', 10), role: 'admin' } };
      const raw = JSON.stringify(users);
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (\'users\', ?)').run(raw);
      return users;
    }
    return JSON.parse(row.value);
  } catch (e) {
    console.error('[sqliteStorage] loadUsers error:', e.message);
    return {};
  }
}

function saveUsers(users) {
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (\'users\', ?)').run(JSON.stringify(users));
}

module.exports = {
  defaultConfig,
  loadConfig,
  saveConfig,
  loadUsers,
  saveUsers
};
