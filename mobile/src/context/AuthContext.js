import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setSessionExpiredHandler } from '../api/client';
import { registerDevice, unregisterDevice } from '../lib/push';

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
            // Register on RESTORE too, not only on sign-in. Most launches
            // restore a session rather than going through persist(), so
            // without this pushTokenRef stays null for the whole run and
            // sign-out has no token to unregister - the phone would keep
            // receiving the previous resident's updates after they signed
            // out. It also re-registers a token the server may have pruned
            // (Expo replies DeviceNotRegistered after a reinstall), which is
            // otherwise never retried. Not awaited: see persist().
            registerDevice(saved).then((pt) => {
              if (active) pushTokenRef.current = pt;
            });
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

  // The Expo push token this session registered, kept so sign-out can tell the
  // server to forget THIS device rather than every device the person owns.
  const pushTokenRef = useRef(null);

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

    // Register this phone for report-update notifications. NOT awaited: a
    // device that cannot mint a push token - FCM misconfigured, no Play
    // Services, permission not granted yet - must still finish signing in.
    // registerDevice swallows its own failures and resolves to null.
    registerDevice(tk).then((pt) => {
      pushTokenRef.current = pt;
    });
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

  // `token` is in the dependency list because the body reads it. With the empty
  // array this used to have, unregisterDevice would have closed over the token
  // as it was on first render - null - and silently never told the server
  // anything, leaving the phone registered to a resident who had signed out.
  // It costs no extra renders: `token` is already a dependency of the memoised
  // context value below, so that recomputes on a token change either way.
  const logout = useCallback(async () => {
    // Tell the server to forget THIS device, so a signed-out phone stops
    // receiving the previous resident's report updates. Not awaited, for the
    // same reason api.logout() is not: signing out has to work on a dead
    // network, and a push row left behind is a smaller problem than a person
    // who cannot sign out.
    unregisterDevice(token, pushTokenRef.current);
    pushTokenRef.current = null;
    // Ask the server to clear the session cookie OkHttp is holding. Signing out
    // has to work on a dead network, so this is deliberately not awaited and
    // its failure is ignored - the local state below is what actually ends the
    // session for this app.
    api.logout().catch(() => {});
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  // Stop this phone receiving report updates, without signing out.
  //
  // The Profile toggle needs this because turning notifications "off" cannot
  // revoke an OS permission from inside the app - only system settings can -
  // so unregistering the device is the one thing the app CAN do that actually
  // stops the notifications arriving. Without it, "off" would rely entirely on
  // the resident finding the right switch in Android settings.
  const forgetDevice = useCallback(async () => {
    await unregisterDevice(token, pushTokenRef.current);
    pushTokenRef.current = null;
  }, [token]);

  // Register this phone again after the resident turns notifications back on.
  const rememberDevice = useCallback(async () => {
    pushTokenRef.current = await registerDevice(token);
    return pushTokenRef.current;
  }, [token]);

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
    () => ({ user, token, loading, isAuthenticated: !!user, sessionNotice, login, register, logout, updateUser, updateToken, forgetDevice, rememberDevice }),
    [user, token, loading, sessionNotice, login, register, logout, updateUser, updateToken, forgetDevice, rememberDevice]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
