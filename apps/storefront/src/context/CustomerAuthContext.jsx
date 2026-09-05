import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from '../api/client';
import { SHOP_TOKEN_KEY } from '../api/client';

const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(SHOP_TOKEN_KEY);
    if (!token) {
      setCustomer(null);
      setLoading(false);
      return null;
    }
    try {
      const { customer: fresh } = await api.getMe();
      setCustomer(fresh);
      return fresh;
    } catch {
      localStorage.removeItem(SHOP_TOKEN_KEY);
      setCustomer(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestOtp = useCallback((phone) => api.requestOtp(phone), []);

  // Returns the logged-in customer. Callers (Login page) handle cart merge
  // via the `onLogin` hook wired in App so CartContext can react.
  const verifyOtp = useCallback(async (phone, code) => {
    const { token, customer: loggedIn } = await api.verifyOtp(phone, code);
    localStorage.setItem(SHOP_TOKEN_KEY, token);
    setCustomer(loggedIn);
    window.dispatchEvent(new CustomEvent('lytronix:login'));
    return loggedIn;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SHOP_TOKEN_KEY);
    setCustomer(null);
    window.dispatchEvent(new CustomEvent('lytronix:logout'));
  }, []);

  // Let other contexts (cart) patch the cached customer after they mutate it
  // (e.g. an address added at checkout).
  const patchCustomer = useCallback((next) => setCustomer((c) => ({ ...c, ...next })), []);

  const value = {
    customer,
    loading,
    isAuthed: Boolean(customer),
    requestOtp,
    verifyOtp,
    logout,
    refresh,
    patchCustomer,
  };

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
