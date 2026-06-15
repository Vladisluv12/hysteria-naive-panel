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
  getBypass: vi.fn().mockResolvedValue({ enabled: true, entries: 1200, file: '/etc/hysteria/bypass-ru.acl' }),
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
      expect(screen.getByText('Yes')).toBeDefined();
      expect(screen.getByText('1200')).toBeDefined();
    });
  });
  it('renders upload button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Upload & Enable')).toBeDefined());
  });
});
