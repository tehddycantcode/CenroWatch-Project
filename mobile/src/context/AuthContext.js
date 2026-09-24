import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setSessionExpiredHandler } from '../api/client';

const TOKEN_KEY = 'cenrowatch_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true); // resolving the stored session
  const [sessionNotice, setSessionNotice] = useState('');

  // Ref so the session-expired handler (registered once) sees the fresh user.
  const userRef = useRef(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Sign out when any authenticated call reports 401 (expired/invalid token).
  // Happens at most once: after the first call the user is null, so parallel
  // 401s only re-clear the stored token. A stale token at boot (no user
  // loaded yet) clears silently with no notice.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      if (!userRef.current) return;
      setToken(null);
      setUser(null);
      setSessionNotice('Your session has expired. Please sign in again.');
    });
    return () => setSessionExpiredHandler(null);
  }, []);

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

  // Whether THIS session asked to be kept. A ref rather than state because
  // nothing renders from it and updateToken has to read the current value
  // without re-subscribing to it.
  const rememberedRef = useRef(true);

  const persist = useCallback(async (tk, usr, remember = true) => {
    rememberedRef.current = remember !== false;
    if (rememberedRef.current) {
      await SecureStore.setItemAsync(TOKEN_KEY, tk);
    } else {
      // Declined: the token lives in memory for this run of the app only, so
      // closing it signs out. The delete matters as much as skipping the write
      // - a previous kept session may have left a token in the keychain, and
      // leaving it there would silently restore a session the person has just
      // asked not to keep.
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
      // And the COOKIE, which the keychain delete does not touch. The login
      // that just succeeded returned a Set-Cookie, and OkHttp's jar keeps it
      // for the full JWT_EXPIRES_IN across restarts. Nothing in the app reads
      // it today - every call sends Bearer - so this is hygiene rather than a
      // live bug, but leaving a week-long credential on a phone belonging to
      // someone who just said "do not keep me signed in" is the wrong default,
      // and it would become a real bug the moment any call goes out without a
      // Bearer header. Not awaited: declining to be remembered must not fail
      // because the network did.
      api.logout().catch(() => {});
    }
    setToken(tk);
    setUser(usr);
    setSessionNotice('');
  }, []);

  const login = useCallback(
    async (credentials) => {
      const res = await api.login(credentials);
      await persist(res.data.token, res.data.user, credentials.remember);
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
    // Ask the server to clear the session cookie OkHttp is holding. Signing out
    // has to work on a dead network, so this is deliberately not awaited and
    // its failure is ignored - the local state below is what actually ends the
    // session for this app.
    api.logout().catch(() => {});
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Refresh the cached user after a self-service profile edit.
  const updateUser = useCallback((next) => setUser(next), []);

  // Swap in a replacement token without disturbing the signed-in user.
  //
  // Changing a password signs out every session issued before the change, this
  // one included. The server hands back a fresh token for the device that made
  // the change; storing it here is what keeps THIS phone signed in. Skip it and
  // the resident is bounced to the login screen by their own password change -
  // on the very next request, with "Your password was changed. Please sign in
  // again.", which reads like a failure rather than the thing they just did.
  //
  // Only written to the keychain if this session asked to be kept. Writing it
  // unconditionally would turn "change my password" into the one action that
  // quietly converts a deliberately temporary session into a stored one.
  const updateToken = useCallback(async (tk) => {
    if (!tk) return;
    if (rememberedRef.current) await SecureStore.setItemAsync(TOKEN_KEY, tk);
    setToken(tk);
  }, []);

  // Memoised: see the note in web/src/context/AuthContext.jsx. A fresh object
  // literal here re-renders every useAuth() consumer on each provider render,
  // which on mobile means the whole navigator tree.
  const value = useMemo(
    () => ({ user, token, loading, isAuthenticated: !!user, sessionNotice, login, register, logout, updateUser, updateToken }),
    [user, token, loading, sessionNotice, login, register, logout, updateUser, updateToken]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
