import { get } from './client';
import type { LogsResponse, PortsResponse, HysteriaConfigResponse, CaddyfileResponse } from '../types/api';

export function getLogs(kind: string): Promise<LogsResponse> {
  return get(`/api/logs/${kind}`);
}

export function getPorts(): Promise<PortsResponse> {
  return get('/api/diag/ports');
}

export function getHysteriaConfig(): Promise<HysteriaConfigResponse> {
  return get('/api/diag/hysteria-config');
}

export function getCaddyfile(): Promise<CaddyfileResponse> {
  return get('/api/diag/caddyfile');
}
