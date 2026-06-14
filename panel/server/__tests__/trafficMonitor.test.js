'use strict';

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseIptablesLine, needsRules, formatBytes } from '../trafficMonitor.js';

describe('parseIptablesLine', () => {
  test('parses INPUT rule with matching comment', () => {
    const line = '   100    50000            tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:443 /* RIXXX_NAIVE_IN */';
    const result = parseIptablesLine(line, 'RIXXX_NAIVE_IN');
    expect(result).toEqual({ pkts: 100, bytes: 50000 });
  });

  test('parses OUTPUT rule with matching comment', () => {
    const line = '  50    25000            tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp spt:443 /* RIXXX_NAIVE_OUT */';
    const result = parseIptablesLine(line, 'RIXXX_NAIVE_OUT');
    expect(result).toEqual({ pkts: 50, bytes: 25000 });
  });

  test('parses UDP rule', () => {
    const line = '   10    5000             udp  --  *      *       0.0.0.0/0            0.0.0.0/0            udp dpt:443 /* RIXXX_HY2_IN */';
    const result = parseIptablesLine(line, 'RIXXX_HY2_IN');
    expect(result).toEqual({ pkts: 10, bytes: 5000 });
  });

  test('returns null for non-matching comment', () => {
    const line = '  100    50000            tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:443 /* RIXXX_NAIVE_IN */';
    const result = parseIptablesLine(line, 'RIXXX_HY2_IN');
    expect(result).toBeNull();
  });

  test('returns null for chain header line', () => {
    const line = 'Chain INPUT (policy ACCEPT 1234 packets, 56789 bytes)';
    const result = parseIptablesLine(line, 'RIXXX_NAIVE_IN');
    expect(result).toBeNull();
  });

  test('returns null for column header line', () => {
    const line = 'pkts      bytes target     prot opt in     out     source               destination';
    const result = parseIptablesLine(line, 'RIXXX_NAIVE_IN');
    expect(result).toBeNull();
  });

  test('handles zero counters', () => {
    const line = '   0        0                tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:443 /* RIXXX_NAIVE_IN */';
    const result = parseIptablesLine(line, 'RIXXX_NAIVE_IN');
    expect(result).toEqual({ pkts: 0, bytes: 0 });
  });

  test('handles large byte counts', () => {
    const line = '  500  1073741824            tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:443 /* RIXXX_NAIVE_IN */';
    const result = parseIptablesLine(line, 'RIXXX_NAIVE_IN');
    expect(result).toEqual({ pkts: 500, bytes: 1073741824 });
  });
});

describe('parseIptablesLine — real output simulation', () => {
  const SAMPLE_INPUT = `Chain INPUT (policy ACCEPT 0 packets, 0 bytes)
    pkts      bytes target     prot opt in     out     source               destination
   1200  60000000            tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:443 /* RIXXX_NAIVE_IN */
   3400  170000000            udp  --  *      *       0.0.0.0/0            0.0.0.0/0            udp dpt:443 /* RIXXX_HY2_IN */`;

  const SAMPLE_OUTPUT = `Chain OUTPUT (policy ACCEPT 0 packets, 0 bytes)
    pkts      bytes target     prot opt in     out     source               destination
    800  40000000            tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp spt:443 /* RIXXX_NAIVE_OUT */
   1700  85000000            udp  --  *      *       0.0.0.0/0            0.0.0.0/0            udp spt:443 /* RIXXX_HY2_OUT */`;

  test('parses all four counters from real-looking output', () => {
    const lines = [...SAMPLE_INPUT.split('\n'), ...SAMPLE_OUTPUT.split('\n')];

    const naiveIn = lines.map(l => parseIptablesLine(l, 'RIXXX_NAIVE_IN')).find(Boolean);
    const naiveOut = lines.map(l => parseIptablesLine(l, 'RIXXX_NAIVE_OUT')).find(Boolean);
    const hy2In = lines.map(l => parseIptablesLine(l, 'RIXXX_HY2_IN')).find(Boolean);
    const hy2Out = lines.map(l => parseIptablesLine(l, 'RIXXX_HY2_OUT')).find(Boolean);

    expect(naiveIn).toEqual({ pkts: 1200, bytes: 60000000 });
    expect(naiveOut).toEqual({ pkts: 800, bytes: 40000000 });
    expect(hy2In).toEqual({ pkts: 3400, bytes: 170000000 });
    expect(hy2Out).toEqual({ pkts: 1700, bytes: 85000000 });
  });
});

describe('needsRules', () => {
  test('detects missing rules when find returns nothing', () => {
    expect(needsRules('', 'RIXXX_NAIVE_IN')).toBe(true);
  });

  test('returns false when rule already exists', () => {
    const output = 'tcp dpt:443 /* RIXXX_NAIVE_IN */';
    expect(needsRules(output, 'RIXXX_NAIVE_IN')).toBe(false);
  });

  test('returns true when different comment exists', () => {
    const output = 'tcp dpt:443 /* RIXXX_HY2_IN */';
    expect(needsRules(output, 'RIXXX_NAIVE_IN')).toBe(true);
  });
});

describe('formatBytes', () => {
  test('formats 0', () => expect(formatBytes(0)).toBe('0 B'));
  test('formats bytes', () => expect(formatBytes(500)).toBe('500 B'));
  test('formats KB', () => expect(formatBytes(2048)).toBe('2.0 KB'));
  test('formats MB', () => expect(formatBytes(5242880)).toBe('5.0 MB'));
  test('formats GB', () => expect(formatBytes(2147483648)).toBe('2.0 GB'));
});
