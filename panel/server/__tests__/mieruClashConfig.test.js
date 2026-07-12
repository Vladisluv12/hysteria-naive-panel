'use strict';

import { describe, test, expect } from 'vitest';
import yaml from 'js-yaml';
import { buildMieruClashConfig } from '../controllers/mieruController.js';

function makeCfg(overrides = {}) {
  return {
    domain: 'example.com',
    port: 443,
    mieruPort: 9443,
    ...overrides,
  };
}

function makeUser(overrides = {}) {
  return {
    username: 'alice',
    password: 'pass1234',
    nickname: '',
    ...overrides,
  };
}

describe('buildMieruClashConfig', () => {
  test('produces a Clash/mihomo-compatible mieru proxy entry', () => {
    const yamlStr = buildMieruClashConfig(makeCfg(), makeUser());
    const parsed = yaml.load(yamlStr);
    expect(parsed.proxies).toHaveLength(1);
    const p = parsed.proxies[0];
    expect(p.type).toBe('mieru');
    expect(p.server).toBe('example.com');
    expect(p.port).toBe(9443);
    expect(p.transport).toBe('TCP');
    expect(p.username).toBe('alice');
    expect(p.password).toBe('pass1234');
    expect(p.multiplexing).toBe('MULTIPLEXING_HIGH');
    // Clash/mihomo's mieru proxy type does not accept both port and
    // port-range at once — must only emit one.
    expect(p['port-range']).toBeUndefined();
  });

  test('uses nickname as the proxy name when set, falls back to username', () => {
    const withNick = yaml.load(buildMieruClashConfig(makeCfg(), makeUser({ nickname: 'My Phone' })));
    expect(withNick.proxies[0].name).toBe('My Phone');

    const noNick = yaml.load(buildMieruClashConfig(makeCfg(), makeUser({ nickname: '' })));
    expect(noNick.proxies[0].name).toBe('alice');
  });

  test('falls back to cfg.port when mieruPort is not set', () => {
    const parsed = yaml.load(buildMieruClashConfig(makeCfg({ mieruPort: undefined, port: 443 }), makeUser()));
    expect(parsed.proxies[0].port).toBe(443);
  });
});
