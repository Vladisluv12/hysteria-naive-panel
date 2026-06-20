import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../api/system', () => ({
  getStatus: vi.fn().mockResolvedValue({
    installed: true,
    stack: { naive: true, hy2: true },
    domain: 'example.com',
    email: 'admin@example.com',
    serverIp: '1.2.3.4',
    arch: 'x64',
    port: 443,
    naive: { active: true, usersCount: 5 },
    hy2: { active: true, usersCount: 3 },
  }),
  getTraffic: vi.fn().mockResolvedValue({}),
  serviceAction: vi.fn().mockResolvedValue(undefined),
  getConfig: vi.fn(),
  getVersion: vi.fn(),
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <DashboardPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('DashboardPage', () => {
  it('renders service status', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getAllByText('NaiveProxy').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Hysteria2').length).toBeGreaterThan(0);
    });
  });

  it('renders server info', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('example.com')).toBeDefined();
      expect(screen.getByText('1.2.3.4')).toBeDefined();
    });
  });
});
