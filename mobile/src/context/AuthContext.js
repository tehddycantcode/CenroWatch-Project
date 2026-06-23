import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';

const TOKEN_KEY = 'cenrowatch_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true); // resolving the stored session

  // On mount: restore a saved token and validate it via /me.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (saved) {
          const res = await api.me(saved);
          if (active) {
            setUser(res.data.user);
            setToken(saved);
          }
        }
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY); // stale/invalid token
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (tk, usr) => {
    await SecureStore.setItemAsync(TOKEN_KEY, tk);
    setToken(tk);
    setUser(usr);
  }, []);

  const login = useCallback(
    async (credentials) => {
      const res = await api.login(credentials);
      await persist(res.data.token, res.data.user);
      return res.data.user;
    },
    [persist]
  );

  const register = useCallback(
    async (payload) => {
      const res = await api.register(payload);
      await persist(res.data.token, res.data.user);
      return res.data.user;
    },
    [persist]
  );

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Refresh the cached user after a self-service profile edit.
  const updateUser = useCallback((next) => setUser(next), []);

  const value = { user, token, loading, isAuthenticated: !!user, login, register, logout, updateUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
