import { get, put, post } from './client';
import type { AclConfig, AclUpdateInput, GeoSiteCategory, GeoIpCountry } from '../types/api';

export function getAcl(): Promise<AclConfig> {
  return get('/api/acl');
}

export function updateAcl(data: AclUpdateInput): Promise<AclConfig> {
  return put('/api/acl', data);
}

export function geoUpdate(): Promise<{ success: boolean; geoip: boolean; geosite: boolean }> {
  return post('/api/acl/geo-update');
}

export function getGeositeList(): Promise<GeoSiteCategory> {
  return get('/api/acl/geosite-list');
}

export function getGeoipList(): Promise<GeoIpCountry> {
  return get('/api/acl/geoip-list');
}
