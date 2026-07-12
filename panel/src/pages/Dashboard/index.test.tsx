import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';
import * as systemApi from '../../api/system';

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
    naive: { active: null, usersCount: 5 },
    hy2: { active: null, usersCount: 3 },
  }),
  getServiceStatus: vi.fn().mockResolvedValue({ active: true }),
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

beforeEach(() => {
  vi.mocked(systemApi.getServiceStatus).mockClear();
  vi.mocked(systemApi.getServiceStatus).mockResolvedValue({ active: true });
});

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

  it('shows the dashboard immediately without waiting for per-service status checks to resolve', async () => {
    // Service status checks never resolve (like a hung systemctl call) —
    // the dashboard blocks must still render right away.
    vi.mocked(systemApi.getServiceStatus).mockImplementation(() => new Promise(() => {}));

    renderDashboard();
    await waitFor(() => {
      expect(screen.getAllByText('NaiveProxy').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Loading...')).toBeNull();
    // Status is unknown until the per-block check resolves.
    expect(screen.getAllByText('проверка...').length).toBeGreaterThan(0);
  });

  it('checks each installed service independently on load', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(vi.mocked(systemApi.getServiceStatus)).toHaveBeenCalledWith('naive');
      expect(vi.mocked(systemApi.getServiceStatus)).toHaveBeenCalledWith('hy2');
    });
    await waitFor(() => {
      expect(screen.getAllByText('active').length).toBe(2);
    });
  });

  it('lets a single block refresh its own status via its refresh button', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getAllByText('active').length).toBe(2));

    vi.mocked(systemApi.getServiceStatus).mockClear();
    const refreshButtons = screen.getAllByTitle('Обновить статус');
    fireEvent.click(refreshButtons[0]);

    await waitFor(() => {
      expect(vi.mocked(systemApi.getServiceStatus)).toHaveBeenCalledTimes(1);
    });
  });

  it('does not show a per-user traffic breakdown, only per-protocol totals', async () => {
    vi.mocked(systemApi.getTraffic).mockResolvedValueOnce({
      perProto: {
        naive: { rx: 100, tx: 200, rxFormatted: '100 B', txFormatted: '200 B', totalFormatted: '300 B' },
      },
      perUser: {
        naive: {
          users: { alice: { rx: 1, tx: 2, conns: 1, rxFormatted: '1 B', txFormatted: '2 B', totalFormatted: '3 B' } },
          updated_at: Date.now(),
        },
      },
      connections: { naive: 1, hy2: 0 },
    });

    renderDashboard();
    await waitFor(() => expect(screen.getByText('Трафик')).toBeDefined());
    await waitFor(() => expect(screen.getByText('100 B')).toBeDefined());
    expect(screen.queryByText('alice')).toBeNull();
  });
});
