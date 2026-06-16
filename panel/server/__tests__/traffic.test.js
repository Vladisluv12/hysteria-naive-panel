'use strict';

import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formatBytes } from '../traffic.js';

const TMP_DIR = '/tmp/rixxx-traffic-test';

beforeEach(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  process.env.TEST_CONFIG_DIR = TMP_DIR;
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.TEST_CONFIG_DIR;
});

describe('formatBytes', () => {
  test('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  test('formats KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  test('formats MB', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });

  test('formats GB', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });

  test('formats fractional values', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2411724)).toBe('2.3 MB');
  });
});

describe('collectNaiveUsers', () => {
  test('returns empty object when file does not exist', async () => {
    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();
    expect(result).toEqual({ users: {}, updated_at: null });
  });

  test('parses valid traffic JSON with formatted fields', async () => {
    const naiveFile = path.join(TMP_DIR, 'naive_users.json');
    const data = {
      users: {
        alice: { rx: 1024, tx: 512, conns: 2 },
        bob: { rx: 2048, tx: 256, conns: 1 },
      },
      updated_at: 1718400000,
    };
    fs.writeFileSync(naiveFile, JSON.stringify(data));

    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();

    expect(result.users.alice.rx).toBe(1024);
    expect(result.users.alice.tx).toBe(512);
    expect(result.users.alice.conns).toBe(2);
    expect(result.users.alice.rxFormatted).toBe('1.0 KB');
    expect(result.users.alice.txFormatted).toBe('512.0 B');
    expect(result.users.alice.totalFormatted).toBe('1.5 KB');

    expect(result.users.bob.rxFormatted).toBe('2.0 KB');
    expect(result.users.bob.txFormatted).toBe('256.0 B');
    expect(result.users.bob.totalFormatted).toBe('2.3 KB');

    expect(result.updated_at).toBe(1718400000);
  });

  test('handles empty users object', async () => {
    const naiveFile = path.join(TMP_DIR, 'naive_users.json');
    fs.writeFileSync(naiveFile, JSON.stringify({ users: {}, updated_at: 0 }));

    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();
    expect(result).toEqual({ users: {}, updated_at: 0 });
  });

  test('handles corrupted JSON gracefully', async () => {
    const naiveFile = path.join(TMP_DIR, 'naive_users.json');
    fs.writeFileSync(naiveFile, 'not-valid-json{{{');

    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();
    expect(result).toEqual({ users: {}, updated_at: null });
  });

  test('handles missing users key', async () => {
    const naiveFile = path.join(TMP_DIR, 'naive_users.json');
    fs.writeFileSync(naiveFile, JSON.stringify({ updated_at: 123 }));

    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();
    expect(result).toEqual({ users: {}, updated_at: null });
  });

  test('handles partially written file (race with atomic rename)', async () => {
    const naiveFile = path.join(TMP_DIR, 'naive_users.json');
    // Simulate a truncated write (partial JSON)
    fs.writeFileSync(naiveFile, '{"users":{"alice":{"rx":100,"tx":');

    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();
    expect(result).toEqual({ users: {}, updated_at: null });
  });
});
