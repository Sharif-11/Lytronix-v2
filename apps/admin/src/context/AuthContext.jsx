import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('lytronix_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('lytronix_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .getMe()
      .then(({ user: freshUser }) => {
        setUser(freshUser);
        localStorage.setItem('lytronix_user', JSON.stringify(freshUser));
      })
      .catch(() => {
        localStorage.removeItem('lytronix_token');
        localStorage.removeItem('lytronix_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier, password) => {
    const { token, user: loggedInUser } = await api.login(identifier, password);
    localStorage.setItem('lytronix_token', token);
    localStorage.setItem('lytronix_user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const refreshUser = useCallback(async () => {
    const { user: freshUser } = await api.getMe();
    setUser(freshUser);
    localStorage.setItem('lytronix_user', JSON.stringify(freshUser));
    return freshUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('lytronix_token');
    localStorage.removeItem('lytronix_user');
    setUser(null);
  }, []);

  // Superadmin role bypasses individual permission checks (mirrors the backend).
  const hasPermission = useCallback(
    (...permissions) => {
      if (!user?.role) return false;
      if (user.role.isSuperAdmin) return true;
      return permissions.some((p) => user.role.permissions?.includes(p));
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
