import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TuningPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(), logout: vi.fn(),
}));
vi.mock('../../api/tuning', () => ({
  getStatus: vi.fn().mockResolvedValue({ bbr: true, udpBuffers: false }),
  applyTuning: vi.fn().mockResolvedValue(undefined),
}));

function renderPage() {
  return render(<MemoryRouter><AuthProvider><ToastProvider><TuningPage /></ToastProvider></AuthProvider></MemoryRouter>);
}

describe('TuningPage', () => {
  it('renders BBR and UDP status', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Включено')).toBeDefined();
      expect(screen.getByText('Выключено')).toBeDefined();
    });
  });
  it('has apply button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Применить тюнинг')).toBeDefined());
  });
});
