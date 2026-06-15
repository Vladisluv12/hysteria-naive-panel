'use strict';

const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.SQLITE_DB_DIR || path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'panel.db');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const storage = require('./storage.js');

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
  try {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('config');
    if (!row) return defaultConfig();
    const cfg = JSON.parse(row.value);
    if (!cfg.stack) cfg.stack = { naive: !!cfg.installed, hy2: false };
    if (!Array.isArray(cfg.naiveUsers)) cfg.naiveUsers = [];
    if (!Array.isArray(cfg.hy2Users)) cfg.hy2Users = [];
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
