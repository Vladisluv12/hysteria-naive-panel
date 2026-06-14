'use strict';

import { describe, test, expect, afterAll, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'panel.db');
const CONFIG_JSON = path.join(DATA_DIR, 'config.json');
const USERS_JSON = path.join(DATA_DIR, 'users.json');

afterAll(() => {
  try { fs.unlinkSync(DB_PATH); } catch {}
});

describe('sqliteStorage', () => {
  test('exports all required functions', async () => {
    const mod = await import('../services/sqliteStorage.js');
    expect(mod.defaultConfig).toBeDefined();
    expect(mod.loadConfig).toBeDefined();
    expect(mod.saveConfig).toBeDefined();
    expect(mod.loadUsers).toBeDefined();
    expect(mod.saveUsers).toBeDefined();
  });

  test('defaultConfig returns initial state', async () => {
    const mod = await import('../services/sqliteStorage.js');
    const cfg = mod.defaultConfig();
    expect(cfg.installed).toBe(false);
    expect(cfg.stack).toEqual({ naive: false, hy2: false });
    expect(cfg.naiveUsers).toEqual([]);
    expect(cfg.hy2Users).toEqual([]);
  });

  test('saveConfig / loadConfig roundtrip', async () => {
    const mod = await import('../services/sqliteStorage.js');
    const data = { installed: true, domain: 'test.com', stack: { naive: true, hy2: false }, naiveUsers: [], hy2Users: [] };
    mod.saveConfig(data);
    const loaded = mod.loadConfig();
    expect(loaded.domain).toBe('test.com');
    expect(loaded.installed).toBe(true);
    expect(loaded.stack.naive).toBe(true);
  });

  test('saveUsers / loadUsers roundtrip', async () => {
    const mod = await import('../services/sqliteStorage.js');
    const users = { admin: { password: '$2a$10$xxx', role: 'admin' }, test: { password: 'hash', role: 'user' } };
    mod.saveUsers(users);
    const loaded = mod.loadUsers();
    expect(loaded.admin.role).toBe('admin');
    expect(loaded.test.role).toBe('user');
  });

  test('loadConfig after multiple saves returns latest', async () => {
    const mod = await import('../services/sqliteStorage.js');
    mod.saveConfig({ installed: true, domain: 'v1.com', stack: { naive: true, hy2: false }, naiveUsers: [], hy2Users: [] });
    mod.saveConfig({ installed: true, domain: 'v2.com', stack: { naive: true, hy2: true }, naiveUsers: [], hy2Users: [] });
    const loaded = mod.loadConfig();
    expect(loaded.domain).toBe('v2.com');
    expect(loaded.stack.hy2).toBe(true);
  });

  test('imports from JSON when SQLite is empty', async () => {
    try { fs.unlinkSync(DB_PATH); } catch {}
    const cfgData = { installed: true, domain: 'imported.com', stack: { naive: true, hy2: false }, naiveUsers: [], hy2Users: [] };
    const usrData = { admin: { password: 'hash', role: 'admin' } };
    fs.writeFileSync(CONFIG_JSON, JSON.stringify(cfgData));
    fs.writeFileSync(USERS_JSON, JSON.stringify(usrData));

    vi.resetModules();
    const mod = await import('../services/sqliteStorage.js');
    expect(mod.loadConfig().domain).toBe('imported.com');
    expect(mod.loadUsers().admin.role).toBe('admin');
  });
});
