import { get, post } from './client';
import type { ChangePasswordInput } from '../types/api';

interface LoginInput {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  message?: string;
  mustChangePassword?: boolean;
}

interface UserMe {
  username: string;
  role: string;
}

export function login(data: LoginInput): Promise<LoginResponse> {
  return post('/api/login', data);
}

export function logout(): Promise<void> {
  return post('/api/logout');
}

export function me(): Promise<UserMe> {
  return get('/api/me');
}

export function changePassword(data: ChangePasswordInput): Promise<void> {
  return post('/api/config/change-password', data);
}
