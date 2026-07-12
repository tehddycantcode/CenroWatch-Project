import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi, getToken, setToken, SESSION_EXPIRED_EVENT } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // resolving the initial session
  const navigate = useNavigate();
  const location = useLocation();

  // Refs so the session-expired listener (subscribed once) reads fresh values
  // instead of stale closures.
  const userRef = useRef(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Sign out when any authenticated call reports 401 (expired/invalid token).
  // The redirect and notice happen at most once: after the first event the
  // user is null, so parallel 401s only re-clear the token, which is harmless.
  // A stale token at boot (no user loaded yet) clears silently with no notice.
  useEffect(() => {
    function onSessionExpired() {
      setToken(null);
      if (!userRef.current) return;
      setUser(null);
      navigate('/login', {
        replace: true,
        state: { expired: true, from: locationRef.current },
      });
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, [navigate]);

  // On mount: if a token exists, validate it via /me.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await authApi.me();
        if (active) setUser(res.data.user);
      } catch {
        setToken(null); // stale/invalid token
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const res = await authApi.login(credentials);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await authApi.register(payload);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Refresh the cached user after a self-service profile edit.
  const updateUser = useCallback((next) => setUser(next), []);

  const value = { user, loading, isAuthenticated: !!user, login, register, logout, updateUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
