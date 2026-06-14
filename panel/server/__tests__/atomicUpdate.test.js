'use strict';

import { describe, test, expect, beforeEach } from 'vitest';
import { updateConfig, updateUsers } from '../services/atomicUpdate.js';
import { loadConfig, saveConfig, loadUsers, saveUsers, defaultConfig } from '../services/storage.js';
import bcrypt from 'bcryptjs';

const ADMIN_HASH = bcrypt.hashSync('admin', 10);

beforeEach(() => {
  saveConfig(defaultConfig());
  saveUsers({ admin: { password: ADMIN_HASH, role: 'admin' } });
});

describe('updateConfig', () => {
  test('applies update to current config', () => {
    updateConfig(c => { c.domain = 'test.com'; });
    expect(loadConfig().domain).toBe('test.com');
  });

  test('chain multiple updates preserves all changes', () => {
    updateConfig(c => { c.domain = 'a.com'; });
    updateConfig(c => { c.email = 'a@a.com'; });
    const cfg = loadConfig();
    expect(cfg.domain).toBe('a.com');
    expect(cfg.email).toBe('a@a.com');
  });

  test('does not lose concurrent modifications', () => {
    // Initial state
    updateConfig(c => { c.naiveUsers = []; });

    // Simulate: concurrent CRUD writes new user
    const concurrent = loadConfig();
    concurrent.naiveUsers.push({ username: 'alice' });
    saveConfig(concurrent);

    // Stale callback: updates installed using updateConfig
    updateConfig(c => { c.installed = true; });

    // Verify: alice preserved, installed set
    const cfg = loadConfig();
    expect(cfg.naiveUsers).toHaveLength(1);
    expect(cfg.naiveUsers[0].username).toBe('alice');
    expect(cfg.installed).toBe(true);
  });

  test('handles concurrent field updates without conflicts', () => {
    updateConfig(c => { c.naiveUsers = []; c.hy2Users = []; });

    updateConfig(c => { c.naiveUsers.push({ username: 'alice' }); });
    updateConfig(c => { c.hy2Users.push({ username: 'bob' }); });

    const cfg = loadConfig();
    expect(cfg.naiveUsers).toHaveLength(1);
    expect(cfg.hy2Users).toHaveLength(1);
  });

  test('returns updated config', () => {
    const result = updateConfig(c => { c.domain = 'ret.com'; });
    expect(result.domain).toBe('ret.com');
  });

  test('nested object merge works', () => {
    updateConfig(c => {
      c.stack = { naive: true, hy2: false };
      c.domain = 'nested.com';
    });

    updateConfig(c => { c.stack.hy2 = true; });

    const cfg = loadConfig();
    expect(cfg.stack.naive).toBe(true);
    expect(cfg.stack.hy2).toBe(true);
    expect(cfg.domain).toBe('nested.com');
  });
});

describe('updateUsers', () => {
  test('applies update to users', () => {
    updateUsers(u => { u.testuser = { password: ADMIN_HASH, role: 'user' }; });
    expect(loadUsers().testuser).toBeDefined();
  });

  test('does not lose concurrent user modifications', () => {
    // Concurrent: add a user directly
    const concurrent = loadUsers();
    concurrent.charlie = { password: 'hash', role: 'user' };
    saveUsers(concurrent);

    // Stale-like update
    updateUsers(u => { u.admin.role = 'superadmin'; });

    const users = loadUsers();
    expect(users.charlie).toBeDefined();
    expect(users.admin.role).toBe('superadmin');
  });
});

describe('stale reference anti-pattern fixed', () => {
  test('simulates persistServerIp stale save bug', () => {
    updateConfig(c => { c.naiveUsers = []; });

    // persistServerIp captures old reference
    const staleCfg = loadConfig();
    staleCfg.serverIp = '1.2.3.4';

    // Concurrent CRUD happens
    saveConfig({ ...loadConfig(), naiveUsers: [{ username: 'alice' }] });

    // OLD code: saveConfig(staleCfg) — would LOSE alice
    // NEW code via updateConfig:
    updateConfig(c => { c.serverIp = staleCfg.serverIp; });

    const cfg = loadConfig();
    expect(cfg.serverIp).toBe('1.2.3.4');
    expect(cfg.naiveUsers).toHaveLength(1); // not lost
  });

  test('simulates install callback stale save bug', () => {
    updateConfig(c => { c.naiveUsers = []; c.installed = false; });

    // Install handler captured stale config
    const staleCfg = loadConfig();

    // User created during install (CRUD operation)
    saveConfig({ ...loadConfig(), naiveUsers: [{ username: 'alice' }], installed: false });

    // Install callback: marks installed
    // OLD: saveConfig(staleCfg) — LOST alice
    // NEW:
    updateConfig(c => { c.installed = true; });

    const cfg = loadConfig();
    expect(cfg.installed).toBe(true);
    expect(cfg.naiveUsers).toHaveLength(1); // alice preserved
  });
});
