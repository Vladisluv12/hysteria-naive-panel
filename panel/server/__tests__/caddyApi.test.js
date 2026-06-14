'use strict';

import { describe, test, expect } from 'vitest';
import { reloadCaddy, getConfig, createCaddyApi } from '../services/caddyApi.js';

function stubHttp(statusCode, responseBody) {
  return {
    request: (_opts, cb) => {
      const res = {
        statusCode,
        on: (evt, handler) => {
          if (evt === 'data') handler(responseBody);
          if (evt === 'end') handler();
        },
      };
      const req = {
        on: (_evt, _handler) => {},
        write: () => {},
        setTimeout: () => {},
        end: () => setTimeout(() => cb(res), 0),
      };
      return req;
    },
  };
}

describe('createCaddyApi / reloadCaddy', () => {
  test('returns success when /load returns 200', async () => {
    const api = createCaddyApi(stubHttp(200, ''));
    const result = await api.reloadCaddy('# caddyfile content');
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('returns error when /load returns non-200', async () => {
    const api = createCaddyApi(stubHttp(400, 'invalid config'));
    const result = await api.reloadCaddy('# bad caddyfile');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('returns error on connection refused', async () => {
    const http = {
      request: (_opts, _cb) => {
        const req = {
          on: (evt, handler) => { if (evt === 'error') handler(new Error('ECONNREFUSED')); },
          write: () => {},
          setTimeout: () => {},
          end: () => {},
        };
        return req;
      },
    };
    const api = createCaddyApi(http);
    const result = await api.reloadCaddy('content');
    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  test('handles timeout', async () => {
    const http = {
      request: (_opts, _cb) => {
        const req = {
          on: (evt, handler) => { if (evt === 'timeout') handler(); },
          write: () => {},
          setTimeout: () => {},
          end: () => {},
        };
        return req;
      },
    };
    const api = createCaddyApi(http);
    const result = await api.reloadCaddy('content');
    expect(result.success).toBe(false);
  });
});

describe('getConfig', () => {
  test('returns parsed config on success', async () => {
    const api = createCaddyApi(stubHttp(200, JSON.stringify({ apps: { http: {} } })));
    const result = await api.getConfig();
    expect(result.success).toBe(true);
    expect(result.config.apps.http).toBeDefined();
  });

  test('returns error on failure', async () => {
    const api = createCaddyApi(stubHttp(500, ''));
    const result = await api.getConfig();
    expect(result.success).toBe(false);
  });
});
