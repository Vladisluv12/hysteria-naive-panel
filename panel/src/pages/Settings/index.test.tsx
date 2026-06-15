import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../api/system', () => ({
  getVersion: vi.fn().mockResolvedValue({ version: '1.4.1', targetVersion: '1.4.1' }),
}));

function renderSettings() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('SettingsPage', () => {
  it('renders change password form and version', async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText('Смена пароля панели')).toBeDefined();
      expect(screen.getByText(/1\.4\.1/)).toBeDefined();
    });
  });
});
