import { get, post } from './client';
import type { TuningStatus } from '../types/api';

export function getStatus(): Promise<TuningStatus> {
  return get('/api/tuning/status');
}

export function applyTuning(): Promise<void> {
  return post('/api/tuning/apply');
}
