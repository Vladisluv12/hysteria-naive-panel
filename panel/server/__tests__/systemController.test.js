'use strict';

import { describe, test, expect, beforeEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let tmpDir;

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
  return res;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'systemcontroller-test-'));
  process.env.TEST_CONFIG_DIR = tmpDir;
  process.env.SQLITE_DB_DIR = tmpDir;
  process.env.TEST_MODE = '1';
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}panel${path.sep}server${path.sep}`)) delete require.cache[key];
  }
});

describe('getStatus', () => {
  test('does not shell out to check live service status — returns active: null for each installed protocol', () => {
    const storageFactory = require('../services/storageFactory.js');
    storageFactory.saveConfig({
      ...storageFactory.defaultConfig(),
      installed: true,
      domain: 'example.com',
      stack: { naive: true, hy2: true, mieru: false, vless: false },
      naiveUsers: [{ username: 'alice' }],
      hy2Users: [{ username: 'bob' }],
    });

    const systemController = require('../controllers/systemController.js');
    const res = makeRes();
    systemController.getStatus({}, res);

    expect(res.body.naive).toEqual({ active: null, usersCount: 1 });
    expect(res.body.hy2).toEqual({ active: null, usersCount: 1 });
    expect(res.body.mieru).toBeNull();
    expect(res.body.warp).toBeUndefined();
  });
});

describe('getServiceStatus', () => {
  test('rejects an unknown kind with 400', async () => {
    const systemController = require('../controllers/systemController.js');
    const res = makeRes();
    await systemController.getServiceStatus({ params: { kind: 'not-a-real-protocol' } }, res);
    expect(res.statusCode).toBe(400);
  });

  test('checks the live status of exactly one protocol', async () => {
    const systemController = require('../controllers/systemController.js');
    const res = makeRes();
    await systemController.getServiceStatus({ params: { kind: 'vless' } }, res);
    expect(typeof res.body.active).toBe('boolean');
  });
});
