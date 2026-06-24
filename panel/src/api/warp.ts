import { get, post, put } from './client';

export interface WarpStatus {
  active: boolean;
  warpOn: boolean;
  warpIp: string;
  realIp: string;
  error?: string;
}

export interface WarpConfig {
  enabled: boolean;
  domains: string[];
  cidrs: string[];
}

export function getWarpStatus(): Promise<WarpStatus> {
  return get('/api/warp/status');
}

export function getWarpConfig(): Promise<WarpConfig> {
  return get('/api/warp/config');
}

export function updateWarpConfig(config: WarpConfig): Promise<WarpConfig> {
  return put('/api/warp/config', config);
}

export function startWarp(): Promise<{ ok: boolean; error?: string }> {
  return post('/api/warp/start');
}

export function stopWarp(): Promise<{ ok: boolean; error?: string }> {
  return post('/api/warp/stop');
}

export function restartWarp(): Promise<{ ok: boolean; error?: string }> {
  return post('/api/warp/restart');
}

export function warpAction(action: string): Promise<{ ok: boolean; error?: string }> {
  return post(`/api/warp/${action}`);
}
