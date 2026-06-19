import { get, post, del } from './client';
import type { BypassStatus, BypassUpdateInput, BypassUpdateResponse } from '../types/api';

export function getBypass(): Promise<BypassStatus> {
  return get('/api/bypass');
}

export function updateBypass(data: BypassUpdateInput): Promise<BypassUpdateResponse> {
  return post('/api/bypass', data);
}

export function clearBypass(): Promise<void> {
  return del('/api/bypass');
}
