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
    blockPrivateIPs: true,
    directCidrs: ['10.0.0.0/8', '192.168.0.0/16'],
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
      expect(acl.blockPrivateIPs).toBe(true);
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
      expect(loaded.blockPrivateIPs).toBe(true);
      expect(loaded.directCidrs).toEqual(['10.0.0.0/8', '192.168.0.0/16']);
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
    test('generates reject rules for private IPs when blockPrivateIPs is true', () => {
      const acl = makeAcl({ enabled: false, directCidrs: [], directAll: false });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(10.0.0.0/8)');
      expect(content).toContain('reject(127.0.0.0/8)');
      expect(content).toContain('reject(172.16.0.0/12)');
      expect(content).toContain('reject(192.168.0.0/16)');
      expect(content).toContain('reject(::1/128)');
      expect(content).toContain('reject(fe80::/10)');
    });

    test('does not generate private IP rejects when blockPrivateIPs is false', () => {
      const acl = makeAcl({ blockPrivateIPs: false, enabled: false, directCidrs: [], directAll: false });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).not.toContain('reject(10.0.0.0/8)');
      expect(content).not.toContain('reject(192.168.0.0/16)');
    });

    test('generates reject rules for domains', () => {
      const acl = makeAcl({ blockGeosite: [], blockGeoip: [], directCidrs: [] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(suffix:vk.com)');
      expect(content).toContain('reject(suffix:instagram.com)');
    });

    test('generates reject rules for geosite categories', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: ['netflix', 'youtube'], blockGeoip: [], directCidrs: [] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(geosite:netflix)');
      expect(content).toContain('reject(geosite:youtube)');
    });

    test('generates reject rules for geoip countries', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: [], blockGeoip: ['cn', 'ru'], directCidrs: [] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(geoip:cn)');
      expect(content).toContain('reject(geoip:ru)');
    });

    test('generates direct rules for CIDRs', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: [], blockGeoip: [], directCidrs: ['8.8.8.0/24', '1.1.1.0/24'] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('direct(8.8.8.0/24)');
      expect(content).toContain('direct(1.1.1.0/24)');
    });

    test('normalizes domains (strips http://, /path, www.)', () => {
      const acl = makeAcl({
        blockDomains: ['https://vk.com/', 'www.instagram.com/path', 'http://facebook.com'],
        blockGeosite: [],
        blockGeoip: [],
        directCidrs: [],
      });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(suffix:vk.com)');
      expect(content).toContain('reject(suffix:instagram.com)');
      expect(content).toContain('reject(suffix:facebook.com)');
    });

    test('adds direct(all) when directAll is true', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: [], blockGeoip: [], directCidrs: [], directAll: true });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('direct(all)');
    });

    test('omits direct(all) when directAll is false', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: [], blockGeoip: [], directCidrs: [], directAll: false });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).not.toContain('direct(all)');
    });

    test('skips block rules when disabled but keeps private IPs and CIDRs', () => {
      const acl = makeAcl({ enabled: false, blockDomains: ['vk.com'], blockGeosite: ['netflix'], blockGeoip: ['cn'], directCidrs: ['8.8.8.0/24'] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).not.toContain('reject(suffix:vk.com)');
      expect(content).not.toContain('reject(geosite:netflix)');
      expect(content).toContain('reject(10.0.0.0/8)');
      expect(content).toContain('direct(8.8.8.0/24)');
      expect(content).toContain('direct(all)');
    });

    test('filters invalid geosite categories', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: ['netflix', 'nonexistent'], blockGeoip: [], directCidrs: [] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(geosite:netflix)');
      expect(content).not.toContain('nonexistent');
    });

    test('filters invalid geoip countries', () => {
      const acl = makeAcl({ blockDomains: [], blockGeosite: [], blockGeoip: ['cn', 'zz'], directCidrs: [] });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(geoip:cn)');
      expect(content).not.toContain('zz');
    });

    test('rule order: private IPs > domains > geosite > geoip > CIDRs > directAll', () => {
      const acl = makeAcl({
        blockDomains: ['example.com'],
        blockGeosite: ['netflix'],
        blockGeoip: ['cn'],
        directCidrs: ['8.8.8.0/24'],
        directAll: true,
      });
      const content = aclBuilder.generateAclContent(acl);
      const lines = content.trim().split('\n');
      const privateIdx = lines.indexOf('reject(10.0.0.0/8)');
      const domainIdx = lines.indexOf('reject(suffix:example.com)');
      const geositeIdx = lines.indexOf('reject(geosite:netflix)');
      const geoipIdx = lines.indexOf('reject(geoip:cn)');
      const cidrIdx = lines.indexOf('direct(8.8.8.0/24)');
      const directAllIdx = lines.indexOf('direct(all)');
      expect(privateIdx).toBeLessThan(domainIdx);
      expect(domainIdx).toBeLessThan(geositeIdx);
      expect(geositeIdx).toBeLessThan(geoipIdx);
      expect(geoipIdx).toBeLessThan(cidrIdx);
      expect(cidrIdx).toBeLessThan(directAllIdx);
    });

    test('excludes private CIDRs from direct rules when blockPrivateIPs is true', () => {
      const acl = makeAcl({
        blockPrivateIPs: true,
        directCidrs: ['10.0.0.0/8', '192.168.0.0/16', '8.8.8.0/24'],
        directAll: false,
      });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).toContain('reject(10.0.0.0/8)');
      expect(content).toContain('reject(192.168.0.0/16)');
      expect(content).not.toContain('direct(10.0.0.0/8)');
      expect(content).not.toContain('direct(192.168.0.0/16)');
      expect(content).toContain('direct(8.8.8.0/24)');
    });

    test('includes all CIDRs as direct when blockPrivateIPs is false', () => {
      const acl = makeAcl({
        blockPrivateIPs: false,
        directCidrs: ['10.0.0.0/8', '8.8.8.0/24'],
        directAll: false,
      });
      const content = aclBuilder.generateAclContent(acl);
      expect(content).not.toContain('reject(10.0.0.0/8)');
      expect(content).toContain('direct(10.0.0.0/8)');
      expect(content).toContain('direct(8.8.8.0/24)');
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

  describe('isValidCidr', () => {
    test('validates IPv4 CIDR', () => {
      expect(aclBuilder.isValidCidr('10.0.0.0/8')).toBe(true);
      expect(aclBuilder.isValidCidr('192.168.1.0/24')).toBe(true);
      expect(aclBuilder.isValidCidr('0.0.0.0/0')).toBe(true);
      expect(aclBuilder.isValidCidr('255.255.255.255/32')).toBe(true);
    });

    test('validates IPv6 CIDR', () => {
      expect(aclBuilder.isValidCidr('::1/128')).toBe(true);
      expect(aclBuilder.isValidCidr('fe80::/10')).toBe(true);
      expect(aclBuilder.isValidCidr('2001:db8::/32')).toBe(true);
    });

    test('rejects invalid CIDRs', () => {
      expect(aclBuilder.isValidCidr('not-a-cidr')).toBe(false);
      expect(aclBuilder.isValidCidr('10.0.0.0')).toBe(false);
      expect(aclBuilder.isValidCidr('')).toBe(false);
    });

    test('rejects out-of-range IPv4 octets', () => {
      expect(aclBuilder.isValidCidr('999.999.999.999/33')).toBe(false);
      expect(aclBuilder.isValidCidr('256.0.0.0/8')).toBe(false);
      expect(aclBuilder.isValidCidr('10.0.0.0/33')).toBe(false);
    });

    test('rejects out-of-range IPv6 prefix', () => {
      expect(aclBuilder.isValidCidr('::1/256')).toBe(false);
      expect(aclBuilder.isValidCidr('fe80::/200')).toBe(false);
    });
  });

  describe('dedupCidrs', () => {
    test('removes duplicate CIDRs', () => {
      expect(aclBuilder.dedupCidrs(['10.0.0.0/8', '10.0.0.0/8', '8.8.8.0/24'])).toEqual(['10.0.0.0/8', '8.8.8.0/24']);
    });

    test('preserves order', () => {
      expect(aclBuilder.dedupCidrs(['c', 'a', 'b', 'a'])).toEqual(['c', 'a', 'b']);
    });
  });

  describe('writeAclFile', () => {
    test('writes acl file to disk', () => {
      aclBuilder.saveAcl(makeAcl({ directCidrs: ['8.8.8.0/24'] }));
      aclBuilder.writeAclFile();
      expect(fs.existsSync(aclBuilder.HY2_ACL_PATH)).toBe(true);
      const content = fs.readFileSync(aclBuilder.HY2_ACL_PATH, 'utf8');
      expect(content).toContain('reject(suffix:vk.com)');
      expect(content).toContain('reject(10.0.0.0/8)');
      expect(content).toContain('direct(8.8.8.0/24)');
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

    test('PRIVATE_CIDRS contains 6 entries', () => {
      expect(Array.isArray(aclBuilder.PRIVATE_CIDRS)).toBe(true);
      expect(aclBuilder.PRIVATE_CIDRS).toHaveLength(6);
    });
  });
});
