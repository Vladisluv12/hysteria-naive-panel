import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DiagnosticsPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../api/diagnostics', () => ({
  getLogs: vi.fn().mockResolvedValue([
    { timestamp: '', line: 'log line 1' },
    { timestamp: '', line: 'log line 2' },
  ]),
  getPorts: vi.fn().mockResolvedValue([]),
  getHysteriaConfig: vi.fn().mockResolvedValue({ raw: 'config content' }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <DiagnosticsPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('DiagnosticsPage', () => {
  it('renders log tabs and loads caddy logs by default', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('log line 1')).toBeDefined();
      expect(screen.getByText('log line 2')).toBeDefined();
    });
  });

  it('can switch to ports tab', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByText('Порты'));
    await waitFor(() => {
      expect(screen.getByText('Порты и сервисы')).toBeDefined();
    });
  });
});
