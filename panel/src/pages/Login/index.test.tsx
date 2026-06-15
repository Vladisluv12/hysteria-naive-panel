import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockRejectedValue(new Error('not logged in')),
  login: vi.fn(),
  logout: vi.fn(),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  it('renders login form', async () => {
    renderLogin();
    expect(await screen.findByText('RIXXX Panel')).toBeDefined();
    expect(screen.getByLabelText('Username')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDefined();
  });
});
