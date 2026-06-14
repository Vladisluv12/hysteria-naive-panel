'use strict';

const storage = require('./storage.js');

let sqliteStorage = null;
if (process.env.USE_SQLITE === 'true') {
  try {
    sqliteStorage = require('./sqliteStorage.js');
    console.log('[storage] SQLite backend active');
  } catch (e) {
    console.error('[storage] Failed to load sqliteStorage, falling back to JSON:', e.message);
  }
}

function defaultConfig() {
  if (sqliteStorage) return sqliteStorage.defaultConfig();
  return storage.defaultConfig();
}

function loadConfig() {
  if (sqliteStorage) return sqliteStorage.loadConfig();
  return storage.loadConfig();
}

function saveConfig(cfg) {
  if (sqliteStorage) sqliteStorage.saveConfig(cfg);
  storage.saveConfig(cfg);
}

function loadUsers() {
  if (sqliteStorage) return sqliteStorage.loadUsers();
  return storage.loadUsers();
}

function saveUsers(users) {
  if (sqliteStorage) sqliteStorage.saveUsers(users);
  storage.saveUsers(users);
}

module.exports = { defaultConfig, loadConfig, saveConfig, loadUsers, saveUsers };
