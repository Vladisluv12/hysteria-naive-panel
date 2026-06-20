import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AclPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(), logout: vi.fn(),
}));
vi.mock('../../api/acl', () => ({
  getAcl: vi.fn().mockResolvedValue({
    enabled: true,
    blockDomains: ['vk.com', 'instagram.com'],
    blockGeosite: ['netflix'],
    blockGeoip: ['cn'],
    blockPrivateIPs: true,
    directCidrs: ['10.0.0.0/8', '192.168.0.0/16'],
    directAll: true,
    updatedAt: '2026-06-16T12:00:00Z',
    geoSetsExist: true,
  }),
  updateAcl: vi.fn().mockResolvedValue({}),
  geoUpdate: vi.fn().mockResolvedValue({ success: true, geoip: true, geosite: true }),
  getGeositeList: vi.fn().mockResolvedValue({
    categories: ['netflix', 'youtube', 'twitter', 'facebook', 'instagram', 'tiktok',
      'spotify', 'discord', 'telegram', 'whatsapp', 'amazon', 'microsoft',
      'apple', 'google', 'cloudflare', 'openai', 'category-games'],
  }),
  getGeoipList: vi.fn().mockResolvedValue({
    countries: ['cn', 'ru', 'ir', 'kp', 'cu', 'sy', 'by', 'af', 've', 'mm'],
  }),
}));

function renderPage() {
  return render(<MemoryRouter><AuthProvider><ToastProvider><AclPage /></ToastProvider></AuthProvider></MemoryRouter>);
}

describe('AclPage', () => {
  it('renders ACL status as enabled', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('ACL включён')).toBeDefined();
    });
  });

  it('renders geosite and geoip checkboxes', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('netflix')).toBeDefined();
      expect(screen.getByText('youtube')).toBeDefined();
      expect(screen.getByText('CN')).toBeDefined();
      expect(screen.getByText('RU')).toBeDefined();
    });
  });

  it('renders save and geo update buttons', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Сохранить ACL')).toBeDefined();
      expect(screen.getByText('Обновить geoip/geosite')).toBeDefined();
    });
  });

  it('renders private IPs checkbox', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Блокировать приватные диапазоны IP')).toBeDefined();
    });
  });

  it('renders ACL preview section', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Предпросмотр ACL-файла')).toBeDefined();
    });
  });
});
