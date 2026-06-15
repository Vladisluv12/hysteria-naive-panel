import { get, post, patch, del } from './client';
import type { NaiveUser, CreateUserInput } from '../types/api';

export function listUsers(): Promise<NaiveUser[]> {
  return get('/api/naive/users');
}

export function createUser(data: CreateUserInput): Promise<NaiveUser> {
  return post('/api/naive/users', data);
}

export function deleteUser(username: string): Promise<void> {
  return del(`/api/naive/users/${encodeURIComponent(username)}`);
}

export function updateUser(username: string, data: { expiry: string | null }): Promise<NaiveUser> {
  return patch(`/api/naive/users/${encodeURIComponent(username)}`, data);
}
