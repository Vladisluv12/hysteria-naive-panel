import { get, post } from './client';

interface LoginInput {
  username: string;
  password: string;
}

interface UserMe {
  username: string;
  role: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function login(data: LoginInput): Promise<UserMe> {
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
