import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { SettingsPage } from './pages/Settings';
import { DashboardPage } from './pages/Dashboard';
import { DiagnosticsPage } from './pages/Diagnostics';
import { TuningPage } from './pages/Tuning';
import { BypassPage } from './pages/Bypass';
import { UsersPage } from './pages/Users';
import { InstallPage } from './pages/Install';
import type { ReactNode } from 'react';

function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#e0e0e0', background: '#1a1a2e' }}>
        Loading...
      </div>
    );
  }

  if (!user?.username) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGuard><Layout /></AuthGuard>}>
        <Route index element={<DashboardPage />} />
        <Route path="install" element={<InstallPage />} />
        <Route path="users/*" element={<UsersPage />} />
        <Route path="tuning" element={<TuningPage />} />
        <Route path="bypass" element={<BypassPage />} />
        <Route path="diagnostics" element={<DiagnosticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

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
