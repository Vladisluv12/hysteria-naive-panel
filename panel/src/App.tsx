import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { SettingsPage } from './pages/Settings';
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

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGuard><Layout /></AuthGuard>}>
        <Route index element={<div>Dashboard (coming soon)</div>} />
        <Route path="install" element={<div>Install (coming soon)</div>} />
        <Route path="users/*" element={<div>Users (coming soon)</div>} />
        <Route path="tuning" element={<div>Tuning (coming soon)</div>} />
        <Route path="bypass" element={<div>Bypass (coming soon)</div>} />
        <Route path="diagnostics" element={<div>Diagnostics (coming soon)</div>} />
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
