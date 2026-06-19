import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import * as authApi from '../api/auth';
import { UnauthorizedError } from '../api/client';

interface User {
  username: string;
  role: string;
  mustChangePassword?: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<{ mustChangePassword?: boolean }>;
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
      .catch((err) => {
        if (!(err instanceof UnauthorizedError)) {
          console.error('Session check failed:', err);
        }
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login({ username, password });
    if (!res.success) {
      throw new Error(res.message || 'Login failed');
    }
    const u = await authApi.me();
    setUser(u);
    return { mustChangePassword: res.mustChangePassword };
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const mustChangePassword = !!user?.mustChangePassword;

  return (
    <AuthContext.Provider value={{ user, loading, mustChangePassword, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
