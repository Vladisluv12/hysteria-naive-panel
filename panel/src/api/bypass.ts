import { get, post, del } from './client';
import type { BypassStatus } from '../types/api';

export function getBypass(): Promise<BypassStatus> {
  return get('/api/bypass');
}

export function updateBypass(data: { content: string }): Promise<BypassStatus> {
  return post('/api/bypass', data);
}

export function clearBypass(): Promise<void> {
  return del('/api/bypass');
}
