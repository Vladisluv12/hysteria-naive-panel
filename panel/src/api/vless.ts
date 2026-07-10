import { get, post, patch, del } from './client';
import type { HysteriaUserListResponse, CreateUserResponse, UpdateUserResponse, DeleteUserResponse, CreateUserInput } from '../types/api';

export function listUsers(): Promise<HysteriaUserListResponse> {
  return get('/api/vless/users');
}

export function createUser(data: CreateUserInput): Promise<CreateUserResponse> {
  return post('/api/vless/users', data);
}

export function deleteUser(username: string): Promise<DeleteUserResponse> {
  return del(`/api/vless/users/${encodeURIComponent(username)}`);
}

export function updateUser(username: string, data: { expireDays?: number }): Promise<UpdateUserResponse> {
  return patch(`/api/vless/users/${encodeURIComponent(username)}`, data);
}
