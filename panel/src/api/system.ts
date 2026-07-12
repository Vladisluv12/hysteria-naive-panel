import { get, post } from './client';
import type { SystemStatus, Config, VersionInfo, TrafficResponse, ServiceStatusResponse } from '../types/api';

export function getStatus(): Promise<SystemStatus> {
  return get('/api/status');
}

export function getServiceStatus(kind: string): Promise<ServiceStatusResponse> {
  return get(`/api/status/service/${kind}`);
}

export function getConfig(): Promise<Config> {
  return get('/api/config');
}

export function getVersion(): Promise<VersionInfo> {
  return get('/api/system/version');
}

export function getTraffic(): Promise<TrafficResponse> {
  return get('/api/traffic');
}

export function serviceAction(kind: string, action: string): Promise<void> {
  return post(`/api/service/${kind}/${action}`);
}
