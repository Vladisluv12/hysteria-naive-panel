'use strict';

import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formatBytes } from '../traffic.js';

const TMP_DIR = '/tmp/rixxx-traffic-test';

beforeEach(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  process.env.TEST_CONFIG_DIR = TMP_DIR;
  process.env.VITEST = '1';
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.TEST_CONFIG_DIR;
  delete process.env.VITEST;
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
    const naiveFile = path.join(TMP_DIR, 'traffic.json');
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
    const naiveFile = path.join(TMP_DIR, 'traffic.json');
    fs.writeFileSync(naiveFile, JSON.stringify({ users: {}, updated_at: 0 }));

    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();
    expect(result).toEqual({ users: {}, updated_at: 0 });
  });

  test('handles corrupted JSON gracefully', async () => {
    const naiveFile = path.join(TMP_DIR, 'traffic.json');
    fs.writeFileSync(naiveFile, 'not-valid-json{{{');

    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();
    expect(result).toEqual({ users: {}, updated_at: null });
  });

  test('handles missing users key', async () => {
    const naiveFile = path.join(TMP_DIR, 'traffic.json');
    fs.writeFileSync(naiveFile, JSON.stringify({ updated_at: 123 }));

    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();
    expect(result).toEqual({ users: {}, updated_at: null });
  });

  test('handles partially written file (race with atomic rename)', async () => {
    const naiveFile = path.join(TMP_DIR, 'traffic.json');
    // Simulate a truncated write (partial JSON)
    fs.writeFileSync(naiveFile, '{"users":{"alice":{"rx":100,"tx":');

    const { collectNaiveUsers } = await import('../traffic.js');
    const result = collectNaiveUsers();
    expect(result).toEqual({ users: {}, updated_at: null });
  });
});

function startHy2MockServer(handlers) {
  return new Promise((resolve, reject) => {
    const { createServer } = require('http');
    const server = createServer((req, res) => {
      const handler = handlers[req.url];
      if (handler) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(handler));
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

describe('collectHy2Users', () => {
  test('returns empty users when hysteria config file is missing', async () => {
    const { collectHy2Users } = await import('../traffic.js');
    const result = await collectHy2Users();
    expect(result).toEqual({ users: {}, updated_at: null });
  });

  test('returns empty users when config has no trafficStats', async () => {
    const configPath = path.join(TMP_DIR, 'config.yaml');
    fs.writeFileSync(configPath, 'listen: :443\nacme:\n  domains: [example.com]\n');

    const { collectHy2Users } = await import('../traffic.js');
    const result = await collectHy2Users();
    expect(result).toEqual({ users: {}, updated_at: null });
  });

  test('handles API errors gracefully (returns empty)', async () => {
    const configPath = path.join(TMP_DIR, 'config.yaml');
    fs.writeFileSync(configPath, `trafficStats:\n  listen: :19999\n`);

    const { collectHy2Users } = await import('../traffic.js');
    const result = await collectHy2Users();
    expect(result).toEqual({ users: {}, updated_at: null });
  });

  test('parses hysteria2 API response correctly', async () => {
    const { server, port } = await startHy2MockServer({
      '/traffic': { alice: { rx: 1000, tx: 2000 }, bob: { rx: 500, tx: 300 } },
      '/online': { alice: 2, bob: 1 },
    });

    const configPath = path.join(TMP_DIR, 'config.yaml');
    fs.writeFileSync(configPath, `trafficStats:\n  listen: :${port}\n`);

    try {
      const { collectHy2Users } = await import('../traffic.js');
      const result = await collectHy2Users();

      expect(result.users).toHaveProperty('alice');
      expect(result.users.alice.rx).toBe(1000);
      expect(result.users.alice.tx).toBe(2000);
      expect(result.users.alice.conns).toBe(2);
      expect(result.users.alice.rxFormatted).toBeDefined();
      expect(result.users.alice.txFormatted).toBeDefined();
      expect(result.users.alice.totalFormatted).toBeDefined();

      expect(result.users).toHaveProperty('bob');
      expect(result.users.bob.rx).toBe(500);
      expect(result.users.bob.tx).toBe(300);
      expect(result.users.bob.conns).toBe(1);
    } finally {
      server.close();
    }
  });

  test('handles missing online endpoint gracefully', async () => {
    const { server, port } = await startHy2MockServer({
      '/traffic': { alice: { rx: 100, tx: 200 } },
    });

    const configPath = path.join(TMP_DIR, 'config.yaml');
    fs.writeFileSync(configPath, `trafficStats:\n  listen: :${port}\n`);

    try {
      const { collectHy2Users } = await import('../traffic.js');
      const result = await collectHy2Users();

      expect(result.users).toHaveProperty('alice');
      expect(result.users.alice.rx).toBe(100);
      expect(result.users.alice.tx).toBe(200);
      expect(result.users.alice.conns).toBe(0);
    } finally {
      server.close();
    }
  });
});

describe('getTraffic', () => {
  test('includes perUser.hy2 in response', async () => {
    const { getTraffic } = await import('../traffic.js');
    const result = await getTraffic();

    expect(result).toHaveProperty('perUser');
    expect(result.perUser).toHaveProperty('hy2');
    expect(result.perUser.hy2).toHaveProperty('users');
    expect(typeof result.perUser.hy2.users).toBe('object');
  });

  test('includes perUser.naive in response', async () => {
    const { getTraffic } = await import('../traffic.js');
    const result = await getTraffic();

    expect(result).toHaveProperty('perUser');
    expect(result.perUser).toHaveProperty('naive');
    expect(result.perUser.naive).toHaveProperty('users');
    expect(typeof result.perUser.naive.users).toBe('object');
  });
});
