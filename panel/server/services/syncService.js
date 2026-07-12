'use strict';

const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.SQLITE_DB_DIR || path.join(__dirname, '../../data');
const TEST_CONFIG_DIR = process.env.TEST_CONFIG_DIR || '';

function queuePath() {
  return TEST_CONFIG_DIR
    ? path.join(TEST_CONFIG_DIR, 'queue.db')
    : path.join(DATA_DIR, 'queue.db');
}

function dataDir() {
  return TEST_CONFIG_DIR || DATA_DIR;
}

let db;
let _interval = null;

function initDb() {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const Database = require('better-sqlite3');
  db = new Database(queuePath());
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS pending_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,
    protocol TEXT NOT NULL,
    user_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
}

function ensureDb() {
  if (!db) initDb();
}

function enqueue(protocol, operation, userId) {
  try {
    ensureDb();
    if (['naive', 'hy2', 'mieru', 'vless'].includes(protocol)) {
      db.prepare('INSERT INTO pending_changes (protocol, operation, user_id) VALUES (?, ?, ?)')
        .run(protocol, operation || 'sync', userId || null);
    }
  } catch (e) {
    console.error('[syncService] enqueue error:', e.message);
  }
}

function markDirty(protocol) {
  enqueue(protocol, 'sync');
}

function drain() {
  ensureDb();
  return db.transaction(() => {
    const rows = db.prepare('SELECT DISTINCT protocol FROM pending_changes').all();
    db.prepare('DELETE FROM pending_changes').run();
    return rows.map(r => r.protocol);
  })();
}

async function syncAll() {
  let protocols;
  try {
    protocols = drain();
  } catch (e) {
    return;
  }
  if (protocols.length === 0) return;

  const { loadConfig } = require('./storageFactory.js');
  const { reloadNaive, restartHysteria, restartMieru, restartVless } = require('./systemAdapter.js');

  const cfg = loadConfig();
  const s = cfg && cfg.stack;
  const tasks = [];

  if (protocols.includes('naive') && s && s.naive) {
    tasks.push((async () => {
      const { writeCaddyfile } = require('../controllers/naiveController.js');
      writeCaddyfile(cfg);
      await reloadNaive();
    })());
  }
  if (protocols.includes('hy2') && s && s.hy2) {
    tasks.push((async () => {
      const { writeHysteriaConfig } = require('../controllers/hysteriaController.js');
      if (writeHysteriaConfig(cfg)) await restartHysteria();
    })());
  }
  if (protocols.includes('mieru') && s && s.mieru) {
    tasks.push((async () => {
      const { writeMieruConfig } = require('../controllers/mieruController.js');
      if (writeMieruConfig(cfg)) await restartMieru();
    })());
  }
  if (protocols.includes('vless') && s && s.vless) {
    tasks.push((async () => {
      const { writeVlessConfig } = require('../controllers/vlessController.js');
      if (writeVlessConfig(cfg)) await restartVless();
    })());
  }
  await Promise.all(tasks);
}

function startSync(intervalMs) {
  if (!db) initDb();
  if (_interval) clearInterval(_interval);
  _interval = setInterval(syncAll, intervalMs || 3000);
  _interval.unref();
  return _interval;
}

function stopSync() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = { enqueue, markDirty, drain, syncAll, startSync, stopSync };
