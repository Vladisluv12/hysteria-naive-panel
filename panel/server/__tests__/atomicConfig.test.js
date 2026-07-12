'use strict';

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { xrayValidator } from '../services/atomicConfig.js';

let tmpDir, fakeBinDir, originalPath, tmpConfigPath;

function makeFakeXray(script) {
  const binPath = path.join(fakeBinDir, 'xray');
  fs.writeFileSync(binPath, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomicconfig-test-'));
  fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fakebin-'));
  tmpConfigPath = path.join(tmpDir, 'config.json.new');
  fs.writeFileSync(tmpConfigPath, '{}');
  originalPath = process.env.PATH;
  process.env.PATH = `${fakeBinDir}:${originalPath}`;
});

afterEach(() => {
  process.env.PATH = originalPath;
});

describe('xrayValidator', () => {
  test('returns true when xray run -test reports Configuration OK', () => {
    makeFakeXray('echo "Configuration OK."; exit 0');
    expect(xrayValidator(tmpConfigPath)).toBe(true);
  });

  test('returns false when xray run -test fails on an invalid config (e.g. unknown geosite category)', () => {
    // Reproduces: geosite.dat asset out of sync with the category the panel
    // thinks is valid — exactly what took VLESS down in production.
    makeFakeXray([
      'echo "Xray 26.3.27"',
      'echo "Failed to start: main: failed to load config files: [x] > infra/conf: failed to build routing configuration > infra/conf: invalid field rule > infra/conf: failed to parse domain rule: geosite:category-betting-ru > infra/conf: failed to load geosite: CATEGORY-BETTING-RU > infra/conf: code not found in geosite.dat: CATEGORY-BETTING-RU"',
      'exit 23',
    ].join('\n'));
    expect(xrayValidator(tmpConfigPath)).toBe(false);
  });

  test('is permissive when the xray binary is not installed (dev/test environments)', () => {
    process.env.PATH = fakeBinDir; // no xray binary anywhere on PATH
    expect(xrayValidator(tmpConfigPath)).toBe(true);
  });
});
