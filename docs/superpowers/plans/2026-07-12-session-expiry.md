# Session-Expiry Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a JWT expires mid-session, sign the user out exactly once and land them on the login screen with a calm notice; on web, return them to the page they were on after re-login.

**Architecture:** Reactive interceptor. The API layer on each platform detects a 401 on any request that carried a token and notifies the auth context (web: a window event; mobile: a registered callback). The auth context clears the session at most once and routes to login. The web login page already returns users to `location.state.from` after sign-in (built for ProtectedRoute deep links), so the expiry flow reuses that mechanism instead of inventing storage.

**Tech Stack:** React 18 + Vite 5 + react-router-dom v6 (web); React Native + Expo SDK 56 + expo-secure-store (mobile). No new dependencies. No backend changes.

**Spec:** `docs/superpowers/specs/2026-07-12-session-expiry-design.md`

## Global Constraints

- User-facing copy is exactly: `Your session has expired. Please sign in again.` (informational styling, not error-red; no dashes; no "official").
- A 401 from a request WITHOUT a token (login, register, public endpoints) must never trigger the sign-out. 403 is untouched.
- No backend changes; no AuditLog needed (nothing mutates server data).
- ASCII-only source edits; match surrounding code style and comment density.
- This repo has no unit-test framework; the established verification workflow is `npm run build` (web), live Playwright checks on http://localhost:5173 (CORS allows only 5173), and `npx expo export --platform android` (mobile). Every node/npm command in a fresh PowerShell needs the PATH prefix first: `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`
- `/auth` is rate-limited (10 requests per window): keep login attempts in verification to the scripted minimum.
- Test accounts: staff@cenrowatch.local / StaffPass123 (CENRO_Staff); wrong-password checks may use any bogus password.
- Do not stage `.playwright-mcp/`, screenshots, `uploads/`, `dist/`, or throwaway `_*.mjs` files.

---

### Task 1: Web API layer detects expired sessions

**Files:**
- Modify: `web/src/lib/api.js` (the `apiFetch` non-ok block at lines 53-58 and the `downloadFile` non-ok block at lines 71-80)

**Interfaces:**
- Consumes: existing `apiFetch(path, { auth })` contract - `auth: true` (default) means the request represents the signed-in session; `auth: false` marks public/login calls.
- Produces: `export const SESSION_EXPIRED_EVENT = 'cenrowatch:session-expired'` and a `window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))` fired on 401 for token-carrying requests. Task 2's listener depends on this exact export name.

- [ ] **Step 1: Add the event-name export**

In `web/src/lib/api.js`, directly below the `TOKEN_KEY` constant (line 6), add:

```js
// Fired (on window) when an authenticated call comes back 401, i.e. the JWT
// expired or was revoked. AuthContext listens and signs the user out once.
export const SESSION_EXPIRED_EVENT = 'cenrowatch:session-expired';
```

- [ ] **Step 2: Dispatch from apiFetch**

Replace the non-ok block in `apiFetch`:

```js
  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = data?.errors; // express-validator field errors, when present
    throw err;
  }
```

with:

```js
  if (!res.ok) {
    // Expired/invalid session: tell the app so it can sign out once, then
    // throw as usual so callers' own error handling still runs. Requests
    // with auth:false (login, register, public GIS) can never trigger this.
    if (res.status === 401 && auth && token) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = data?.errors; // express-validator field errors, when present
    throw err;
  }
```

(`auth` and `token` are already in scope inside `apiFetch`.)

- [ ] **Step 3: Dispatch from downloadFile**

In `downloadFile`, replace:

```js
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
```

with:

```js
  if (!res.ok) {
    if (res.status === 401 && token) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    let msg = `Download failed (${res.status})`;
```

(`downloadFile` always attaches the token when one exists, so `token` alone is the right guard; there is no `auth` flag in this helper.)

- [ ] **Step 4: Verify the web app still builds**

Run (PowerShell, with the PATH prefix from Global Constraints):

```powershell
cd "c:\Users\Penar\CenroWatch Project\web"; npm run build
```

Expected: `built in Ns` with no new warnings. (The event fires into the void until Task 2 - that is fine and inert.)

---

### Task 2: Web AuthProvider signs out once and routes to login

**Files:**
- Modify: `web/src/context/AuthContext.jsx`

**Interfaces:**
- Consumes: `SESSION_EXPIRED_EVENT` from `@/lib/api` (Task 1); `useNavigate`/`useLocation` from react-router-dom (AuthProvider is rendered inside `BrowserRouter` in `web/src/main.jsx`, so router hooks are available).
- Produces: on mid-session expiry, navigation to `/login` with `state: { expired: true, from: <Location> }`. Task 3's LoginPage reads exactly `location.state.expired` and `location.state.from`.

- [ ] **Step 1: Rewrite AuthContext.jsx with the listener**

Replace the entire contents of `web/src/context/AuthContext.jsx` with:

```jsx
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
```

Only the imports and the two new `useEffect` blocks (refs + listener) differ from the current file; everything from the mount effect down is unchanged.

- [ ] **Step 2: Verify the web app builds**

```powershell
cd "c:\Users\Penar\CenroWatch Project\web"; npm run build
```

Expected: clean build.

---

### Task 3: Web LoginPage notice + return trip, end-to-end verification, commit

**Files:**
- Modify: `web/src/pages/auth/LoginPage.jsx`

**Interfaces:**
- Consumes: `location.state.expired` (boolean) and `location.state.from` (router Location) from Task 2; ProtectedRoute already sends the same `from` shape for deep links (`web/src/components/ProtectedRoute.jsx:13`), so one code path serves both.
- Produces: nothing consumed later; this completes the web flow.

- [ ] **Step 1: Read the expired flag and preserve query strings on return**

In `web/src/pages/auth/LoginPage.jsx`, add below the `const [submitting, setSubmitting] = useState(false);` line:

```jsx
  // Set when AuthContext signed us out because the JWT expired (see
  // SESSION_EXPIRED_EVENT). ProtectedRoute deep links share the same state.from.
  const expired = Boolean(location.state?.expired);
```

Then in `onSubmit`, replace:

```jsx
      const u = await login(form);
      const dest = location.state?.from?.pathname || roleHome(u.role);
      navigate(dest, { replace: true });
```

with:

```jsx
      const u = await login(form);
      const from = location.state?.from;
      // Return to the exact page (including query string, e.g. queue filters).
      // ProtectedRoute still role-guards it, so a different account bounces
      // safely to its own home.
      const dest = from ? `${from.pathname}${from.search || ''}` : roleHome(u.role);
      navigate(dest, { replace: true });
```

- [ ] **Step 2: Render the notice**

In the form JSX, replace:

```jsx
        {error && <Alert>{error}</Alert>}
```

with:

```jsx
        {error ? (
          <Alert>{error}</Alert>
        ) : expired ? (
          <Alert variant="info">Your session has expired. Please sign in again.</Alert>
        ) : null}
```

(`Alert` renders any non-`destructive` variant with neutral border/muted styling - see `web/src/components/ui/alert.jsx:10` - so `variant="info"` is calm, not red. The error branch wins so a failed re-login attempt is not masked by the notice.)

- [ ] **Step 3: Build**

```powershell
cd "c:\Users\Penar\CenroWatch Project\web"; npm run build
```

Expected: clean build.

- [ ] **Step 4: Live end-to-end verification (Playwright MCP)**

Start both servers in the background if they are not already running (check first; leave the user's own servers running if they are up):

```powershell
# backend
cd "c:\Users\Penar\CenroWatch Project\backend"; node src/server.js
# web (CORS allows 5173 only)
cd "c:\Users\Penar\CenroWatch Project\web"; npm run dev -- --port 5173 --strictPort
```

Then drive the browser (4 login submissions total - well under the 10-per-window auth limit):

1. Navigate to `http://localhost:5173/login`. If a previous profile session is still signed in, click Log out first.
2. Sign in as `staff@cenrowatch.local` / `StaffPass123`. Expect the staff dashboard.
3. Navigate to `http://localhost:5173/staff/complaints`.
4. Corrupt the token via browser JS: `localStorage.setItem('cenrowatch_token', 'garbage')`.
5. Click the "Wildlife" nav link. Expected: redirected to `/login`; an informational (not red) alert reads exactly "Your session has expired. Please sign in again."
6. Sign in again with the same staff account. Expected: land on `/staff/wildlife` (the page in use when the session died), NOT the dashboard.
7. Click Log out. Attempt sign-in with `staff@cenrowatch.local` / `WrongPass999`. Expected: red error alert, no session-expired notice.
8. While signed out, navigate directly to `http://localhost:5173/staff/complaints`. Expected: login page (no expired notice). Sign in with the staff account. Expected: land on `/staff/complaints` (deep-link regression check).

Cleanup: remove `.playwright-mcp/` and any screenshots from the repo root; stop any server processes started in this step (leave the user's own running).

- [ ] **Step 5: Commit the web half**

```powershell
cd "c:\Users\Penar\CenroWatch Project"; git status --short
```

Confirm exactly three modified files (`web/src/lib/api.js`, `web/src/context/AuthContext.jsx`, `web/src/pages/auth/LoginPage.jsx`), then:

```powershell
git add web/src/lib/api.js web/src/context/AuthContext.jsx web/src/pages/auth/LoginPage.jsx
git commit -m "Web: auto sign-out with a friendly notice when the session expires"
```

---

### Task 4: Mobile API client detects expired sessions

**Files:**
- Modify: `mobile/src/api/client.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function setSessionExpiredHandler(fn)` - registers a callback (or `null` to clear) invoked once per 401 on a token-carrying request, before the error is thrown. Task 5's AuthContext depends on this exact export name.

- [ ] **Step 1: Add the handler registration and a shared error helper**

In `mobile/src/api/client.js`, below the `fileUrl` function, add:

```js
// The app registers a callback here so an expired session (401 on a call
// that carried a token) can sign the user out globally. See AuthContext.
let onSessionExpired = null;
export function setSessionExpiredHandler(fn) {
  onSessionExpired = fn;
}

// Shared non-2xx path for request/requestForm: notify on expired sessions,
// then throw the normalized Error (.status, .errors) callers already expect.
function throwApiError(res, data, token) {
  if (res.status === 401 && token && onSessionExpired) onSessionExpired();
  const err = new Error(data?.message || `Request failed (${res.status})`);
  err.status = res.status;
  err.errors = data?.errors;
  throw err;
}
```

- [ ] **Step 2: Use the helper in both request paths**

In `request(...)`, replace:

```js
  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = data?.errors;
    throw err;
  }
  return data;
```

with:

```js
  if (!res.ok) throwApiError(res, data, token);
  return data;
```

In `requestForm(...)`, replace the identical non-ok block the same way:

```js
  if (!res.ok) throwApiError(res, data, token);
  return data;
```

(Login/register call `request` without a `token` argument, so they can never trigger the handler.)

- [ ] **Step 3: Verify the mobile bundle still compiles**

```powershell
cd "c:\Users\Penar\CenroWatch Project\mobile"; npx expo export --platform android
```

Expected: export completes and prints the generated `.hbc` bundle; exit code 0.

---

### Task 5: Mobile sign-out, notice on LoginScreen, verify, commit, push

**Files:**
- Modify: `mobile/src/context/AuthContext.js`
- Modify: `mobile/src/screens/LoginScreen.js`

**Interfaces:**
- Consumes: `setSessionExpiredHandler` from `../api/client` (Task 4).
- Produces: `sessionNotice` (string) on the auth context value, read by LoginScreen.

- [ ] **Step 1: Register the handler and expose sessionNotice**

In `mobile/src/context/AuthContext.js`:

Change the react import to include `useRef`:

```js
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
```

Change the client import:

```js
import { api, setSessionExpiredHandler } from '../api/client';
```

Below the `const [loading, setLoading] = useState(true);` line, add:

```js
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
```

In `persist`, clear the notice on the next successful sign-in - replace:

```js
  const persist = useCallback(async (tk, usr) => {
    await SecureStore.setItemAsync(TOKEN_KEY, tk);
    setToken(tk);
    setUser(usr);
  }, []);
```

with:

```js
  const persist = useCallback(async (tk, usr) => {
    await SecureStore.setItemAsync(TOKEN_KEY, tk);
    setToken(tk);
    setUser(usr);
    setSessionNotice('');
  }, []);
```

Add `sessionNotice` to the context value - replace:

```js
  const value = { user, token, loading, isAuthenticated: !!user, login, register, logout, updateUser };
```

with:

```js
  const value = { user, token, loading, isAuthenticated: !!user, sessionNotice, login, register, logout, updateUser };
```

- [ ] **Step 2: Show the notice on LoginScreen**

In `mobile/src/screens/LoginScreen.js`:

Change the useAuth destructure:

```js
  const { login, sessionNotice } = useAuth();
```

In the form JSX, directly below `<ErrorBanner message={error} />`, add:

```jsx
              {sessionNotice && !error ? (
                <View style={styles.notice}>
                  <Text style={styles.noticeText}>{sessionNotice}</Text>
                </View>
              ) : null}
```

Add to the StyleSheet (after the `link` entry):

```js
  notice: {
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  noticeText: { color: colors.text, fontSize: 13, lineHeight: 18 },
```

(`colors.tint` is the light-green info surface already used for notes elsewhere in the app; the error branch wins so a failed re-login is not masked.)

- [ ] **Step 3: Verify the mobile bundle**

```powershell
cd "c:\Users\Penar\CenroWatch Project\mobile"; npx expo export --platform android
```

Expected: export completes with the `.hbc` bundle; exit code 0.

- [ ] **Step 4: Commit and push**

```powershell
cd "c:\Users\Penar\CenroWatch Project"; git status --short
```

Confirm exactly three modified files (`mobile/src/api/client.js`, `mobile/src/context/AuthContext.js`, `mobile/src/screens/LoginScreen.js`), then:

```powershell
git add mobile/src/api/client.js mobile/src/context/AuthContext.js mobile/src/screens/LoginScreen.js
git commit -m "Mobile: auto sign-out with a friendly notice when the session expires"
git push
```
