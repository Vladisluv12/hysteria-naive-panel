import { get, post, patch, del } from './client';
import type { HysteriaUserListResponse, CreateUserResponse, UpdateUserResponse, DeleteUserResponse, CreateUserInput } from '../types/api';

export function listUsers(): Promise<HysteriaUserListResponse> {
  return get('/api/mieru/users');
}

export function createUser(data: CreateUserInput): Promise<CreateUserResponse> {
  return post('/api/mieru/users', data);
}

export function deleteUser(username: string): Promise<DeleteUserResponse> {
  return del(`/api/mieru/users/${encodeURIComponent(username)}`);
}

export function updateUser(username: string, data: { expireDays?: number }): Promise<UpdateUserResponse> {
  return patch(`/api/mieru/users/${encodeURIComponent(username)}`, data);
}

// mieru's own share link isn't a universal GUI import format — third-party
// clients (Clash Verge Rev, mihomo, Karing, etc.) import mieru as a Clash-
// style proxy config file instead. Session auth is cookie-based, so a plain
// same-origin navigation to this URL is enough to trigger the download.
export function getUserClashConfigUrl(username: string): string {
  return `/api/mieru/users/${encodeURIComponent(username)}/clash-config`;
}
