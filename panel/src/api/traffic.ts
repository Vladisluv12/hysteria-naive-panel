import { get } from './client';
import type { TrafficResponse } from '../types/api';

export function getTraffic() {
  return get<TrafficResponse>('/api/traffic');
}
