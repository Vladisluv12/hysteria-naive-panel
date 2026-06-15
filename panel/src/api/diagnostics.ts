import { get } from './client';
import type { LogEntry } from '../types/api';

interface PortInfo {
  port: number;
  protocol: string;
  process: string;
}

interface HysteriaConfig {
  raw: string;
}

export function getLogs(kind: string): Promise<LogEntry[]> {
  return get(`/api/logs/${kind}`);
}

export function getPorts(): Promise<PortInfo[]> {
  return get('/api/diag/ports');
}

export function getHysteriaConfig(): Promise<HysteriaConfig> {
  return get('/api/diag/hysteria-config');
}
