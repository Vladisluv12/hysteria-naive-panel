'use strict';

import { describe, test, expect, vi, afterAll, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const ORIGINAL_SQLITE_DIR = process.env.SQLITE_DB_DIR;
const ORIGINAL_TEST_DIR = process.env.TEST_CONFIG_DIR;
const ORIGINAL_USE_SQLITE = process.env.USE_SQLITE;
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-factory-'));
process.env.SQLITE_DB_DIR = TMP_DIR;
process.env.TEST_CONFIG_DIR = TMP_DIR;

afterAll(() => {
  process.env.USE_SQLITE = ORIGINAL_USE_SQLITE;
  process.env.SQLITE_DB_DIR = ORIGINAL_SQLITE_DIR;
  process.env.TEST_CONFIG_DIR = ORIGINAL_TEST_DIR;
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
});

function cleanData() {
  try { fs.unlinkSync(path.join(TMP_DIR, 'config.json')); } catch {}
  try { fs.unlinkSync(path.join(TMP_DIR, 'users.json')); } catch {}
  try { fs.unlinkSync(path.join(TMP_DIR, 'panel.db')); } catch {}
  try { fs.unlinkSync(path.join(TMP_DIR, 'panel.db-wal')); } catch {}
  try { fs.unlinkSync(path.join(TMP_DIR, 'panel.db-shm')); } catch {}
}

function reset() {
  delete require.cache[require.resolve('../services/storageFactory.js')];
  delete require.cache[require.resolve('../services/sqliteStorage.js')];
  delete require.cache[require.resolve('../services/storage.js')];
  cleanData();
}

describe('storageFactory (USE_SQLITE=false)', () => {
  test('exports all required functions', async () => {
    process.env.USE_SQLITE = 'false';
    reset();
    const mod = await import('../services/storageFactory.js');
    expect(mod.defaultConfig).toBeDefined();
    expect(mod.loadConfig).toBeDefined();
    expect(mod.saveConfig).toBeDefined();
    expect(mod.loadUsers).toBeDefined();
    expect(mod.saveUsers).toBeDefined();
  });

  test('defaultConfig returns correct shape', async () => {
    process.env.USE_SQLITE = 'false';
    reset();
    const mod = await import('../services/storageFactory.js');
    const cfg = mod.defaultConfig();
    expect(cfg.installed).toBe(false);
    expect(cfg.stack).toEqual({ naive: false, hy2: false });
    expect(cfg.naiveUsers).toEqual([]);
    expect(cfg.hy2Users).toEqual([]);
  });

  test('write JSON only, no SQLite file created', async () => {
    process.env.USE_SQLITE = 'false';
    reset();
    const mod = await import('../services/storageFactory.js');
    mod.saveConfig({ installed: false, stack: { naive: false, hy2: false }, domain: '', email: '', serverIp: '', arch: '', naiveUsers: [], hy2Users: [] });
    expect(fs.existsSync(path.join(TMP_DIR, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(TMP_DIR, 'panel.db'))).toBe(false);
  });
});

describe('storageFactory (USE_SQLITE=true)', () => {
  test('loadConfig roundtrips with dual-write', async () => {
    process.env.USE_SQLITE = 'true';
    reset();
    const mod = await import('../services/storageFactory.js');
    const data = { installed: true, domain: 'sqlite-test.com', stack: { naive: false, hy2: true }, naiveUsers: [], hy2Users: [] };
    mod.saveConfig(data);

    const loaded = mod.loadConfig();
    expect(loaded.domain).toBe('sqlite-test.com');
    expect(loaded.installed).toBe(true);
    expect(loaded.stack.hy2).toBe(true);

    // JSON file should exist (dual-write) in TEST_CONFIG_DIR
    expect(fs.existsSync(path.join(TMP_DIR, 'config.json'))).toBe(true);
    const jsonData = JSON.parse(fs.readFileSync(path.join(TMP_DIR, 'config.json'), 'utf8'));
    expect(jsonData.domain).toBe('sqlite-test.com');
  });

  test('saveUsers / loadUsers roundtrip with dual-write', async () => {
    process.env.USE_SQLITE = 'true';
    reset();
    const mod = await import('../services/storageFactory.js');
    const users = { operator: { password: '$2a$10$aaa', role: 'admin' } };
    mod.saveUsers(users);

    const loaded = mod.loadUsers();
    expect(loaded.operator.role).toBe('admin');

    expect(fs.existsSync(path.join(TMP_DIR, 'users.json'))).toBe(true);
    const jsonData = JSON.parse(fs.readFileSync(path.join(TMP_DIR, 'users.json'), 'utf8'));
    expect(jsonData.operator.role).toBe('admin');
  });

  test('dual-write consistency — SQLite and JSON contain same data', async () => {
    process.env.USE_SQLITE = 'true';
    reset();
    const mod = await import('../services/storageFactory.js');
    mod.saveConfig({ installed: true, domain: 'consistency-test.com', stack: { naive: true, hy2: true }, naiveUsers: [{ username: 'alice', password: 'hash1' }], hy2Users: [{ username: 'bob', password: 'hash2' }] });

    // Read via factory API (reads from SQLite)
    const fromFactory = mod.loadConfig();

    // Read from JSON file
    const jsonData = JSON.parse(fs.readFileSync(path.join(TMP_DIR, 'config.json'), 'utf8'));

    // Both must be identical
    expect(fromFactory).toEqual(jsonData);
    expect(fromFactory.domain).toBe('consistency-test.com');
    expect(fromFactory.naiveUsers[0].username).toBe('alice');
  });

  test('write SQLite then read with USE_SQLITE=false reads same data from JSON (switchover)', async () => {
    // Step 1: Write with SQLite enabled — dual-write saves to SQLite + JSON
    process.env.USE_SQLITE = 'true';
    reset();
    let mod = await import('../services/storageFactory.js');
    mod.saveConfig({ installed: true, domain: 'switchover.com', stack: { naive: true, hy2: false }, email: 'admin@test.com', serverIp: '1.2.3.4', arch: 'amd64', naiveUsers: [], hy2Users: [] });
    mod.saveUsers({ admin: { password: '$2a$10$aaa', role: 'admin' } });

    // Step 2: Clear module cache (NOT data files — JSON must persist)
    delete require.cache[require.resolve('../services/storageFactory.js')];
    delete require.cache[require.resolve('../services/sqliteStorage.js')];
    delete require.cache[require.resolve('../services/storage.js')];
    process.env.USE_SQLITE = 'false';
    mod = await import('../services/storageFactory.js');

    const cfg = mod.loadConfig();
    expect(cfg.domain).toBe('switchover.com');
    expect(cfg.installed).toBe(true);

    const users = mod.loadUsers();
    expect(users.admin.role).toBe('admin');
  });
});

describe('storageFactory (no USE_SQLITE)', () => {
  test('loadConfig falls back to JSON backend', async () => {
    reset();
    delete process.env.USE_SQLITE;
    const mod = await import('../services/storageFactory.js');
    const raw = mod.loadConfig();
    expect(typeof raw).toBe('object');
    expect('installed' in raw).toBe(true);
  });
});
