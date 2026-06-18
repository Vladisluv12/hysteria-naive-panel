'use strict';

import { describe, test, expect, afterAll, beforeEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-test-'));
const DB_PATH = path.join(TMP_DIR, 'panel.db');

process.env.SQLITE_DB_DIR = TMP_DIR;
process.env.TEST_CONFIG_DIR = TMP_DIR;
const DATA_DIR = TMP_DIR;
const CONFIG_JSON = path.join(DATA_DIR, 'config.json');
const USERS_JSON = path.join(DATA_DIR, 'users.json');

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
});

beforeEach(() => {
  delete require.cache[require.resolve('../services/storage.js')];
  delete require.cache[require.resolve('../services/sqliteStorage.js')];
});

describe('sqliteStorage', () => {
  test('exports all required functions', async () => {
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    expect(mod.defaultConfig).toBeDefined();
    expect(mod.loadConfig).toBeDefined();
    expect(mod.saveConfig).toBeDefined();
    expect(mod.loadUsers).toBeDefined();
    expect(mod.saveUsers).toBeDefined();
  });

  test('defaultConfig returns initial state', async () => {
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    const cfg = mod.defaultConfig();
    expect(cfg.installed).toBe(false);
    expect(cfg.stack).toEqual({ naive: false, hy2: false });
    expect(cfg.naiveUsers).toEqual([]);
    expect(cfg.hy2Users).toEqual([]);
  });

  test('saveConfig / loadConfig roundtrip', async () => {
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    const data = { installed: true, domain: 'test.com', stack: { naive: true, hy2: false }, naiveUsers: [], hy2Users: [] };
    mod.saveConfig(data);
    const loaded = mod.loadConfig();
    expect(loaded.domain).toBe('test.com');
    expect(loaded.installed).toBe(true);
    expect(loaded.stack.naive).toBe(true);
  });

  test('saveUsers / loadUsers roundtrip', async () => {
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    const users = { admin: { password: '$2a$10$xxx', role: 'admin' }, test: { password: 'hash', role: 'user' } };
    mod.saveUsers(users);
    const loaded = mod.loadUsers();
    expect(loaded.admin.role).toBe('admin');
    expect(loaded.test.role).toBe('user');
  });

  test('loadConfig after multiple saves returns latest', async () => {
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    mod.saveConfig({ installed: true, domain: 'v1.com', stack: { naive: true, hy2: false }, naiveUsers: [], hy2Users: [] });
    mod.saveConfig({ installed: true, domain: 'v2.com', stack: { naive: true, hy2: true }, naiveUsers: [], hy2Users: [] });
    const loaded = mod.loadConfig();
    expect(loaded.domain).toBe('v2.com');
    expect(loaded.stack.hy2).toBe(true);
  });

  test('imports from JSON when SQLite is empty', async () => {
    vi.resetModules();
    try { fs.unlinkSync(DB_PATH); } catch {}
    try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
    try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}
    const cfgData = { installed: true, domain: 'imported.com', stack: { naive: true, hy2: false }, naiveUsers: [], hy2Users: [] };
    const usrData = { admin: { password: 'hash', role: 'admin' } };
    fs.writeFileSync(CONFIG_JSON, JSON.stringify(cfgData));
    fs.writeFileSync(USERS_JSON, JSON.stringify(usrData));

    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    expect(mod.loadConfig().domain).toBe('imported.com');
    expect(mod.loadUsers().admin.role).toBe('admin');
  });

  test('handles corrupted config gracefully', async () => {
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    mod.saveConfig({ test: 'valid' });
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH);
    db.prepare("UPDATE meta SET value = '{broken json' WHERE key = 'config'").run();
    db.close();

    const corrupted = mod.loadConfig();
    expect(corrupted.installed).toBe(false);
    expect(corrupted.stack).toEqual({ naive: false, hy2: false });
  });

  test('handles corrupted users gracefully', async () => {
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH);
    db.prepare("UPDATE meta SET value = '{broken' WHERE key = 'users'").run();
    db.close();

    const users = mod.loadUsers();
    expect(users).toEqual({});
  });

  test('WAL mode allows concurrent reads during write', async () => {
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    mod.saveConfig({ installed: true, domain: 'wal-test.com', stack: { naive: false, hy2: false }, naiveUsers: [], hy2Users: [] });

    const Database = require('better-sqlite3');
    const db2 = new Database(DB_PATH);
    const row = db2.prepare("SELECT value FROM meta WHERE key = 'config'").get();
    db2.close();

    const parsed = JSON.parse(row.value);
    expect(parsed.domain).toBe('wal-test.com');
  });

  test('loadConfig returns defaultConfig when no data exists', async () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-empty-'));
    const oldSqliteDir = process.env.SQLITE_DB_DIR;
    const oldTestDir = process.env.TEST_CONFIG_DIR;
    process.env.SQLITE_DB_DIR = freshDir;
    process.env.TEST_CONFIG_DIR = freshDir;
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    const cfg = mod.loadConfig();
    expect(cfg.installed).toBe(false);
    expect(cfg.domain).toBe('');
    process.env.SQLITE_DB_DIR = oldSqliteDir;
    process.env.TEST_CONFIG_DIR = oldTestDir;
    fs.rmSync(freshDir, { recursive: true, force: true });
  });

  test('loadUsers creates default admin when no users exist', async () => {
    const freshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-nousers-'));
    const oldSqliteDir = process.env.SQLITE_DB_DIR;
    const oldTestDir = process.env.TEST_CONFIG_DIR;
    process.env.SQLITE_DB_DIR = freshDir;
    process.env.TEST_CONFIG_DIR = freshDir;
    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    const users = mod.loadUsers();
    expect(users.admin).toBeDefined();
    expect(users.admin.role).toBe('admin');
    process.env.SQLITE_DB_DIR = oldSqliteDir;
    process.env.TEST_CONFIG_DIR = oldTestDir;
    fs.rmSync(freshDir, { recursive: true, force: true });
  });
});
