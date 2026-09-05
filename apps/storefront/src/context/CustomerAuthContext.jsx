import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as api from '../api/client';
import { SHOP_TOKEN_KEY, setShopTokens, clearShopTokens } from '../api/client';

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
      // If the access token has expired the client interceptor silently
      // refreshes it from the stored refresh token — so a returning visitor
      // stays signed in across reloads without another OTP/password.
      const { customer: fresh } = await api.getMe();
      setCustomer(fresh);
      return fresh;
    } catch {
      clearShopTokens();
      setCustomer(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The interceptor fires this when a refresh fails and the session is over.
  useEffect(() => {
    const onLogout = () => setCustomer(null);
    window.addEventListener('lytronix:logout', onLogout);
    return () => window.removeEventListener('lytronix:logout', onLogout);
  }, []);

  const finishAuth = useCallback((res) => {
    setShopTokens(res);
    setCustomer(res.customer);
    window.dispatchEvent(new CustomEvent('lytronix:login'));
    return res.customer;
  }, []);

  const requestOtp = useCallback((phone) => api.requestOtp(phone), []);

  const verifyOtp = useCallback(
    async (phone, code) => finishAuth(await api.verifyOtp(phone, code)),
    [finishAuth]
  );

  // Password sign-in — no SMS, for customers who set a password.
  const login = useCallback(
    async (phone, password) => finishAuth(await api.passwordLogin(phone, password)),
    [finishAuth]
  );

  const forgotPassword = useCallback((phone) => api.forgotPassword(phone), []);

  // Set / change the optional password. The server rotates our tokens, so
  // swap them in and keep this device signed in.
  const setPassword = useCallback(
    async (payload) => {
      const res = await api.setAccountPassword(payload);
      setShopTokens(res);
      setCustomer(res.customer);
      return res.customer;
    },
    []
  );

  const removePassword = useCallback(async () => {
    const res = await api.removeAccountPassword();
    setShopTokens(res);
    setCustomer(res.customer);
    return res.customer;
  }, []);

  const logout = useCallback(() => {
    clearShopTokens();
    setCustomer(null);
    window.dispatchEvent(new CustomEvent('lytronix:logout'));
  }, []);

  const patchCustomer = useCallback((next) => setCustomer((c) => ({ ...c, ...next })), []);

  const value = {
    customer,
    loading,
    isAuthed: Boolean(customer),
    requestOtp,
    verifyOtp,
    login,
    forgotPassword,
    setPassword,
    removePassword,
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
