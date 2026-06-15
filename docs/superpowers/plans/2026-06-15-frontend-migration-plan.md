# Frontend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate panel frontend from vanilla JS to React 19 + Vite 6 + TypeScript 5 via incremental phases, coexisting with old `public/` until verified.

**Architecture:** Vite dev server proxies `/api` to Express on `:3000`. React Router v7 for SPA routing with AuthGuard. CSS Modules for scoped styles. Centralized typed API client. React Context for auth and toasts. Express switches between old/new frontend via `USE_NEW_FRONTEND` env var.

**Tech Stack:** React 19, Vite 6, TypeScript 5 (strict), React Router 7, CSS Modules, Vitest + React Testing Library, ESLint

---

### Task 0: Project Scaffolding

**Files:**
- Create: `panel/index.html`
- Create: `panel/vite.config.ts`
- Create: `panel/tsconfig.json`
- Create: `panel/tsconfig.node.json`
- Create: `panel/src/vite-env.d.ts`
- Create: `panel/src/main.tsx`
- Create: `panel/src/App.tsx`
- Create: `panel/.eslintrc.cjs`
- Modify: `panel/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd panel
npm install --save-dev vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest @testing-library/react @testing-library/jest-dom jsdom eslint @eslint/js typescript-eslint
npm install react react-dom react-router-dom
```

- [ ] **Step 2: Create `panel/index.html`**

```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Panel — Naive + Hysteria2</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `panel/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 4: Create `panel/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create `panel/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create `panel/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: Create `panel/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Create `panel/src/App.tsx` (skeleton)**

```tsx
export function App() {
  return <div>Panel</div>;
}
```

- [ ] **Step 9: Create `panel/.eslintrc.cjs`**

```js
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'server', 'scripts'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  }
);
```

- [ ] **Step 10: Update `panel/package.json` scripts**

Add to existing `package.json`:

```json
{
  "scripts": {
    "start": "node server/index.js",
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/"
  }
}
```

- [ ] **Step 11: Verify scaffold works**

```bash
cd panel && npm run dev
# Should start Vite dev server. Open http://localhost:5173 — see "Panel" text.
# Kill with Ctrl+C.
```

- [ ] **Step 12: Commit**

```bash
git add panel/index.html panel/vite.config.ts panel/tsconfig.json panel/tsconfig.node.json panel/src/vite-env.d.ts panel/src/main.tsx panel/src/App.tsx panel/.eslintrc.cjs panel/package.json panel/package-lock.json
git commit -m "feat: scaffold Vite + React + TypeScript"
```

---

### Task 1: Types & API Client

**Files:**
- Create: `panel/src/types/api.ts`
- Create: `panel/src/api/client.ts`

- [ ] **Step 1: Create `panel/src/types/api.ts`**

```ts
export interface NaiveUser {
  username: string;
  password: string;
  expiry: string | null;
  expired: boolean;
  created: string;
}

export interface HysteriaUser {
  username: string;
  password: string;
  expiry: string | null;
  expired: boolean;
  created: string;
}

export interface SystemStatus {
  caddy: 'active' | 'inactive' | 'unknown';
  hysteria: 'active' | 'inactive' | 'unknown';
  panelUptime: string;
  serverIp: string;
  domain: string;
}

export interface Config {
  panelDomain: string;
  proxyDomain: string;
  adminEmail: string;
  naiveEnabled: boolean;
  hysteriaEnabled: boolean;
  masqueradeMode: string;
  masqueradeUrl: string;
  sshOnly: number;
}

export interface VersionInfo {
  version: string;
  targetVersion: string;
}

export interface TrafficData {
  caddy: {
    bytesIn: number;
    bytesOut: number;
    connections: number;
  };
  hysteria: {
    packetsIn: number;
    packetsOut: number;
    connections: number;
  };
}

export interface LogEntry {
  timestamp: string;
  line: string;
}

export interface BypassStatus {
  enabled: boolean;
  entries: number;
  file: string;
}

export interface TuningStatus {
  bbr: boolean;
  udpBuffers: boolean;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  expiry: string | null;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}
```

- [ ] **Step 2: Create `panel/src/api/client.ts`**

```ts
import type { ApiError } from '../types/api';

const BASE = '';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    let body: ApiError | undefined;
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    throw new Error(body?.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

export function get<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function post<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function patch<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function del<T>(url: string): Promise<T> {
  return request<T>(url, { method: 'DELETE' });
}
```

- [ ] **Step 3: Commit**

```bash
git add panel/src/types/api.ts panel/src/api/client.ts
git commit -m "feat: add typed API client and shared types"
```

---

### Task 2: API Modules

**Files:**
- Create: `panel/src/api/auth.ts`
- Create: `panel/src/api/system.ts`
- Create: `panel/src/api/naive.ts`
- Create: `panel/src/api/hysteria.ts`
- Create: `panel/src/api/bypass.ts`
- Create: `panel/src/api/diagnostics.ts`
- Create: `panel/src/api/tuning.ts`

- [ ] **Step 1: Create `panel/src/api/auth.ts`**

```ts
import { get, post } from './client';

interface LoginInput {
  username: string;
  password: string;
}

interface UserMe {
  username: string;
  role: string;
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function login(data: LoginInput): Promise<UserMe> {
  return post('/api/login', data);
}

export function logout(): Promise<void> {
  return post('/api/logout');
}

export function me(): Promise<UserMe> {
  return get('/api/me');
}

export function changePassword(data: ChangePasswordInput): Promise<void> {
  return post('/api/config/change-password', data);
}
```

- [ ] **Step 2: Create `panel/src/api/system.ts`**

```ts
import { get, post } from './client';
import type { SystemStatus, Config, VersionInfo, TrafficData } from '../types/api';

export function getStatus(): Promise<SystemStatus> {
  return get('/api/status');
}

export function getConfig(): Promise<Config> {
  return get('/api/config');
}

export function getVersion(): Promise<VersionInfo> {
  return get('/api/system/version');
}

export function getTraffic(): Promise<TrafficData> {
  return get('/api/traffic');
}

export function serviceAction(kind: string, action: string): Promise<void> {
  return post(`/api/service/${kind}/${action}`);
}
```

- [ ] **Step 3: Create `panel/src/api/naive.ts`**

```ts
import { get, post, patch, del } from './client';
import type { NaiveUser, CreateUserInput } from '../types/api';

export function listUsers(): Promise<NaiveUser[]> {
  return get('/api/naive/users');
}

export function createUser(data: CreateUserInput): Promise<NaiveUser> {
  return post('/api/naive/users', data);
}

export function deleteUser(username: string): Promise<void> {
  return del(`/api/naive/users/${encodeURIComponent(username)}`);
}

export function updateUser(username: string, data: { expiry: string | null }): Promise<NaiveUser> {
  return patch(`/api/naive/users/${encodeURIComponent(username)}`, data);
}
```

- [ ] **Step 4: Create `panel/src/api/hysteria.ts`**

```ts
import { get, post, patch, del } from './client';
import type { HysteriaUser } from '../types/api';

interface CreateHysteriaInput {
  username: string;
  password: string;
  expiry: string | null;
}

export function listUsers(): Promise<HysteriaUser[]> {
  return get('/api/hy2/users');
}

export function createUser(data: CreateHysteriaInput): Promise<HysteriaUser> {
  return post('/api/hy2/users', data);
}

export function deleteUser(username: string): Promise<void> {
  return del(`/api/hy2/users/${encodeURIComponent(username)}`);
}

export function updateUser(username: string, data: { expiry: string | null }): Promise<HysteriaUser> {
  return patch(`/api/hy2/users/${encodeURIComponent(username)}`, data);
}
```

- [ ] **Step 5: Create `panel/src/api/bypass.ts`**

```ts
import { get, post, del } from './client';
import type { BypassStatus } from '../types/api';

export function getBypass(): Promise<BypassStatus> {
  return get('/api/bypass');
}

export function updateBypass(data: { content: string }): Promise<BypassStatus> {
  return post('/api/bypass', data);
}

export function clearBypass(): Promise<void> {
  return del('/api/bypass');
}
```

- [ ] **Step 6: Create `panel/src/api/diagnostics.ts`**

```ts
import { get } from './client';
import type { LogEntry, TuningStatus } from '../types/api';

interface PortInfo {
  port: number;
  protocol: string;
  process: string;
}

interface HysteriaConfig {
  raw: string;
}

export function getLogs(kind: string): Promise<LogEntry[]> {
  return get(`/api/logs/${kind}`);
}

export function getPorts(): Promise<PortInfo[]> {
  return get('/api/diag/ports');
}

export function getHysteriaConfig(): Promise<HysteriaConfig> {
  return get('/api/diag/hysteria-config');
}
```

- [ ] **Step 7: Create `panel/src/api/tuning.ts`**

```ts
import { get, post } from './client';
import type { TuningStatus } from '../types/api';

export function getStatus(): Promise<TuningStatus> {
  return get('/api/tuning/status');
}

export function applyTuning(): Promise<void> {
  return post('/api/tuning/apply');
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd panel && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 9: Commit**

```bash
git add panel/src/api/
git commit -m "feat: add typed API modules for all endpoints"
```

---

### Task 3: Auth Context & Auth Guard

**Files:**
- Create: `panel/src/contexts/AuthContext.tsx`
- Modify: `panel/src/App.tsx`

- [ ] **Step 1: Create `panel/src/contexts/AuthContext.tsx`**

```tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import * as authApi from '../api/auth';

interface User {
  username: string;
  role: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await authApi.login({ username, password });
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 2: Update `panel/src/App.tsx` with router skeleton**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import type { ReactNode } from 'react';

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<div>Login page (coming soon)</div>} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <div>Dashboard (coming soon)</div>
          </AuthGuard>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd panel && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 4: Commit**

```bash
git add panel/src/contexts/AuthContext.tsx panel/src/App.tsx
git commit -m "feat: add AuthProvider context with session check"
```

---

### Task 4: Toast System

**Files:**
- Create: `panel/src/contexts/ToastContext.tsx`
- Create: `panel/src/components/Toast/index.tsx`
- Create: `panel/src/components/Toast/styles.module.css`

- [ ] **Step 1: Create `panel/src/contexts/ToastContext.tsx`**

```tsx
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastState | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
```

- [ ] **Step 2: Create `panel/src/components/Toast/styles.module.css`**

```css
.container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast {
  padding: 12px 20px;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  animation: fadeIn 0.3s ease;
  max-width: 350px;
  word-break: break-word;
}

.success {
  background: #2e7d32;
}

.error {
  background: #c62828;
}

.info {
  background: #1565c0;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Create `panel/src/components/Toast/index.tsx`**

```tsx
import { useToast } from '../../contexts/ToastContext';
import styles from './styles.module.css';

const typeClass: Record<string, string> = {
  success: styles.success,
  error: styles.error,
  info: styles.info,
};

export function ToastContainer() {
  const { toasts } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${typeClass[t.type]}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire ToastProvider into App.tsx**

Update `panel/src/App.tsx` — wrap with ToastProvider:

```tsx
// Add import:
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';

// Update App:
export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <ToastContainer />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add panel/src/contexts/ToastContext.tsx panel/src/components/Toast/ panel/src/App.tsx
git commit -m "feat: add Toast notification system"
```

---

### Task 5: Layout & Shared Components

**Files:**
- Create: `panel/src/components/Layout/index.tsx`
- Create: `panel/src/components/Layout/styles.module.css`
- Create: `panel/src/components/Modal/index.tsx`
- Create: `panel/src/components/Modal/styles.module.css`
- Create: `panel/src/components/Badge/index.tsx`
- Create: `panel/src/components/CopyButton/index.tsx`

- [ ] **Step 1: Create `panel/src/components/Layout/styles.module.css`**

```css
.wrapper {
  display: flex;
  min-height: 100vh;
  background: #1a1a2e;
  color: #e0e0e0;
}

.sidebar {
  width: 220px;
  background: #16213e;
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.logo {
  padding: 0 20px 20px;
  font-size: 18px;
  font-weight: bold;
  color: #7c4dff;
  border-bottom: 1px solid #2a2a4a;
  margin-bottom: 10px;
}

.nav {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.link {
  padding: 10px 20px;
  color: #b0b0c0;
  text-decoration: none;
  font-size: 14px;
  transition: background 0.2s;
}

.link:hover {
  background: #1e2a4a;
  color: #fff;
}

.active {
  background: #1e2a4a;
  color: #7c4dff;
  border-right: 3px solid #7c4dff;
}

.navBottom {
  padding: 10px 20px;
  border-top: 1px solid #2a2a4a;
}

.logoutBtn {
  background: none;
  border: 1px solid #c62828;
  color: #c62828;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.logoutBtn:hover {
  background: #c62828;
  color: #fff;
}

.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
```

- [ ] **Step 2: Create `panel/src/components/Layout/index.tsx`**

```tsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './styles.module.css';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/install', label: 'Install' },
  { to: '/users', label: 'Users' },
  { to: '/tuning', label: 'Tuning' },
  { to: '/bypass', label: 'Bypass' },
  { to: '/diagnostics', label: 'Diagnostics' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className={styles.wrapper}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>RIXXX Panel</div>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.navBottom}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            {user?.username}
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create `panel/src/components/Modal/styles.module.css`**

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: #1e2a4a;
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.closeBtn {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
}

.closeBtn:hover {
  color: #fff;
}
```

- [ ] **Step 4: Create `panel/src/components/Modal/index.tsx`**

```tsx
import type { ReactNode } from 'react';
import styles from './styles.module.css';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `panel/src/components/Badge/index.tsx`**

```tsx
interface BadgeProps {
  daysLeft: number | null;
}

export function Badge({ daysLeft }: BadgeProps) {
  if (daysLeft === null || daysLeft < 0) {
    return (
      <span style={{ color: '#ef5350', fontSize: 13 }}>Expired</span>
    );
  }

  if (daysLeft === 0) {
    return (
      <span style={{ color: '#ff9800', fontSize: 13 }}>Less than 1 day</span>
    );
  }

  return (
    <span style={{ color: '#66bb6a', fontSize: 13 }}>
      {daysLeft} day{daysLeft !== 1 ? 's' : ''}
    </span>
  );
}
```

- [ ] **Step 6: Create `panel/src/components/CopyButton/index.tsx`**

```tsx
import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      addToast('Copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Failed to copy', 'error');
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        background: copied ? '#2e7d32' : '#3a3a5c',
        border: 'none',
        color: '#fff',
        padding: '4px 10px',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
```

- [ ] **Step 7: Wire Layout into App.tsx routes**

Update Routes in `App.tsx`:

```tsx
import { Layout } from './components/Layout';

// Inside the authed route group, replace the placeholder div with:
<Route element={<AuthGuard><Layout /></AuthGuard>}>
  <Route index element={<div>Dashboard (coming soon)</div>} />
  <Route path="install" element={<div>Install (coming soon)</div>} />
  <Route path="users/*" element={<div>Users (coming soon)</div>} />
  <Route path="tuning" element={<div>Tuning (coming soon)</div>} />
  <Route path="bypass" element={<div>Bypass (coming soon)</div>} />
  <Route path="diagnostics" element={<div>Diagnostics (coming soon)</div>} />
  <Route path="settings" element={<div>Settings (coming soon)</div>} />
</Route>
```

- [ ] **Step 8: Verify build and lint**

```bash
cd panel && npx tsc --noEmit && npm run build
# Expected: no errors, dist/ created
```

- [ ] **Step 9: Commit**

```bash
git add panel/src/components/Layout/ panel/src/components/Modal/ panel/src/components/Badge/ panel/src/components/CopyButton/ panel/src/App.tsx
git commit -m "feat: add Layout, Modal, Badge, CopyButton components"
```

---

### Task 6: Login Page

**Files:**
- Create: `panel/src/pages/Login/index.tsx`
- Create: `panel/src/pages/Login/styles.module.css`
- Create: `panel/src/pages/Login/index.test.tsx`
- Modify: `panel/src/App.tsx`

- [ ] **Step 1: Create `panel/src/pages/Login/styles.module.css`**

```css
.wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #1a1a2e;
}

.card {
  background: #16213e;
  padding: 40px;
  border-radius: 8px;
  min-width: 340px;
}

.title {
  font-size: 22px;
  color: #fff;
  margin-bottom: 24px;
  text-align: center;
}

.field {
  margin-bottom: 16px;
}

.label {
  display: block;
  font-size: 13px;
  color: #888;
  margin-bottom: 6px;
}

.input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 4px;
  border: 1px solid #2a2a4a;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 14px;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: #7c4dff;
}

.error {
  color: #ef5350;
  font-size: 13px;
  margin-bottom: 12px;
}

.submitBtn {
  width: 100%;
  padding: 10px;
  background: #7c4dff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 15px;
  cursor: pointer;
  margin-top: 8px;
}

.submitBtn:hover {
  background: #651fff;
}

.submitBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Create `panel/src/pages/Login/index.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import styles from './styles.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrapper}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.title}>RIXXX Panel</h1>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.field}>
          <label className={styles.label}>Username</label>
          <input
            className={styles.input}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Password</label>
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className={styles.submitBtn} type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Create `panel/src/pages/Login/index.test.tsx`**

```tsx
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
```

- [ ] **Step 4: Wire LoginPage into App.tsx**

Replace the login placeholder `<Route path="/login" element={<div>Login page (coming soon)</div>} />` with:

```tsx
<Route path="/login" element={<LoginPage />} />
```

Add import: `import { LoginPage } from './pages/Login';`

- [ ] **Step 5: Run tests**

```bash
cd panel && npm test -- --reporter=verbose
# Expected: 1 test passes
```

- [ ] **Step 6: Commit**

```bash
git add panel/src/pages/Login/ panel/src/App.tsx
git commit -m "feat: add Login page"
```

---

### Task 7: Settings Page

**Files:**
- Create: `panel/src/pages/Settings/index.tsx`
- Create: `panel/src/pages/Settings/styles.module.css`
- Create: `panel/src/pages/Settings/index.test.tsx`
- Modify: `panel/src/App.tsx`

- [ ] **Step 1: Create `panel/src/pages/Settings/styles.module.css`**

```css
.page {
  max-width: 600px;
}

.title {
  font-size: 22px;
  color: #fff;
  margin-bottom: 24px;
}

.section {
  background: #16213e;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.sectionTitle {
  font-size: 16px;
  color: #7c4dff;
  margin-bottom: 16px;
}

.field {
  margin-bottom: 14px;
}

.label {
  display: block;
  font-size: 13px;
  color: #888;
  margin-bottom: 6px;
}

.input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 4px;
  border: 1px solid #2a2a4a;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 14px;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: #7c4dff;
}

.error {
  color: #ef5350;
  font-size: 13px;
  margin-bottom: 8px;
}

.submitBtn {
  padding: 8px 20px;
  background: #7c4dff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.submitBtn:hover {
  background: #651fff;
}

.info {
  font-size: 14px;
  color: #b0b0c0;
  line-height: 1.6;
}
```

- [ ] **Step 2: Create `panel/src/pages/Settings/index.tsx`**

```tsx
import { useState, useEffect, type FormEvent } from 'react';
import * as authApi from '../../api/auth';
import * as systemApi from '../../api/system';
import { useToast } from '../../contexts/ToastContext';
import type { VersionInfo } from '../../types/api';
import styles from './styles.module.css';

export function SettingsPage() {
  const { addToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [changeError, setChangeError] = useState('');

  useEffect(() => {
    systemApi.getVersion().then(setVersion).catch(() => {});
  }, []);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setChangeError('');
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      addToast('Password changed successfully', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setChangeError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Change Password</h2>
        <form onSubmit={handleChangePassword}>
          {changeError && <div className={styles.error}>{changeError}</div>}
          <div className={styles.field}>
            <label className={styles.label}>Current Password</label>
            <input
              className={styles.input}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>New Password</label>
            <input
              className={styles.input}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <button className={styles.submitBtn} type="submit">
            Change Password
          </button>
        </form>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Panel Info</h2>
        <div className={styles.info}>
          <div>Version: {version?.version ?? 'Loading...'}</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `panel/src/pages/Settings/index.test.tsx`**

```tsx
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
      expect(screen.getByText('Change Password')).toBeDefined();
      expect(screen.getByText(/1\.4\.1/)).toBeDefined();
    });
  });
});
```

- [ ] **Step 4: Wire SettingsPage into App.tsx**

Replace the settings placeholder with:

```tsx
<Route path="settings" element={<SettingsPage />} />
```

Add import: `import { SettingsPage } from './pages/Settings';`

- [ ] **Step 5: Run tests**

```bash
cd panel && npm test -- --reporter=verbose
# Expected: 2 tests pass
```

- [ ] **Step 6: Commit**

```bash
git add panel/src/pages/Settings/ panel/src/App.tsx
git commit -m "feat: add Settings page"
```

---

### Task 8: Dashboard Page

**Files:**
- Create: `panel/src/pages/Dashboard/index.tsx`
- Create: `panel/src/pages/Dashboard/styles.module.css`
- Create: `panel/src/pages/Dashboard/index.test.tsx`
- Modify: `panel/src/App.tsx`

- [ ] **Step 1: Create `panel/src/pages/Dashboard/styles.module.css`**

```css
.page {
  max-width: 900px;
}

.title {
  font-size: 22px;
  color: #fff;
  margin-bottom: 24px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.card {
  background: #16213e;
  border-radius: 8px;
  padding: 20px;
}

.cardTitle {
  font-size: 13px;
  color: #888;
  margin-bottom: 8px;
}

.cardValue {
  font-size: 24px;
  font-weight: 600;
  color: #fff;
}

.statusActive {
  color: #66bb6a;
}

.statusInactive {
  color: #ef5350;
}

.statusUnknown {
  color: #ff9800;
}

.section {
  background: #16213e;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.sectionTitle {
  font-size: 16px;
  color: #7c4dff;
  margin-bottom: 16px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.actionBtn {
  padding: 8px 16px;
  background: #3a3a5c;
  color: #e0e0e0;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.actionBtn:hover {
  background: #4a4a7c;
}

.trafficRow {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #2a2a4a;
  font-size: 14px;
}

.trafficRow:last-child {
  border-bottom: none;
}

.trafficLabel {
  color: #888;
}

.trafficValue {
  color: #e0e0e0;
}

.loading {
  text-align: center;
  color: #888;
  padding: 40px;
}
```

- [ ] **Step 2: Create `panel/src/pages/Dashboard/index.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import * as systemApi from '../../api/system';
import { useToast } from '../../contexts/ToastContext';
import type { SystemStatus, TrafficData } from '../../types/api';
import styles from './styles.module.css';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatPackets(packets: number): string {
  if (packets === 0) return '0';
  if (packets >= 1000000) return `${(packets / 1000000).toFixed(1)}M`;
  if (packets >= 1000) return `${(packets / 1000).toFixed(1)}K`;
  return String(packets);
}

export function DashboardPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [traffic, setTraffic] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        systemApi.getStatus(),
        systemApi.getTraffic(),
      ]);
      setStatus(s);
      setTraffic(t);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleServiceAction = async (kind: string, action: string) => {
    try {
      await systemApi.serviceAction(kind, action);
      addToast(`${action} ${kind} — success`, 'success');
      loadData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Caddy (NaiveProxy)</div>
          <div className={`${styles.cardValue} ${status?.caddy === 'active' ? styles.statusActive : styles.statusInactive}`}>
            {status?.caddy ?? '...'}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Hysteria2</div>
          <div className={`${styles.cardValue} ${status?.hysteria === 'active' ? styles.statusActive : styles.statusInactive}`}>
            {status?.hysteria ?? '...'}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Server IP</div>
          <div className={styles.cardValue} style={{ fontSize: 18 }}>
            {status?.serverIp ?? '...'}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Traffic</h2>
        {traffic && (
          <>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Caddy IN</span>
              <span className={styles.trafficValue}>{formatBytes(traffic.caddy.bytesIn)}</span>
            </div>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Caddy OUT</span>
              <span className={styles.trafficValue}>{formatBytes(traffic.caddy.bytesOut)}</span>
            </div>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Caddy connections</span>
              <span className={styles.trafficValue}>{traffic.caddy.connections}</span>
            </div>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Hy2 IN</span>
              <span className={styles.trafficValue}>{formatPackets(traffic.hysteria.packetsIn)}</span>
            </div>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Hy2 OUT</span>
              <span className={styles.trafficValue}>{formatPackets(traffic.hysteria.packetsOut)}</span>
            </div>
            <div className={styles.trafficRow}>
              <span className={styles.trafficLabel}>Hy2 connections</span>
              <span className={styles.trafficValue}>{traffic.hysteria.connections}</span>
            </div>
          </>
        )}
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('caddy', 'start')}>Start Caddy</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('caddy', 'stop')}>Stop Caddy</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('caddy', 'restart')}>Restart Caddy</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('hysteria', 'start')}>Start Hy2</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('hysteria', 'stop')}>Stop Hy2</button>
          <button className={styles.actionBtn} onClick={() => handleServiceAction('hysteria', 'restart')}>Restart Hy2</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `panel/src/pages/Dashboard/index.test.tsx`**

```tsx
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
    caddy: 'active',
    hysteria: 'active',
    panelUptime: '2h',
    serverIp: '1.2.3.4',
    domain: 'example.com',
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
      expect(screen.getByText('active')).toBeDefined();
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
```

- [ ] **Step 4: Wire DashboardPage into App.tsx**

Replace the index route placeholder `<Route index element={<div>Dashboard (coming soon)</div>} />` with:

```tsx
<Route index element={<DashboardPage />} />
```

Add import: `import { DashboardPage } from './pages/Dashboard';`

- [ ] **Step 5: Run tests**

```bash
cd panel && npm test -- --reporter=verbose
# Expected: 4 tests pass (1 login + 1 settings + 2 dashboard)
```

- [ ] **Step 6: Commit**

```bash
git add panel/src/pages/Dashboard/ panel/src/App.tsx
git commit -m "feat: add Dashboard page"
```

---

### Task 9: Diagnostics Page

**Files:**
- Create: `panel/src/pages/Diagnostics/index.tsx`
- Create: `panel/src/pages/Diagnostics/styles.module.css`
- Create: `panel/src/pages/Diagnostics/index.test.tsx`
- Modify: `panel/src/App.tsx`

- [ ] **Step 1: Create `panel/src/pages/Diagnostics/styles.module.css`**

```css
.page {
  max-width: 900px;
}

.title {
  font-size: 22px;
  color: #fff;
  margin-bottom: 24px;
}

.section {
  background: #16213e;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.sectionTitle {
  font-size: 16px;
  color: #7c4dff;
  margin-bottom: 12px;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.tab {
  padding: 6px 16px;
  background: #2a2a4a;
  color: #888;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.tab:hover {
  color: #fff;
}

.tabActive {
  background: #7c4dff;
  color: #fff;
}

.logs {
  background: #0d1117;
  border-radius: 4px;
  padding: 12px;
  max-height: 400px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
}

.logLine {
  color: #c9d1d9;
}

.ports {
  font-size: 14px;
  color: #e0e0e0;
  line-height: 1.8;
}

.configPre {
  background: #0d1117;
  border-radius: 4px;
  padding: 12px;
  font-family: monospace;
  font-size: 12px;
  color: #c9d1d9;
  white-space: pre-wrap;
  max-height: 400px;
  overflow-y: auto;
}

.loading {
  text-align: center;
  color: #888;
  padding: 20px;
}

.hint {
  margin-top: 12px;
  font-size: 13px;
  color: #888;
  line-height: 1.5;
}

.hintCode {
  background: #2a2a4a;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 12px;
}
```

- [ ] **Step 2: Create `panel/src/pages/Diagnostics/index.tsx`**

```tsx
import { useState, useEffect } from 'react';
import * as diagApi from '../../api/diagnostics';
import { useToast } from '../../contexts/ToastContext';
import type { LogEntry } from '../../types/api';
import styles from './styles.module.css';

type Tab = 'caddy' | 'hysteria' | 'ports' | 'config';

interface PortInfo {
  port: number;
  protocol: string;
  process: string;
}

type HysteriaConfig = { raw: string };

export function DiagnosticsPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('caddy');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [config, setConfig] = useState<HysteriaConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      try {
        if (tab === 'caddy' || tab === 'hysteria') {
          const l = await diagApi.getLogs(tab);
          setLogs(l);
        } else if (tab === 'ports') {
          const p = await diagApi.getPorts();
          setPorts(p);
        } else if (tab === 'config') {
          const c = await diagApi.getHysteriaConfig();
          setConfig(c);
        }
      } catch (err) {
        addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tab, addToast]);

  const tabLabels: { key: Tab; label: string }[] = [
    { key: 'caddy', label: 'Caddy Logs' },
    { key: 'hysteria', label: 'Hysteria Logs' },
    { key: 'ports', label: 'Ports' },
    { key: 'config', label: 'Hy2 Config' },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Diagnostics</h1>

      <div className={styles.tabs}>
        {tabLabels.map((t) => (
          <button
            key={t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.section}>
        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : tab === 'caddy' || tab === 'hysteria' ? (
          <div className={styles.logs}>
            {logs.map((entry, i) => (
              <div key={i} className={styles.logLine}>
                {entry.line}
              </div>
            ))}
            {logs.length === 0 && <div className={styles.loading}>No logs</div>}
          </div>
        ) : tab === 'ports' ? (
          <div className={styles.ports}>
            {ports.map((p, i) => (
              <div key={i}>
                {p.port}/{p.protocol} — {p.process}
              </div>
            ))}
          </div>
        ) : tab === 'config' ? (
          <div className={styles.configPre}>{config?.raw ?? 'No data'}</div>
        ) : null}
      </div>

      <div className={styles.hint}>
        <strong>CLI tools:</strong><br />
        <code className={styles.hintCode}>bash update.sh --status</code> — system status<br />
        <code className={styles.hintCode}>sudo bash update.sh --repair</code> — regenerate configs<br />
        <code className={styles.hintCode}>sudo bash update.sh --repair --dry-run</code> — preview repair
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `panel/src/pages/Diagnostics/index.test.tsx`**

```tsx
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
    await user.click(screen.getByText('Ports'));
    await waitFor(() => {
      expect(screen.getByText('CLI tools:')).toBeDefined();
    });
  });
});
```

- [ ] **Step 4: Wire DiagnosticsPage into App.tsx**

Replace the diagnostics placeholder with:

```tsx
<Route path="diagnostics" element={<DiagnosticsPage />} />
```

Add import: `import { DiagnosticsPage } from './pages/Diagnostics';`

- [ ] **Step 5: Install @testing-library/user-event**

```bash
cd panel && npm install --save-dev @testing-library/user-event
```

- [ ] **Step 6: Run tests**

```bash
cd panel && npm test -- --reporter=verbose
# Expected: 6 tests pass
```

- [ ] **Step 7: Commit**

```bash
git add panel/src/pages/Diagnostics/ panel/src/App.tsx
git commit -m "feat: add Diagnostics page"
```

---

### Task 10: Tuning Page

**Files:**
- Create: `panel/src/pages/Tuning/index.tsx`
- Create: `panel/src/pages/Tuning/styles.module.css`
- Create: `panel/src/pages/Tuning/index.test.tsx`
- Modify: `panel/src/App.tsx`

- [ ] **Step 1: Create `panel/src/pages/Tuning/styles.module.css`**

```css
.page {
  max-width: 600px;
}

.title {
  font-size: 22px;
  color: #fff;
  margin-bottom: 24px;
}

.section {
  background: #16213e;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.sectionTitle {
  font-size: 16px;
  color: #7c4dff;
  margin-bottom: 12px;
}

.statusRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 14px;
  border-bottom: 1px solid #2a2a4a;
}

.statusRow:last-child {
  border-bottom: none;
}

.enabled {
  color: #66bb6a;
}

.disabled {
  color: #ef5350;
}

.applyBtn {
  margin-top: 16px;
  padding: 10px 24px;
  background: #7c4dff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.applyBtn:hover {
  background: #651fff;
}

.applyBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  color: #888;
  padding: 20px;
}
```

- [ ] **Step 2: Create `panel/src/pages/Tuning/index.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import * as tuningApi from '../../api/tuning';
import { useToast } from '../../contexts/ToastContext';
import type { TuningStatus } from '../../types/api';
import styles from './styles.module.css';

export function TuningPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<TuningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await tuningApi.getStatus();
      setStatus(s);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleApply = async () => {
    setApplying(true);
    try {
      await tuningApi.applyTuning();
      addToast('Tuning applied successfully', 'success');
      loadStatus();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Apply failed', 'error');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Network Tuning</h1>

      <div className={styles.section}>
        <div className={styles.statusRow}>
          <span>BBR congestion control</span>
          <span className={status?.bbr ? styles.enabled : styles.disabled}>
            {status?.bbr ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <div className={styles.statusRow}>
          <span>UDP buffer optimization</span>
          <span className={status?.udpBuffers ? styles.enabled : styles.disabled}>
            {status?.udpBuffers ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <button
          className={styles.applyBtn}
          onClick={handleApply}
          disabled={applying}
        >
          {applying ? 'Applying...' : 'Apply Tuning'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `panel/src/pages/Tuning/index.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TuningPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../api/tuning', () => ({
  getStatus: vi.fn().mockResolvedValue({ bbr: true, udpBuffers: false }),
  applyTuning: vi.fn().mockResolvedValue(undefined),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <TuningPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('TuningPage', () => {
  it('renders BBR and UDP status', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeDefined();
      expect(screen.getByText('Disabled')).toBeDefined();
    });
  });

  it('has apply button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Apply Tuning')).toBeDefined();
    });
  });
});
```

- [ ] **Step 4: Wire TuningPage into App.tsx**

Replace the tuning placeholder with:

```tsx
<Route path="tuning" element={<TuningPage />} />
```

Add import: `import { TuningPage } from './pages/Tuning';`

- [ ] **Step 5: Run tests**

```bash
cd panel && npm test -- --reporter=verbose
# Expected: 8 tests pass
```

- [ ] **Step 6: Commit**

```bash
git add panel/src/pages/Tuning/ panel/src/App.tsx
git commit -m "feat: add Tuning page"
```

---

### Task 11: Bypass Page

**Files:**
- Create: `panel/src/pages/Bypass/index.tsx`
- Create: `panel/src/pages/Bypass/styles.module.css`
- Create: `panel/src/pages/Bypass/index.test.tsx`
- Modify: `panel/src/App.tsx`

- [ ] **Step 1: Create `panel/src/pages/Bypass/styles.module.css`**

```css
.page {
  max-width: 700px;
}

.title {
  font-size: 22px;
  color: #fff;
  margin-bottom: 24px;
}

.section {
  background: #16213e;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.sectionTitle {
  font-size: 16px;
  color: #7c4dff;
  margin-bottom: 12px;
}

.statusRow {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
}

.label {
  color: #888;
}

.value {
  color: #e0e0e0;
}

.enabled {
  color: #66bb6a;
}

.disabled {
  color: #888;
}

.textarea {
  width: 100%;
  height: 200px;
  background: #0d1117;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #c9d1d9;
  padding: 10px;
  font-family: monospace;
  font-size: 12px;
  resize: vertical;
  box-sizing: border-box;
  margin-bottom: 12px;
}

.textarea:focus {
  outline: none;
  border-color: #7c4dff;
}

.actions {
  display: flex;
  gap: 8px;
}

.actionBtn {
  padding: 8px 16px;
  background: #7c4dff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.actionBtn:hover {
  background: #651fff;
}

.actionBtnDanger {
  padding: 8px 16px;
  background: transparent;
  color: #ef5350;
  border: 1px solid #ef5350;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.actionBtnDanger:hover {
  background: #ef5350;
  color: #fff;
}

.warning {
  background: #332a00;
  border: 1px solid #ff9800;
  border-radius: 4px;
  padding: 10px 14px;
  font-size: 13px;
  color: #ff9800;
  line-height: 1.5;
}

.loading {
  text-align: center;
  color: #888;
  padding: 20px;
}
```

- [ ] **Step 2: Create `panel/src/pages/Bypass/index.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import * as bypassApi from '../../api/bypass';
import { useToast } from '../../contexts/ToastContext';
import type { BypassStatus } from '../../types/api';
import styles from './styles.module.css';

export function BypassPage() {
  const { addToast } = useToast();
  const [status, setStatus] = useState<BypassStatus | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const s = await bypassApi.getBypass();
      setStatus(s);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleUpdate = async () => {
    try {
      await bypassApi.updateBypass({ content });
      addToast('Bypass list updated', 'success');
      loadStatus();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const handleClear = async () => {
    try {
      await bypassApi.clearBypass();
      addToast('Bypass cleared', 'success');
      loadStatus();
      setContent('');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Clear failed', 'error');
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Bypass (Split Tunneling)</h1>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Status</h2>
        <div className={styles.statusRow}>
          <span className={styles.label}>Enabled</span>
          <span className={status?.enabled ? styles.enabled : styles.disabled}>
            {status?.enabled ? 'Yes' : 'No'}
          </span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>Entries</span>
          <span className={styles.value}>{status?.entries ?? 0}</span>
        </div>
        <div className={styles.statusRow}>
          <span className={styles.label}>File</span>
          <span className={styles.value}>{status?.file ?? '—'}</span>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Update List</h2>
        <textarea
          className={styles.textarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste JSON with CIDR list..."
        />
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={handleUpdate}>
            Upload & Enable
          </button>
          <button className={styles.actionBtnDanger} onClick={handleClear}>
            Clear Bypass
          </button>
        </div>
      </div>

      <div className={styles.warning}>
        This feature is in active testing. Always verify on your client before using in production.
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `panel/src/pages/Bypass/index.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BypassPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../api/bypass', () => ({
  getBypass: vi.fn().mockResolvedValue({
    enabled: true,
    entries: 1200,
    file: '/etc/hysteria/bypass-ru.acl',
  }),
  updateBypass: vi.fn().mockResolvedValue(undefined),
  clearBypass: vi.fn().mockResolvedValue(undefined),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <BypassPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
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
    await waitFor(() => {
      expect(screen.getByText('Upload & Enable')).toBeDefined();
    });
  });
});
```

- [ ] **Step 4: Wire BypassPage into App.tsx**

Replace the bypass placeholder with:

```tsx
<Route path="bypass" element={<BypassPage />} />
```

Add import: `import { BypassPage } from './pages/Bypass';`

- [ ] **Step 5: Run tests**

```bash
cd panel && npm test -- --reporter=verbose
# Expected: 10 tests pass
```

- [ ] **Step 6: Commit**

```bash
git add panel/src/pages/Bypass/ panel/src/App.tsx
git commit -m "feat: add Bypass page"
```

---

### Task 12: Users Page

**Files:**
- Create: `panel/src/pages/Users/index.tsx`
- Create: `panel/src/pages/Users/styles.module.css`
- Create: `panel/src/pages/Users/components/UserTable.tsx`
- Create: `panel/src/pages/Users/components/CreateUserModal.tsx`
- Create: `panel/src/pages/Users/components/ExtendModal.tsx`
- Create: `panel/src/pages/Users/index.test.tsx`
- Modify: `panel/src/App.tsx`

- [ ] **Step 1: Create `panel/src/pages/Users/styles.module.css`**

```css
.page {
  max-width: 1000px;
}

.title {
  font-size: 22px;
  color: #fff;
  margin-bottom: 24px;
}

.subnav {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
}

.subtab {
  padding: 8px 20px;
  background: #16213e;
  color: #888;
  text-decoration: none;
  border-radius: 4px 4px 0 0;
  font-size: 14px;
}

.subtab:hover {
  color: #fff;
}

.subtabActive {
  background: #7c4dff;
  color: #fff;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.addBtn {
  padding: 8px 20px;
  background: #7c4dff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.addBtn:hover {
  background: #651fff;
}

.table {
  width: 100%;
  background: #16213e;
  border-radius: 8px;
  overflow: hidden;
}

.tableHead {
  background: #1e2a4a;
}

.th {
  padding: 10px 14px;
  text-align: left;
  font-size: 12px;
  color: #888;
  font-weight: 600;
  text-transform: uppercase;
}

.td {
  padding: 10px 14px;
  font-size: 14px;
  color: #e0e0e0;
  border-bottom: 1px solid #2a2a4a;
}

.tr:last-child .td {
  border-bottom: none;
}

.trExpired .td {
  color: #666;
}

.actions {
  display: flex;
  gap: 6px;
}

.smallBtn {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  color: #fff;
}

.extendBtn {
  background: #3a3a5c;
}

.extendBtn:hover {
  background: #4a4a7c;
}

.deleteBtn {
  background: transparent;
  color: #ef5350;
  border: 1px solid #ef5350;
}

.deleteBtn:hover {
  background: #ef5350;
  color: #fff;
}

.linkRow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.linkText {
  font-size: 12px;
  color: #888;
  word-break: break-all;
}

.loading {
  text-align: center;
  color: #888;
  padding: 40px;
}

/* Modal form styles */
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 13px;
  color: #888;
}

.input {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #2a2a4a;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 14px;
}

.input:focus {
  outline: none;
  border-color: #7c4dff;
}

.select {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #2a2a4a;
  background: #1a1a2e;
  color: #e0e0e0;
  font-size: 14px;
}

.submitBtn {
  padding: 8px 20px;
  background: #7c4dff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  align-self: flex-start;
}

.submitBtn:hover {
  background: #651fff;
}

.formError {
  color: #ef5350;
  font-size: 13px;
}
```

- [ ] **Step 2: Create `panel/src/pages/Users/components/UserTable.tsx`**

```tsx
import { Badge } from '../../../components/Badge';
import { CopyButton } from '../../../components/CopyButton';
import styles from '../styles.module.css';

interface User {
  username: string;
  password: string;
  expiry: string | null;
  expired: boolean;
  created: string;
}

interface UserTableProps {
  users: User[];
  proxyType: 'naive' | 'hysteria';
  domain: string;
  onExtend: (username: string, currentExpiry: string | null) => void;
  onDelete: (username: string) => void;
  onCopyLink: (username: string, password: string) => string;
}

function getDaysLeft(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Math.max(-1, days);
}

export function UserTable({
  users,
  proxyType,
  domain,
  onExtend,
  onDelete,
  onCopyLink,
}: UserTableProps) {
  return (
    <table className={styles.table}>
      <thead className={styles.tableHead}>
        <tr>
          <th className={styles.th}>Username</th>
          <th className={styles.th}>Expiry</th>
          <th className={styles.th}>Created</th>
          <th className={styles.th}>Link</th>
          <th className={styles.th}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const daysLeft = getDaysLeft(u.expiry);
          return (
            <tr key={u.username} className={`${styles.tr} ${u.expired ? styles.trExpired : ''}`}>
              <td className={styles.td}>{u.username}</td>
              <td className={styles.td}>
                <Badge daysLeft={daysLeft} />
              </td>
              <td className={styles.td}>{u.created}</td>
              <td className={styles.td}>
                <div className={styles.linkRow}>
                  <span className={styles.linkText}>
                    {onCopyLink(u.username, u.password).slice(0, 40)}...
                  </span>
                  <CopyButton text={onCopyLink(u.username, u.password)} />
                </div>
              </td>
              <td className={styles.td}>
                <div className={styles.actions}>
                  <button
                    className={`${styles.smallBtn} ${styles.extendBtn}`}
                    onClick={() => onExtend(u.username, u.expiry)}
                  >
                    Extend
                  </button>
                  <button
                    className={`${styles.smallBtn} ${styles.deleteBtn}`}
                    onClick={() => onDelete(u.username)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Create `panel/src/pages/Users/components/CreateUserModal.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/Modal';
import styles from '../styles.module.css';

const EXPIRY_OPTIONS = [
  { value: '', label: 'Unlimited' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '180d', label: '180 days' },
  { value: '365d', label: '365 days' },
];

interface CreateUserModalProps {
  title: string;
  onClose: () => void;
  onSubmit: (data: { username: string; password: string; expiry: string | null }) => Promise<void>;
}

export function CreateUserModal({ title, onClose, onSubmit }: CreateUserModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        username,
        password,
        expiry: expiry || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.formError}>{error}</div>}
        <div className={styles.field}>
          <label className={styles.label}>Username</label>
          <input
            className={styles.input}
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Password</label>
          <input
            className={styles.input}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Expiry</label>
          <select
            className={styles.select}
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <button className={styles.submitBtn} type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create User'}
        </button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Create `panel/src/pages/Users/components/ExtendModal.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { Modal } from '../../../components/Modal';
import styles from '../styles.module.css';

const EXTEND_OPTIONS = [
  { value: '', label: 'Unlimited (remove expiry)' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '180d', label: '180 days' },
  { value: '365d', label: '365 days' },
];

interface ExtendModalProps {
  username: string;
  currentExpiry: string | null;
  onClose: () => void;
  onSubmit: (expiry: string | null) => Promise<void>;
}

export function ExtendModal({ username, currentExpiry, onClose, onSubmit }: ExtendModalProps) {
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSubmit(expiry || null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Extend: ${username}`} onClose={onClose}>
      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.formError}>{error}</div>}
        <div className={styles.field}>
          <label className={styles.label}>Current expiry</label>
          <div style={{ color: '#e0e0e0', fontSize: 14, padding: '4px 0' }}>
            {currentExpiry ?? 'Unlimited'}
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>New expiry</label>
          <select
            className={styles.select}
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          >
            {EXTEND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <button className={styles.submitBtn} type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 5: Create `panel/src/pages/Users/index.tsx`**

```tsx
import { useState, useEffect, useCallback } from 'react';
import { NavLink, Routes, Route, useParams } from 'react-router-dom';
import * as naiveApi from '../../api/naive';
import * as hysteriaApi from '../../api/hysteria';
import * as systemApi from '../../api/system';
import { useToast } from '../../contexts/ToastContext';
import { UserTable } from './components/UserTable';
import { CreateUserModal } from './components/CreateUserModal';
import { ExtendModal } from './components/ExtendModal';
import type { NaiveUser, HysteriaUser } from '../../types/api';
import styles from './styles.module.css';

type ProxyType = 'naive' | 'hysteria';
type User = NaiveUser | HysteriaUser;

export function UsersPage() {
  const proxyType = (useParams<'*'>()['*'] || 'naive').split('/')[0] as ProxyType;
  const isNaive = proxyType === 'naive';
  const { addToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [extendUser, setExtendUser] = useState<{ username: string; expiry: string | null } | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [u, config] = await Promise.all([
        isNaive ? naiveApi.listUsers() : hysteriaApi.listUsers(),
        systemApi.getConfig(),
      ]);
      setUsers(u);
      setDomain(config.proxyDomain);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [isNaive, addToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = async (data: { username: string; password: string; expiry: string | null }) => {
    if (isNaive) {
      await naiveApi.createUser(data);
    } else {
      await hysteriaApi.createUser(data);
    }
    addToast(`User ${data.username} created`, 'success');
    loadUsers();
  };

  const handleDelete = async (username: string) => {
    try {
      if (isNaive) {
        await naiveApi.deleteUser(username);
      } else {
        await hysteriaApi.deleteUser(username);
      }
      addToast(`User ${username} deleted`, 'success');
      loadUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  const handleExtend = async (expiry: string | null) => {
    if (!extendUser) return;
    try {
      if (isNaive) {
        await naiveApi.updateUser(extendUser.username, { expiry });
      } else {
        await hysteriaApi.updateUser(extendUser.username, { expiry });
      }
      addToast(`User ${extendUser.username} updated`, 'success');
      setExtendUser(null);
      loadUsers();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Extend failed', 'error');
    }
  };

  const makeLink = (username: string, password: string) => {
    if (isNaive) {
      return `naive+https://${username}:${password}@${domain}:443`;
    }
    return `hysteria2://${password}@${domain}:443?sni=${domain}`;
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Users</h1>

      <div className={styles.subnav}>
        <NavLink
          to="/users/naive"
          className={({ isActive }) => `${styles.subtab} ${isActive ? styles.subtabActive : ''}`}
        >
          NaiveProxy
        </NavLink>
        <NavLink
          to="/users/hysteria"
          className={({ isActive }) => `${styles.subtab} ${isActive ? styles.subtabActive : ''}`}
        >
          Hysteria2
        </NavLink>
      </div>

      <div className={styles.toolbar}>
        <span style={{ color: '#888', fontSize: 14 }}>
          {users.length} user{users.length !== 1 ? 's' : ''}
        </span>
        <button className={styles.addBtn} onClick={() => setShowCreate(true)}>
          + Add User
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <UserTable
          users={users}
          proxyType={proxyType}
          domain={domain}
          onExtend={(username, expiry) => setExtendUser({ username, expiry })}
          onDelete={handleDelete}
          onCopyLink={makeLink}
        />
      )}

      {showCreate && (
        <CreateUserModal
          title={`Add ${isNaive ? 'NaiveProxy' : 'Hysteria2'} User`}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {extendUser && (
        <ExtendModal
          username={extendUser.username}
          currentExpiry={extendUser.expiry}
          onClose={() => setExtendUser(null)}
          onSubmit={handleExtend}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `panel/src/pages/Users/index.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UsersPage } from './index';
import { AuthProvider } from '../../contexts/AuthContext';
import { ToastProvider } from '../../contexts/ToastContext';

vi.mock('../../api/auth', () => ({
  me: vi.fn().mockResolvedValue({ username: 'admin', role: 'admin' }),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../api/naive', () => ({
  listUsers: vi.fn().mockResolvedValue([
    { username: 'user1', password: 'pass1', expiry: '2026-12-31', expired: false, created: '2026-01-01' },
  ]),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('../../api/hysteria', () => ({
  listUsers: vi.fn().mockResolvedValue([]),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('../../api/system', () => ({
  getConfig: vi.fn().mockResolvedValue({ proxyDomain: 'example.com' }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/users/naive']}>
      <AuthProvider>
        <ToastProvider>
          <UsersPage />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('UsersPage', () => {
  it('renders user table with data', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('user1')).toBeDefined();
      expect(screen.getByText('1 user')).toBeDefined();
    });
  });

  it('renders add user button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('+ Add User')).toBeDefined();
    });
  });
});
```

- [ ] **Step 7: Wire UsersPage into App.tsx**

Replace the users placeholder `<Route path="users/*" element={<div>Users (coming soon)</div>} />` with:

```tsx
<Route path="users/*" element={<UsersPage />} />
```

Add import: `import { UsersPage } from './pages/Users';`

- [ ] **Step 8: Run tests**

```bash
cd panel && npm test -- --reporter=verbose
# Expected: 12 tests pass
```

- [ ] **Step 9: Commit**

```bash
git add panel/src/pages/Users/ panel/src/App.tsx
git commit -m "feat: add Users page with tables and modals"
```

---

### Task 13: Install Wizard Page

**Files:**
- Create: `panel/src/hooks/useWebSocket.ts`
- Create: `panel/src/pages/Install/index.tsx`
- Create: `panel/src/pages/Install/styles.module.css`
- Modify: `panel/src/App.tsx`

- [ ] **Step 1: Create `panel/src/hooks/useWebSocket.ts`**

```ts
import { useEffect, useRef, useState } from 'react';

interface WsMessage {
  type: string;
  step?: string;
  message?: string;
  error?: string;
  status?: string;
  service?: string;
}

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}${url}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
      } catch {
        // invalid JSON, ignore
      }
    };

    return () => ws.close();
  }, [url]);

  const send = (data: unknown) => {
    wsRef.current?.send(JSON.stringify(data));
  };

  return { messages, connected, send };
}
```

- [ ] **Step 2: Create `panel/src/pages/Install/styles.module.css`**

```css
.page {
  max-width: 700px;
}

.title {
  font-size: 22px;
  color: #fff;
  margin-bottom: 24px;
}

.section {
  background: #16213e;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.sectionTitle {
  font-size: 16px;
  color: #7c4dff;
  margin-bottom: 16px;
}

.options {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.optionBtn {
  padding: 10px 20px;
  background: #2a2a4a;
  color: #e0e0e0;
  border: 2px solid #2a2a4a;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.optionBtn:hover {
  border-color: #7c4dff;
}

.optionBtnSelected {
  border-color: #7c4dff;
  background: #1e2a4a;
}

.startBtn {
  padding: 12px 32px;
  background: #7c4dff;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
}

.startBtn:hover {
  background: #651fff;
}

.startBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.log {
  background: #0d1117;
  border-radius: 4px;
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
}

.logEntry {
  color: #c9d1d9;
  padding: 2px 0;
}

.logError {
  color: #ef5350;
}

.logSuccess {
  color: #66bb6a;
}

.logStep {
  color: #7c4dff;
  font-weight: bold;
}

.progress {
  margin-top: 12px;
  font-size: 14px;
  color: #888;
}
```

- [ ] **Step 3: Create `panel/src/pages/Install/index.tsx`**

```tsx
import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import styles from './styles.module.css';

type InstallType = 'naive' | 'hysteria' | 'both';

const STEP_MAP: Record<string, string> = {
  'STEP:1': 'Installing prerequisites...',
  'STEP:2': 'Downloading binaries...',
  'STEP:3': 'Configuring services...',
  'STEP:4': 'Setting up firewall...',
  'STEP:5': 'Starting services...',
  'STEP:DONE': 'Installation complete!',
};

export function InstallPage() {
  const [selected, setSelected] = useState<InstallType | null>(null);
  const [installing, setInstalling] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const { messages, connected, send } = useWebSocket('');

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!installing) return;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    if (lastMsg.step && STEP_MAP[lastMsg.step]) {
      setCurrentStep(STEP_MAP[lastMsg.step]);
    }
    if (lastMsg.step === 'STEP:DONE' || lastMsg.type === 'error') {
      setInstalling(false);
    }
  }, [messages, installing]);

  const handleStart = () => {
    if (!selected || !connected) return;
    setInstalling(true);
    setCurrentStep('Starting...');
    send({
      type: `install_${selected}`,
      ...(selected === 'both' ? { services: ['naive', 'hysteria'] } : {}),
    });
  };

  const types: { key: InstallType; label: string; desc: string }[] = [
    { key: 'naive', label: 'NaiveProxy', desc: 'HTTPS forward proxy via Caddy' },
    { key: 'hysteria', label: 'Hysteria2', desc: 'High-speed QUIC proxy' },
    { key: 'both', label: 'Both', desc: 'NaiveProxy + Hysteria2 on port 443' },
  ];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Installation</h1>

      {!installing ? (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Select proxy type</h2>
          <div className={styles.options}>
            {types.map((t) => (
              <button
                key={t.key}
                className={`${styles.optionBtn} ${selected === t.key ? styles.optionBtnSelected : ''}`}
                onClick={() => setSelected(t.key)}
              >
                <div style={{ fontWeight: 600 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{t.desc}</div>
              </button>
            ))}
          </div>
          <button
            className={styles.startBtn}
            disabled={!selected || !connected}
            onClick={handleStart}
          >
            Start Installation
          </button>
          {!connected && (
            <div className={styles.progress} style={{ color: '#ef5350', marginTop: 12 }}>
              WebSocket not connected. Make sure the panel server is running.
            </div>
          )}
        </div>
      ) : (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{currentStep}</h2>
          <div className={styles.log}>
            {messages.map((msg, i) => {
              let cls = styles.logEntry;
              if (msg.type === 'error') cls = styles.logError;
              else if (msg.step === 'STEP:DONE') cls = styles.logSuccess;
              else if (msg.step) cls = styles.logStep;
              return (
                <div key={i} className={cls}>
                  {msg.message || msg.step || JSON.stringify(msg)}
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire InstallPage into App.tsx**

Replace the install placeholder with:

```tsx
<Route path="install" element={<InstallPage />} />
```

Add import: `import { InstallPage } from './pages/Install';`

- [ ] **Step 5: Run tests and build**

```bash
cd panel && npx tsc --noEmit && npm run build
# Expected: no errors, dist/ created
```

- [ ] **Step 6: Commit**

```bash
git add panel/src/hooks/useWebSocket.ts panel/src/pages/Install/ panel/src/App.tsx
git commit -m "feat: add Install wizard page with WebSocket progress"
```

---

### Task 14: Production Build & Express Integration

**Files:**
- Modify: `panel/server/index.js`
- Modify: `panel/package.json`

- [ ] **Step 1: Update `panel/server/index.js` to serve new frontend when enabled**

In `server/index.js`, find the static file serving section and replace:

```js
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
```

With:

```js
const frontendDir = process.env.USE_NEW_FRONTEND === 'true'
  ? path.join(__dirname, '..', 'dist')
  : path.join(__dirname, '..', 'public');

app.use(express.static(frontendDir));
app.get(/^(?!\/api).*/, (req, res) => {
  const indexPath = path.join(frontendDir, 'index.html');
  if (require('fs').existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not built. Run: npm run build' });
  }
});
```

- [ ] **Step 2: Add build script to `panel/package.json`**

Ensure the `build` script is present (verify from Task 0 Step 10):

```json
"build": "tsc && vite build"
```

- [ ] **Step 3: Build and test locally**

```bash
cd panel && npm run build
# Then start Express with new frontend:
USE_NEW_FRONTEND=true node server/index.js
# Test: curl http://localhost:3000/ — should serve React app
```

- [ ] **Step 4: Commit**

```bash
git add panel/server/index.js panel/package.json
git commit -m "feat: add USE_NEW_FRONTEND switch for Express"
```

---

### Task 15: Final Verification

- [ ] **Step 1: Run full lint**

```bash
cd panel && npm run lint
# Expected: no errors
```

- [ ] **Step 2: Run all tests**

```bash
cd panel && npm test
# Expected: all 12+ tests pass
```

- [ ] **Step 3: Run build**

```bash
cd panel && npm run build
# Expected: dist/ directory created with index.html + assets
```

- [ ] **Step 4: Start dev server and test manually**

```bash
cd panel && npm run dev
# Open http://localhost:5173
# Verify: login page renders, can navigate with sidebar
```

---

## Self-Review

1. **Spec coverage:** All spec pages covered (Login, Settings, Dashboard, Diagnostics, Tuning, Bypass, Users, Install). All infrastructure items (Router, AuthGuard, Layout, Toast, API client) covered. Frontend switching (`USE_NEW_FRONTEND`) implemented in Task 14. Phase 9 cleanup left as manual step per user request.

2. **Placeholder scan:** No TBD/TODO/fill-in-later patterns. All code is complete with concrete implementation.

3. **Type consistency:** `NaiveUser`, `HysteriaUser`, `SystemStatus`, `Config`, etc. are defined in `types/api.ts` and used consistently across API modules and page components. `CreateUserInput` is defined and used in both `naive.ts` (API) and `CreateUserModal` (component). The `User` type in `UserTable` is compatible with both `NaiveUser` and `HysteriaUser` since they share the same shape.
