import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BypassPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(), logout: vi.fn(),
}));
vi.mock('../../api/bypass', () => ({
  getBypass: vi.fn().mockResolvedValue({
    enabled: true,
    count: 1200,
    source: 'antifilter.download',
    updatedAt: '2026-01-01T00:00:00Z',
    preview: ['1.2.3.0/24'],
  }),
  updateBypass: vi.fn().mockResolvedValue(undefined),
  clearBypass: vi.fn().mockResolvedValue(undefined),
}));

function renderPage() {
  return render(<MemoryRouter><AuthProvider><ToastProvider><BypassPage /></ToastProvider></AuthProvider></MemoryRouter>);
}

describe('BypassPage', () => {
  it('renders bypass status', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Активен')).toBeDefined();
      expect(screen.getByText('1200')).toBeDefined();
    });
  });
  it('renders upload button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Загрузить и включить')).toBeDefined());
  });
});
