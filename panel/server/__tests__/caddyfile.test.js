'use strict';

import { describe, test, expect } from 'vitest';
import { extractCustomBlocks } from '../caddyfile.js';

describe('extractCustomBlocks', () => {
  test('returns empty string for empty input', () => {
    expect(extractCustomBlocks('', 'proxy.com', 'panel.com')).toBe('');
    expect(extractCustomBlocks(null, 'proxy.com', 'panel.com')).toBe('');
    expect(extractCustomBlocks(undefined, 'proxy.com', 'panel.com')).toBe('');
  });

  test('returns empty when only managed blocks exist', () => {
    const input = `{
  order forward_proxy before file_server
  servers {
    protocols h1 h2
  }
}

:443, proxy.com {
  tls admin@proxy.com
  forward_proxy {
    basic_auth user pass
    hide_ip
    hide_via
    probe_resistance
  }
  file_server {
    root /var/www/html
  }
}

panel.com {
  tls admin@proxy.com
  encode gzip
  reverse_proxy 127.0.0.1:3000
}
`;
    expect(extractCustomBlocks(input, 'proxy.com', 'panel.com')).toBe('');
  });

  test('preserves custom WARP block alongside managed blocks', () => {
    const input = `{
  order forward_proxy before file_server
}

:443, myproxy.com {
  tls admin@myproxy.com
  forward_proxy {
    basic_auth user pass
  }
  file_server {
    root /var/www/html
  }
}

warp.example.com {
  tls admin@myproxy.com
  reverse_proxy 127.0.0.1:4000
  header_up X-Real-IP {remote_host}
}
`;
    const result = extractCustomBlocks(input, 'myproxy.com', 'panel.com');
    expect(result).toContain('warp.example.com');
    expect(result).toContain('reverse_proxy 127.0.0.1:4000');
    expect(result).not.toContain(':443, myproxy.com');
    expect(result).not.toContain('order forward_proxy');
  });

  test('preserves multiple custom blocks', () => {
    const input = `:443, p.com {
  tls a@p.com
  forward_proxy {
    basic_auth u p
  }
  file_server { root /var/www/html }
}

other.com {
  reverse_proxy /api/ 127.0.0.1:8080
}

another.net {
  reverse_proxy 10.0.0.1:80
}
`;
    const result = extractCustomBlocks(input, 'p.com', null);
    expect(result).toContain('other.com');
    expect(result).toContain('another.net');
    expect(result).not.toContain(':443, p.com');
  });

  test('handles content with no managed blocks', () => {
    const input = `legacy.example.com {
  reverse_proxy 127.0.0.1:9000
}
`;
    const result = extractCustomBlocks(input, 'proxy.com', 'panel.com');
    expect(result).toContain('legacy.example.com');
  });

  test('handles panelDomain same as domain', () => {
    const input = `:443, s.com {
  tls a@s.com
  forward_proxy { basic_auth u p }
  file_server { root /var/www/html }
}
`;
    const result = extractCustomBlocks(input, 's.com', 's.com');
    expect(result).toBe('');
  });
});
