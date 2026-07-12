'use strict';

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { xrayValidator, caddyValidator } from '../services/atomicConfig.js';

let tmpDir, fakeBinDir, originalPath, tmpConfigPath;

function makeFakeXray(script) {
  const binPath = path.join(fakeBinDir, 'xray');
  fs.writeFileSync(binPath, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
}

function makeFakeCaddyNaive(script) {
  const binPath = path.join(fakeBinDir, 'caddy-naive');
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

describe('caddyValidator', () => {
  test('returns true when caddy-naive validate reports Valid configuration', () => {
    makeFakeCaddyNaive('echo "Valid configuration"; exit 0');
    expect(caddyValidator(tmpConfigPath)).toBe(true);
  });

  test('returns false when caddy-naive validate rejects the Caddyfile (e.g. unrecognized directive)', () => {
    makeFakeCaddyNaive([
      'echo \'{"level":"info","msg":"using config from file"}\' 1>&2',
      'echo "Error: adapting config using caddyfile: bad.Caddyfile:11: unrecognized directive: forward_proxy_totally_broken_directive" 1>&2',
      'exit 1',
    ].join('\n'));
    expect(caddyValidator(tmpConfigPath)).toBe(false);
  });

  test('validates against caddy-naive, not the plain caddy binary', () => {
    // Regression for the prod incident: caddyValidator used to shell out to
    // "caddy", which doesn't exist on this deployment (only caddy-naive
    // does, since naive ships as a custom forward_proxy build). "command
    // not found" never matched the error/adapt/parse check, so the
    // validator silently passed *everything* — the same "no real
    // validation" hole that let a bad VLESS config through. A fake "caddy"
    // that always succeeds must NOT make this pass; only caddy-naive's
    // (failing) result counts.
    const decoyCaddyPath = path.join(fakeBinDir, 'caddy');
    fs.writeFileSync(decoyCaddyPath, '#!/bin/sh\necho "Valid configuration"; exit 0\n', { mode: 0o755 });
    makeFakeCaddyNaive('echo "Error: adapting config using caddyfile: bad" 1>&2; exit 1');
    expect(caddyValidator(tmpConfigPath)).toBe(false);
  });

  test('is permissive when caddy-naive is not installed (dev/test environments)', () => {
    process.env.PATH = fakeBinDir; // no caddy-naive binary anywhere on PATH
    expect(caddyValidator(tmpConfigPath)).toBe(true);
  });
});
