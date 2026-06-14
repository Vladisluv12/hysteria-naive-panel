'use strict';

import { describe, test, expect, vi, afterEach } from 'vitest';

const ORIGINAL_USE_SQLITE = process.env.USE_SQLITE;

afterEach(() => {
  delete require.cache[require.resolve('../services/storageFactory.js')];
  process.env.USE_SQLITE = ORIGINAL_USE_SQLITE;
});

describe('storageFactory (USE_SQLITE=false)', () => {
  test('exports all required functions', async () => {
    process.env.USE_SQLITE = 'false';
    const mod = await import('../services/storageFactory.js');
    expect(mod.defaultConfig).toBeDefined();
    expect(mod.loadConfig).toBeDefined();
    expect(mod.saveConfig).toBeDefined();
    expect(mod.loadUsers).toBeDefined();
    expect(mod.saveUsers).toBeDefined();
  });

  test('defaultConfig returns correct shape', async () => {
    process.env.USE_SQLITE = 'false';
    const mod = await import('../services/storageFactory.js');
    const cfg = mod.defaultConfig();
    expect(cfg.installed).toBe(false);
    expect(cfg.stack).toEqual({ naive: false, hy2: false });
    expect(cfg.naiveUsers).toEqual([]);
    expect(cfg.hy2Users).toEqual([]);
  });
});

describe('storageFactory (USE_SQLITE=true)', () => {
  test('loadConfig roundtrips with dual-write', async () => {
    process.env.USE_SQLITE = 'true';
    const mod = await import('../services/storageFactory.js');
    // Re-require to ensure clean module state
    const data = { installed: true, domain: 'sqlite-test.com', stack: { naive: false, hy2: true }, naiveUsers: [], hy2Users: [] };
    mod.saveConfig(data);

    // Read back from factory
    const loaded = mod.loadConfig();
    expect(loaded.domain).toBe('sqlite-test.com');
    expect(loaded.installed).toBe(true);
    expect(loaded.stack.hy2).toBe(true);

    // Verify JSON file is also written (dual-write)
    const fs = await import('fs');
    const path = await import('path');
    const jsonPath = path.resolve(__dirname, '../../data/config.json');
    expect(fs.existsSync(jsonPath)).toBe(true);
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(jsonData.domain).toBe('sqlite-test.com');
  });

  test('saveUsers / loadUsers roundtrip with dual-write', async () => {
    process.env.USE_SQLITE = 'true';
    const mod = await import('../services/storageFactory.js');
    const users = { operator: { password: '$2a$10$aaa', role: 'admin' } };
    mod.saveUsers(users);

    const loaded = mod.loadUsers();
    expect(loaded.operator.role).toBe('admin');

    const fs = await import('fs');
    const path = await import('path');
    const jsonPath = path.resolve(__dirname, '../../data/users.json');
    expect(fs.existsSync(jsonPath)).toBe(true);
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(jsonData.operator.role).toBe('admin');
  });
});

describe('storageFactory (no USE_SQLITE)', () => {
  test('loadConfig falls back to JSON backend', async () => {
    delete process.env.USE_SQLITE;
    const mod = await import('../services/storageFactory.js');
    const raw = mod.loadConfig();
    // Should have at least defaultConfig shape
    expect(typeof raw).toBe('object');
    expect('installed' in raw).toBe(true);
  });
});
