'use strict';

import { describe, test, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'syncservice-test-'));
  process.env.TEST_CONFIG_DIR = tmpDir;
  process.env.SQLITE_DB_DIR = tmpDir;
  process.env.TEST_MODE = '1';

  // Clear the require cache for every module under test so each test
  // gets a fresh instance pointed at its own tmpDir.
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}panel${path.sep}server${path.sep}`)) delete require.cache[key];
  }
});

describe('syncAll', () => {
  test('a downstream write throwing unexpectedly does not reject syncAll (no crash)', async () => {
    const naiveController = require('../controllers/naiveController.js');
    naiveController.writeCaddyfile = () => { throw new Error('boom: unexpected write failure'); };

    const syncService = require('../services/syncService.js');
    const storageFactory = require('../services/storageFactory.js');
    storageFactory.saveConfig({
      ...storageFactory.defaultConfig(),
      installed: true,
      domain: 'example.com',
      stack: { naive: true, hy2: false, mieru: false, vless: false },
      naiveUsers: [{ username: 'alice', password: 'password123', createdAt: new Date().toISOString(), expiresAt: null }],
    });

    syncService.enqueue('naive', 'create', 'alice');

    // Before the fix: syncAll() has no try/catch around the write/restart
    // section, and is invoked directly by setInterval with no .catch in
    // index.js — so this throw becomes an unhandled promise rejection that
    // crashes the whole panel process.
    await expect(syncService.syncAll()).resolves.toBeUndefined();
  });

  test('one failing protocol does not stop a different protocol from syncing', async () => {
    const naiveController = require('../controllers/naiveController.js');
    naiveController.writeCaddyfile = () => { throw new Error('boom: naive write failed'); };

    let hy2Written = false;
    const hysteriaController = require('../controllers/hysteriaController.js');
    hysteriaController.writeHysteriaConfig = () => { hy2Written = true; return true; };

    let hy2Restarted = false;
    const systemAdapter = require('../services/systemAdapter.js');
    systemAdapter.restartHysteria = async () => { hy2Restarted = true; };

    const syncService = require('../services/syncService.js');
    const storageFactory = require('../services/storageFactory.js');
    storageFactory.saveConfig({
      ...storageFactory.defaultConfig(),
      installed: true,
      domain: 'example.com',
      stack: { naive: true, hy2: true, mieru: false, vless: false },
    });

    syncService.enqueue('naive', 'create', 'alice');
    syncService.enqueue('hy2', 'create', 'bob');

    await expect(syncService.syncAll()).resolves.toBeUndefined();
    expect(hy2Written).toBe(true);
    expect(hy2Restarted).toBe(true);
  });
});
