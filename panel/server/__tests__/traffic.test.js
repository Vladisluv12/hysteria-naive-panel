'use strict';

import { describe, test, expect } from 'vitest';
import { formatBytes } from '../traffic.js';

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
