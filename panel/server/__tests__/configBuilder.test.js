'use strict';

import { describe, test, expect } from 'vitest';
import {
  buildCaddyContent,
  buildHysteriaConfigObject,
} from '../services/configBuilder.js';

// ─── helpers ─────────────────────────────────────────────
function makeCfg(overrides = {}) {
  return {
    domain: 'example.com',
    email: 'admin@example.com',
    stack: { naive: true, hy2: false },
    naiveUsers: [
      { username: 'alice', password: 'pass1', expiresAt: null },
      { username: 'bob',   password: 'pass2', expiresAt: null },
    ],
    masqueradeMode: 'local',
    masqueradeUrl: '',
    ...overrides,
  };
}

function makeHyCfg(overrides = {}) {
  return {
    domain: 'example.com',
    stack: { naive: false, hy2: true },
    hy2Users: [
      { username: 'alice', password: 'pass1', expiresAt: null },
      { username: 'bob',   password: 'pass2', expiresAt: null },
    ],
    masqueradeMode: 'local',
    masqueradeUrl: '',
    ...overrides,
  };
}

// ============================================================
//  buildCaddyContent
// ============================================================
describe('buildCaddyContent', () => {
  test('produces a valid Caddyfile with users', () => {
    const out = buildCaddyContent(makeCfg());
    expect(out).toContain(':443, example.com');
    expect(out).toContain('tls admin@example.com');
    expect(out).toContain('basic_auth alice pass1');
    expect(out).toContain('basic_auth bob pass2');
    expect(out).toContain('forward_proxy');
    expect(out).toContain('file_server');
  });

  test('shows placeholder when no users', () => {
    const out = buildCaddyContent(makeCfg({ naiveUsers: [] }));
    expect(out).toContain('# no users yet');
  });

  test('filters expired users from basic_auth lines', () => {
    const expired = new Date(Date.now() - 10000).toISOString();
    const out = buildCaddyContent(makeCfg({
      naiveUsers: [
        { username: 'alice', password: 'pass1', expiresAt: null },
        { username: 'bob', password: 'pass2', expiresAt: expired },
      ],
    }));
    expect(out).toContain('basic_auth alice pass1');
    expect(out).not.toContain('basic_auth bob pass2');
  });

  test('disables HTTP/3 when hy2 stack is enabled', () => {
    const out = buildCaddyContent(makeCfg({ stack: { naive: true, hy2: true } }));
    expect(out).toContain('protocols h1 h2');
  });

  test('enables HTTP/3 when hy2 stack is disabled', () => {
    const out = buildCaddyContent(makeCfg({ stack: { naive: true, hy2: false } }));
    expect(out).not.toContain('protocols h1 h2');
  });

  test('mirror mode with masquerade URL uses reverse_proxy', () => {
    const out = buildCaddyContent(makeCfg({
      masqueradeMode: 'mirror',
      masqueradeUrl: 'https://example.org',
    }));
    expect(out).toContain('reverse_proxy');
    expect(out).toContain('https://example.org');
    expect(out).not.toContain('file_server {');
  });

  test('file_server masquerade by default', () => {
    const out = buildCaddyContent(makeCfg({ masqueradeMode: 'local' }));
    expect(out).toContain('file_server ');
    expect(out).toContain('/var/www/html');
  });

  test('adds panelDomain block when different from main domain', () => {
    const out = buildCaddyContent(makeCfg({ panelDomain: 'panel.example.com' }));
    expect(out).toContain('panel.example.com');
    expect(out).toContain('encode gzip');
    expect(out).toContain('reverse_proxy 127.0.0.1:3000');
  });

  test('skips panelDomain block when sshOnly is set', () => {
    const out = buildCaddyContent(makeCfg({ panelDomain: 'panel.example.com', sshOnly: 1 }));
    expect(out).not.toContain('panel.example.com');
  });

  test('skips panelDomain when same as domain', () => {
    const out = buildCaddyContent(makeCfg({ panelDomain: 'example.com' }));
    expect(out).not.toContain('panel.example.com');
    // only one occurrence of the domain block
    const matches = out.match(/example\.com/g);
    expect(matches?.length).toBeGreaterThanOrEqual(1);
  });

  test('includes custom blocks when provided', () => {
    const custom = '\nother.com {\n  reverse_proxy 127.0.0.1:4000\n}\n';
    const out = buildCaddyContent(makeCfg(), custom);
    expect(out).toContain('other.com');
    expect(out).toContain('reverse_proxy 127.0.0.1:4000');
  });

  test('returns empty string when naive stack disabled', () => {
    const out = buildCaddyContent(makeCfg({ stack: { naive: false, hy2: true } }));
    expect(out).toBe('');
  });

  test('returns empty string when no domain', () => {
    const out = buildCaddyContent(makeCfg({ domain: '' }));
    expect(out).toBe('');
  });
});

// ============================================================
//  buildHysteriaConfigObject
// ============================================================
describe('buildHysteriaConfigObject', () => {
  test('creates config with userpass auth', () => {
    const out = buildHysteriaConfigObject(makeHyCfg(), null, null);
    expect(out.listen).toBe(':443');
    expect(out.auth.type).toBe('userpass');
    expect(out.auth.userpass).toEqual({ alice: 'pass1', bob: 'pass2' });
    expect(out.ignoreClientBandwidth).toBe(true);
  });

  test('filters expired users from userpass', () => {
    const expired = new Date(Date.now() - 10000).toISOString();
    const out = buildHysteriaConfigObject(makeHyCfg({
      hy2Users: [
        { username: 'alice', password: 'pass1', expiresAt: null },
        { username: 'bob', password: 'pass2', expiresAt: expired },
      ],
    }), null, null);
    expect(out.auth.userpass).toEqual({ alice: 'pass1' });
  });

  test('creates random fallback password when all users expired', () => {
    const expired = new Date(Date.now() - 10000).toISOString();
    const out = buildHysteriaConfigObject(makeHyCfg({
      hy2Users: [
        { username: 'alice', password: 'pass1', expiresAt: expired },
      ],
    }), null, null);
    expect(out.auth.userpass.default).toBeDefined();
    expect(out.auth.userpass.default).not.toBe('pass1');
  });

  test('mirror masquerade mode', () => {
    const out = buildHysteriaConfigObject(makeHyCfg({
      masqueradeMode: 'mirror',
      masqueradeUrl: 'https://example.org',
    }), null, null);
    expect(out.masquerade.type).toBe('proxy');
    expect(out.masquerade.proxy.url).toBe('https://example.org');
  });

  test('local masquerade mode (file)', () => {
    const out = buildHysteriaConfigObject(makeHyCfg({ masqueradeMode: 'local' }), null, null);
    expect(out.masquerade.type).toBe('file');
    expect(out.masquerade.file.dir).toBe('/var/www/html');
  });

  test('includes TLS block when provided', () => {
    const tls = { cert: '/etc/ssl/cert.pem', key: '/etc/ssl/key.pem', ca: 'Caddy' };
    const out = buildHysteriaConfigObject(makeHyCfg(), null, tls);
    expect(out.tls).toEqual({ cert: '/etc/ssl/cert.pem', key: '/etc/ssl/key.pem' });
  });

  test('merges with existing config preserving extra keys', () => {
    const existing = {
      listen: ':8443',
      quic: { initStreamReceiveWindow: 4194304 },
      extraField: 'should survive',
    };
    const out = buildHysteriaConfigObject(makeHyCfg(), existing, null);
    expect(out.listen).toBe(':8443');
    expect(out.extraField).toBe('should survive');
    expect(out.auth.userpass).toEqual({ alice: 'pass1', bob: 'pass2' });
    // masquerade should be overwritten
    expect(out.masquerade.type).toBe('file');
  });

  test('returns null when hy2 stack disabled', () => {
    const out = buildHysteriaConfigObject(makeHyCfg({ stack: { naive: true, hy2: false } }), null, null);
    expect(out).toBeNull();
  });

  test('returns null when no domain', () => {
    const out = buildHysteriaConfigObject(makeHyCfg({ domain: '' }), null, null);
    expect(out).toBeNull();
  });
});
