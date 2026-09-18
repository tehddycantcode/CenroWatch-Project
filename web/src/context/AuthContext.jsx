import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi, SESSION_EXPIRED_EVENT } from '@/lib/api';

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
  // user is null, so parallel 401s are ignored. The cookie itself is already
  // gone or rejected server-side, so there is nothing for us to clear here —
  // the boot probe opts out of this event precisely so a signed-out visitor on
  // the public map is never bounced to /login.
  useEffect(() => {
    function onSessionExpired() {
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

  // On mount: ask the server whether the HttpOnly cookie names a live session.
  // This call is unconditional now — the cookie is invisible to JavaScript, so
  // unlike the old localStorage check there is nothing to look at first. A 401
  // simply means "signed out" and resolves loading like any other answer.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await authApi.session();
        if (active) setUser(res.data.user);
      } catch {
        /* no session, or it expired — stay signed out */
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // login/register authenticate by Set-Cookie on the response; the token in the
  // body is the mobile app's copy and is deliberately ignored here.
  const login = useCallback(async (credentials) => {
    const res = await authApi.login(credentials);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const res = await authApi.register(payload);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  // Only the server can clear an HttpOnly cookie, so sign-out is now a request.
  // The local state is cleared either way: a user who clicked "sign out" must
  // end up signed out in the UI even if that request fails.
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* offline or server down — clear the UI regardless */
    }
    setUser(null);
  }, []);

  // Refresh the cached user after a self-service profile edit.
  const updateUser = useCallback((next) => setUser(next), []);

  // Memoised because this provider wraps the whole app: a fresh object literal
  // here is a new context value on every AuthProvider render, which re-renders
  // every useAuth() consumer in the tree whether or not anything they read
  // changed. The four functions are already useCallback'd, so the only real
  // dependencies are user and loading.
  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, login, register, logout, updateUser }),
    [user, loading, login, register, logout, updateUser]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
