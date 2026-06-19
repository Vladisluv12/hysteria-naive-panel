import { get, post, patch, del } from './client';
import type { NaiveUserListResponse, CreateUserResponse, UpdateUserResponse, DeleteUserResponse, CreateUserInput } from '../types/api';

export function listUsers(): Promise<NaiveUserListResponse> {
  return get('/api/naive/users');
}

export function createUser(data: CreateUserInput): Promise<CreateUserResponse> {
  return post('/api/naive/users', data);
}

export function deleteUser(username: string): Promise<DeleteUserResponse> {
  return del(`/api/naive/users/${encodeURIComponent(username)}`);
}

export function updateUser(username: string, data: { expireDays?: number }): Promise<UpdateUserResponse> {
  return patch(`/api/naive/users/${encodeURIComponent(username)}`, data);
}
