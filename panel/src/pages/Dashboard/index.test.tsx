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
    caddy: 'active', hysteria: 'active', panelUptime: '2h',
    serverIp: '1.2.3.4', domain: 'example.com',
  }),
  getTraffic: vi.fn().mockResolvedValue({
    caddy: { bytesIn: 1024, bytesOut: 2048, connections: 5 },
    hysteria: { packetsIn: 100, packetsOut: 200, connections: 3 },
  }),
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
      expect(screen.getByText('1.2.3.4')).toBeDefined();
    });
  });

  it('renders traffic data', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('1 KB')).toBeDefined();
    });
  });
});
