'use strict';

import { describe, test, expect, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'acl-test-'));
process.env.TEST_CONFIG_DIR = TMP_DIR;

let aclBuilder;

beforeAll(async () => {
  aclBuilder = await import('../services/aclBuilder.js');
});

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
});

function makeAcl(overrides = {}) {
  return {
    enabled: true,
    blockDomains: ['vk.com', 'instagram.com'],
    blockGeosite: ['netflix'],
    blockGeoip: ['cn'],
    directAll: true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('aclBuilder', () => {
  describe('loadAcl / saveAcl', () => {
    test('loadAcl returns defaults when no file exists', () => {
      const acl = aclBuilder.loadAcl();
      expect(acl.enabled).toBe(false);
      expect(acl.blockDomains).toEqual([]);
      expect(acl.blockGeosite).toEqual([]);
      expect(acl.blockGeoip).toEqual([]);
      expect(acl.directAll).toBe(true);
    });

    test('saveAcl / loadAcl roundtrip', () => {
      const data = makeAcl();
      aclBuilder.saveAcl(data);
      const loaded = aclBuilder.loadAcl();
      expect(loaded.enabled).toBe(true);
      expect(loaded.blockDomains).toEqual(['vk.com', 'instagram.com']);
      expect(loaded.blockGeosite).toEqual(['netflix']);
      expect(loaded.blockGeoip).toEqual(['cn']);
    });

    test('loadAcl handles corrupted file', () => {
      const data = makeAcl();
      aclBuilder.saveAcl(data);
      const aclFile = path.join(TMP_DIR, 'acl.json');
      expect(fs.existsSync(aclFile)).toBe(true);
      fs.writeFileSync(aclFile, '{broken');
      const acl = aclBuilder.loadAcl();
      expect(acl.enabled).toBe(false);
      expect(acl.blockDomains).toEqual([]);
    });
  });

  describe('generateAclContent', () => {
    test('generates reject rules for domains', () => {
      const acl = makeAcl({ blockGeosite: [], blockGeoip: [] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(suffix:vk.com)');
      expect(content).toContain('reject(suffix:instagram.com)');
    });

    test('generates reject rules for geosite categories', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: ['netflix', 'youtube'], blockGeoip: [] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(geosite:netflix)');
      expect(content).toContain('reject(geosite:youtube)');
    });

    test('generates reject rules for geoip countries', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: [], blockGeoip: ['cn', 'ru'] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(geoip:cn)');
      expect(content).toContain('reject(geoip:ru)');
    });

    test('normalizes domains (strips http://, /path, www.)', () => {
      const acl = makeAcl({
        blockDomains: ['https://vk.com/', 'www.instagram.com/path', 'http://facebook.com'],
        blockGeosite: [],
        blockGeoip: [],
      });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(suffix:vk.com)');
      expect(content).toContain('reject(suffix:instagram.com)');
      expect(content).toContain('reject(suffix:facebook.com)');
    });

    test('adds direct(all) when directAll is true', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: [], blockGeoip: [], directAll: true });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('direct(all)');
    });

    test('omits direct(all) when directAll is false', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: [], blockGeoip: [], directAll: false });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).not.toContain('direct(all)');
    });

    test('skips empty rules when disabled', () => {
      const acl = makeAcl({ enabled: false, blockDomains: ['vk.com'], blockGeosite: ['netflix'], blockGeoip: ['cn'] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).not.toContain('reject(');
      expect(content).toContain('direct(all)');
    });

    test('filters invalid geosite categories', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: ['netflix', 'nonexistent'], blockGeoip: [] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(geosite:netflix)');
      expect(content).not.toContain('nonexistent');
    });

    test('filters invalid geoip countries', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: [], blockGeoip: ['cn', 'zz'] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(geoip:cn)');
      expect(content).not.toContain('zz');
    });
  });

  describe('hasBlockRules', () => {
    test('returns true when domains block rules exist', () => {
      const acl = makeAcl({ blockGeosite: [], blockGeoip: [] });
      aclBuilder.saveAcl(acl);
      expect(aclBuilder.hasBlockRules()).toBe(true);
    });

    test('returns true when geosite block rules exist', () => {
      const acl = makeAcl({ blockDomains: [], blockGeoip: [] });
      aclBuilder.saveAcl(acl);
      expect(aclBuilder.hasBlockRules()).toBe(true);
    });

    test('returns false when no rules or disabled', () => {
      const acl = makeAcl({ enabled: false, blockDomains: [], blockGeosite: [], blockGeoip: [] });
      aclBuilder.saveAcl(acl);
      expect(aclBuilder.hasBlockRules()).toBe(false);
    });
  });

  describe('needsGeoDatasets', () => {
    test('returns true when geosite rules exist', () => {
      aclBuilder.saveAcl(makeAcl({ blockDomains: [], blockGeoip: [] }));
      expect(aclBuilder.needsGeoDatasets()).toBe(true);
    });

    test('returns true when geoip rules exist', () => {
      aclBuilder.saveAcl(makeAcl({ blockDomains: [], blockGeosite: [] }));
      expect(aclBuilder.needsGeoDatasets()).toBe(true);
    });

    test('returns false when disabled', () => {
      aclBuilder.saveAcl(makeAcl({ enabled: false, blockGeosite: ['netflix'] }));
      expect(aclBuilder.needsGeoDatasets()).toBe(false);
    });
  });

  describe('writeAclFile', () => {
    test('writes acl file to disk', () => {
      aclBuilder.saveAcl(makeAcl());
      aclBuilder.writeAclFile();
      expect(fs.existsSync(aclBuilder.HY2_ACL_PATH)).toBe(true);
      const content = fs.readFileSync(aclBuilder.HY2_ACL_PATH, 'utf8');
      expect(content).toContain('reject(suffix:vk.com)');
      expect(content).toContain('direct(all)');
    });
  });

  describe('GEOSITE_CATEGORIES and GEOIP_COUNTRIES', () => {
    test('GEOSITE_CATEGORIES is an array of strings', () => {
      expect(Array.isArray(aclBuilder.GEOSITE_CATEGORIES)).toBe(true);
      expect(aclBuilder.GEOSITE_CATEGORIES.length).toBeGreaterThan(5);
      aclBuilder.GEOSITE_CATEGORIES.forEach(c => expect(typeof c).toBe('string'));
    });

    test('GEOIP_COUNTRIES is an array of 2-letter codes', () => {
      expect(Array.isArray(aclBuilder.GEOIP_COUNTRIES)).toBe(true);
      expect(aclBuilder.GEOIP_COUNTRIES.length).toBeGreaterThan(3);
      aclBuilder.GEOIP_COUNTRIES.forEach(c => {
        expect(typeof c).toBe('string');
        expect(c).toMatch(/^[a-z]{2}$/);
      });
    });
  });
});
