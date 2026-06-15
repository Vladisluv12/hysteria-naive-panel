import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UsersPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(), logout: vi.fn(),
}));
vi.mock('../../api/naive', () => ({
  listUsers: vi.fn().mockResolvedValue([{ username: 'user1', password: 'pass1', expiry: '2026-12-31', expired: false, created: '2026-01-01' }]),
  createUser: vi.fn(), deleteUser: vi.fn(), updateUser: vi.fn(),
}));
vi.mock('../../api/hysteria', () => ({
  listUsers: vi.fn().mockResolvedValue([]),
  createUser: vi.fn(), deleteUser: vi.fn(), updateUser: vi.fn(),
}));
vi.mock('../../api/system', () => ({
  getConfig: vi.fn().mockResolvedValue({ proxyDomain: 'example.com' }),
}));

function renderPage() {
  return render(<MemoryRouter initialEntries={['/users/naive']}><AuthProvider><ToastProvider><UsersPage /></ToastProvider></AuthProvider></MemoryRouter>);
}

describe('UsersPage', () => {
  it('renders user table with data', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('user1')).toBeDefined();
    });
  });
  it('renders add user button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('+ Добавить пользователя')).toBeDefined());
  });
});
