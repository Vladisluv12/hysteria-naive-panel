import { get, post, patch, del } from './client';
import type { HysteriaUser } from '../types/api';

interface CreateHysteriaInput {
  username: string;
  password: string;
  expiry: string | null;
}

export function listUsers(): Promise<HysteriaUser[]> {
  return get('/api/hy2/users');
}

export function createUser(data: CreateHysteriaInput): Promise<HysteriaUser> {
  return post('/api/hy2/users', data);
}

export function deleteUser(username: string): Promise<void> {
  return del(`/api/hy2/users/${encodeURIComponent(username)}`);
}

export function updateUser(username: string, data: { expiry: string | null }): Promise<HysteriaUser> {
  return patch(`/api/hy2/users/${encodeURIComponent(username)}`, data);
}
