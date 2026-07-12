# Session-Expiry Handling (Web + Mobile) - Design

Date: 2026-07-12
Status: Approved (brainstormed with user; approach: reactive interceptor)

## Problem

CENROWATCH keeps a JWT in storage (web: `localStorage` via `web/src/lib/api.js`;
mobile: the auth context in `mobile/src/context/AuthContext.js`) but nothing
watches API responses for authentication failures. When the token expires
mid-session, every action fails with an inline error ("Invalid token.") and the
app never signs the user out. The user has to figure out on their own that they
must log out and back in. This is the largest real-user robustness gap found in
the UI/UX audit.

## Goals

- Any authenticated API call that returns 401 signs the user out exactly once
  and lands them on the login screen with a calm, human notice.
- On web, after re-login the user returns to the page they were on.
- On web, deep links to protected pages survive the login detour.
- No backend changes. No new dependencies.

## Non-goals

- Proactive expiry timers, refresh tokens, sliding sessions, or "stay signed
  in?" prompts (explicitly rejected during brainstorming as overkill; the JWT
  lifetime can be set comfortably via env).
- Mobile "return to where you were" (the tab stack resets on sign-out, which
  is normal mobile behavior).
- Staff notification bell, toasts, confirmations, accessibility pass (out of
  scope this round; kept in the audit backlog).

## Design

### 1. Web: detection (web/src/lib/api.js)

In `apiFetch`, after the `fetch` resolves: if `res.status === 401` AND the
request was authenticated (`auth: true` and a token was attached), dispatch
`window.dispatchEvent(new CustomEvent('cenrowatch:session-expired'))`, then
throw the error exactly as today so existing page-level catch paths keep
working.

- Login/register/forgot/reset calls pass `auth: false`, so a wrong password
  can never trigger the event.
- 403 (authenticated but wrong role) is untouched - that is authorization,
  not expiry.
- The PDF download helper in the same file performs its own `fetch` with a
  token; it gets the same 401-then-dispatch check.

### 2. Web: sign-out and notice (web/src/context/AuthContext.jsx)

`AuthProvider` (already inside `BrowserRouter`, so `useNavigate` is available)
adds a `useEffect` that subscribes to `cenrowatch:session-expired`:

- If `user` is currently set (a real mid-session expiry): save
  `location.pathname + location.search` to
  `sessionStorage['cenrowatch_resume']`, clear the token and user, and
  `navigate('/login', { state: { expired: true } })`.
- If `user` is null (stale token at boot, e.g. opening the app days later):
  clear the token silently. No banner - the user was not mid-task, and the
  boot-time `/auth/me` failure already lands them on login today.
- Idempotent where it matters: the resume-path save, navigation, and banner
  happen at most once (only while `user` is still set). Repeated events from
  parallel requests that all 401 together only re-clear the token, which is
  harmless.

### 3. Web: login page return trip (web/src/pages/auth/LoginPage.jsx)

- When `location.state?.expired` is set, render an informational notice (not
  the red error style): "Your session has expired. Please sign in again."
- After a successful login: if `sessionStorage['cenrowatch_resume']` exists,
  navigate there and remove the key; otherwise use the current role-based
  default. `ProtectedRoute` still role-guards the destination, so signing in
  as a different account safely bounces to that account's own home.

### 4. Web: deep links (web/src/components/ProtectedRoute.jsx)

When an unauthenticated visitor hits a protected URL, save the attempted path
to the same `cenrowatch_resume` key before redirecting to `/login`. One
mechanism serves both "session expired mid-task" and "someone shared a link".

### 5. Mobile: detection and handler (mobile/src/api/client.js,
mobile/src/context/AuthContext.js, login screen)

React Native has no window events, so the API client exposes a module-level
registration instead:

- `client.js`: `setSessionExpiredHandler(fn)`; on 401 for a request that
  carried a token, call the handler (if registered), then throw as today.
- `AuthContext.js`: register the handler on mount (and unregister on
  unmount). The handler clears the stored token and user state and sets a new
  `sessionNotice` string in context: "Your session has expired. Please sign
  in again." Clearing auth state makes the app render the auth stack, as it
  already does on manual logout.
- Login screen: render `sessionNotice` as an informational banner when
  present; clear it on the next successful sign-in.

### Copy

Exactly one user-facing string, both platforms:
"Your session has expired. Please sign in again."
(Informational tone and styling, not an error. No dashes, no "official".)

## Files touched

- `web/src/lib/api.js` - 401 check + event dispatch (apiFetch + download helper)
- `web/src/context/AuthContext.jsx` - event listener, resume-path save, sign-out
- `web/src/pages/auth/LoginPage.jsx` - expired notice + resume navigation
- `web/src/components/ProtectedRoute.jsx` - save attempted path for deep links
- `mobile/src/api/client.js` - 401 check + handler registration
- `mobile/src/context/AuthContext.js` - handler, sessionNotice state
- `mobile/src/screens/LoginScreen.js` - notice banner

No backend changes. No AuditLog entry needed (nothing mutates server data).

## Verification

- Web build passes (`npm run build` in `web/`).
- Playwright on 5173 (CORS allows 5173 only; keep auth calls minimal because
  `/auth` is rate-limited): log in, overwrite `localStorage.cenrowatch_token`
  with garbage, click a nav item; expect the login page with the notice; log
  back in; expect to land on the page that was open. Also: while logged out,
  open a deep protected URL, log in, expect to land on that URL.
- Wrong-password login still shows the normal error, no expired notice.
- Mobile: `npx expo export --platform android` bundle check (no emulator
  drive; logic is shared with the verified web pattern).
