import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UsersPage } from './index';
import { UserTable } from './components/UserTable';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';
import * as systemApi from '../../api/system';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(), logout: vi.fn(),
}));
vi.mock('../../api/naive', () => ({
  listUsers: vi.fn().mockResolvedValue({ users: [{ username: 'user1', password: 'pass1', expiresAt: '2026-12-31', expired: false, createdAt: '2026-01-01', remainingSec: 86400 }] }),
  createUser: vi.fn(), deleteUser: vi.fn(), updateUser: vi.fn(),
}));
vi.mock('../../api/hysteria', () => ({
  listUsers: vi.fn().mockResolvedValue({ users: [] }),
  createUser: vi.fn(), deleteUser: vi.fn(), updateUser: vi.fn(),
}));
vi.mock('../../api/system', () => ({
  getConfig: vi.fn().mockResolvedValue({ domain: 'example.com', installed: true, stack: { naive: true, hy2: false }, port: 443 }),
  getTraffic: vi.fn(),
  getStatus: vi.fn(), getVersion: vi.fn(), serviceAction: vi.fn(),
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

function renderUserTable(overrides: Partial<Parameters<typeof UserTable>[0]> = {}) {
  const props = {
    users: [
      { username: 'alice', password: 'pass1', expiresAt: '2026-12-31', expired: false, createdAt: '2026-01-01' },
      { username: 'bob', password: 'pass2', expiresAt: null, expired: false, createdAt: '2026-02-01' },
    ],
    trafficByUser: {} as Record<string, { rx: number; tx: number; conns: number; rxFormatted: string; txFormatted: string; totalFormatted: string }>,
    onExtend: vi.fn(),
    onDelete: vi.fn(),
    onCopyLink: vi.fn().mockReturnValue('proto://link'),
    ...overrides,
  };
  return render(<ToastProvider><UserTable {...props} /></ToastProvider>);
}

describe('UserTable', () => {
  it('renders RX, TX, Active column headers', () => {
    renderUserTable();
    expect(screen.getByText('RX')).toBeDefined();
    expect(screen.getByText('TX')).toBeDefined();
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('shows formatted traffic values when data exists', () => {
    renderUserTable({
      trafficByUser: {
        alice: { rx: 1536, tx: 512, conns: 3, rxFormatted: '1.5 KB', txFormatted: '512 B', totalFormatted: '2.0 KB' },
      },
    });
    expect(screen.getByText('1.5 KB')).toBeDefined();
    expect(screen.getByText('512 B')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
  });

  it('shows — when no traffic data exists for a user', () => {
    renderUserTable();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(6);
  });

  it('shows — for missing trafficByUser entry even when other users have data', () => {
    renderUserTable({
      trafficByUser: {
        alice: { rx: 100, tx: 200, conns: 1, rxFormatted: '100 B', txFormatted: '200 B', totalFormatted: '300 B' },
      },
    });
    expect(screen.getByText('100 B')).toBeDefined();
    expect(screen.getByText('200 B')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(3);
  });
});

describe('UsersPage traffic', () => {
  beforeEach(() => {
    vi.mocked(systemApi.getTraffic).mockReset();
  });

  it('passes per-user traffic data to UserTable', async () => {
    vi.mocked(systemApi.getTraffic).mockResolvedValue({
      perUser: {
        naive: {
          users: {
            user1: { rx: 1536, tx: 512, conns: 3, rxFormatted: '1.5 KB', txFormatted: '512 B', totalFormatted: '2.0 KB' },
          },
          updated_at: Date.now(),
        },
      },
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('1.5 KB')).toBeDefined();
      expect(screen.getByText('512 B')).toBeDefined();
      expect(screen.getByText('3')).toBeDefined();
    });
  });

  it('shows — when getTraffic fails without crashing', async () => {
    vi.mocked(systemApi.getTraffic).mockRejectedValue(new Error('Network error'));

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('user1')).toBeDefined();
    });
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows — when getTraffic returns no perUser data', async () => {
    vi.mocked(systemApi.getTraffic).mockResolvedValue({});

    renderPage();
    await waitFor(() => {
      expect(screen.getByText('user1')).toBeDefined();
    });
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
