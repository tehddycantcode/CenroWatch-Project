# Smart Polling + Barangay Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The notification bell stops polling in hidden tabs and refreshes instantly on return; the immutable barangay list is fetched at most once per app session on each platform.

**Architecture:** Two self-contained tweaks at existing seams. The bell's polling effect gains a `document.hidden` guard plus a `visibilitychange` listener. The barangay API function on each platform memoizes its in-flight promise at module level (cache + concurrent-request dedup in one), clearing it on rejection so failures are never cached. No new dependencies, no backend changes, zero call-site changes.

**Tech Stack:** React 18 + Vite 5 (web); React Native + Expo SDK 56 (mobile).

**Spec:** `docs/superpowers/specs/2026-07-16-api-patterns-design.md`

## Global Constraints

- Zero call-site changes: `BarangaySelect`, `AdminUsersPage`, mobile `useBarangays`, `RegisterScreen` must remain untouched, with their existing error handling intact.
- A rejected barangay fetch must never stay cached: clear the module-level promise before rethrowing.
- No new dependencies; no backend changes; no AuditLog (nothing mutates server data).
- ASCII-only source edits; match surrounding code style and comment density.
- This repo has no unit-test framework; verification is `npm run build` (web), live Playwright checks on http://localhost:5173 (CORS allows only 5173), and `npx expo export --platform android` (mobile). Every node/npm command in a fresh PowerShell needs the PATH prefix first: `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`
- `/auth` is rate-limited (10 requests per window); the verification script uses 1 login.
- Test account: juan.delacruz@example.com / Resident123 (Resident — has both the bell and the report forms).
- Do not stage `.playwright-mcp/`, `.superpowers/`, screenshots, `.agents/`, `.claude/`, or `skills-lock.json`.

---

### Task 1: Smart polling in NotificationBell

**Files:**
- Modify: `web/src/components/resident/NotificationBell.jsx:34-39`

**Interfaces:**
- Consumes: existing `load` callback (already `useCallback([])`-stable in this file).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the polling effect**

Replace:

```jsx
  // Initial load + poll every 30s.
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);
```

with:

```jsx
  // Initial load + poll every 30s. Smart polling: ticks are skipped while
  // the tab is hidden (no wasted requests), and returning to the tab
  // refreshes immediately instead of waiting for the next tick.
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 30000);
    function onVisibility() {
      if (!document.hidden) load();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);
```

- [ ] **Step 2: Build**

Run (PowerShell, with the PATH prefix from Global Constraints):

```powershell
cd "c:\Users\Penar\CenroWatch Project\web"; npm run build
```

Expected: clean build (`built in Ns`, no new warnings).

Do NOT commit — the web commit is batched at Task 3.

---

### Task 2: Barangay promise cache (web)

**Files:**
- Modify: `web/src/lib/api.js:115-117`

**Interfaces:**
- Consumes: existing `apiFetch`.
- Produces: `barangayApi.list()` keeps its exact signature and return shape (a promise of the parsed JSON body) — callers stay unchanged.

- [ ] **Step 1: Memoize the list promise**

Replace:

```js
export const barangayApi = {
  list: () => apiFetch('/barangays', { auth: false }),
};
```

with:

```js
// The barangay list is immutable seed data (18 rows): cache the in-flight
// promise so every consumer shares one fetch per session (this also dedups
// concurrent callers). A failed fetch clears the cache before rethrowing,
// so a rejection is never cached and the next mount retries cleanly.
let barangaysPromise = null;
export const barangayApi = {
  list: () => {
    if (!barangaysPromise) {
      barangaysPromise = apiFetch('/barangays', { auth: false }).catch((err) => {
        barangaysPromise = null;
        throw err;
      });
    }
    return barangaysPromise;
  },
};
```

- [ ] **Step 2: Build**

```powershell
cd "c:\Users\Penar\CenroWatch Project\web"; npm run build
```

Expected: clean build.

Do NOT commit — the web commit is batched at Task 3.

---

### Task 3: Web live verification and commit

**Files:**
- No new edits; verifies Tasks 1-2 and commits them.

**Interfaces:**
- Consumes: Task 1's polling effect, Task 2's cache.

- [ ] **Step 1: Start servers (if not already running)**

```powershell
# backend (background)
cd "c:\Users\Penar\CenroWatch Project\backend"; node src/server.js
# web on 5173 only (background)
cd "c:\Users\Penar\CenroWatch Project\web"; npm run dev -- --port 5173 --strictPort
```

Backend readiness probe: `http://localhost:5000/api/health` (NOT under /api/v1).

- [ ] **Step 2: Barangay cache check (Playwright, network log)**

1. Navigate to `http://localhost:5173/login` (log out first if a session is active); sign in as juan.delacruz@example.com / Resident123.
2. Navigate to `/resident/report-complaint`, confirm the barangay dropdown is populated (18 options + placeholder).
3. Navigate to `/resident/request-service`, confirm its barangay dropdown is also populated.
4. Read the browser network log (browser_network_requests): expect EXACTLY ONE request to `/api/v1/barangays` across both form visits.

- [ ] **Step 3: Smart polling check (Playwright, network log)**

1. Still signed in, on any resident page: record the current count of `/api/v1/notifications` requests.
2. Stub the tab hidden and announce it:
```js
Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
document.dispatchEvent(new Event('visibilitychange'));
```
3. Wait 35 seconds (one full tick window). Expect the `/api/v1/notifications` count to be UNCHANGED (hidden tick skipped).
4. Stub visible and announce it:
```js
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
document.dispatchEvent(new Event('visibilitychange'));
```
5. Expect ONE NEW `/api/v1/notifications` request within a couple of seconds (immediate refresh on return).

- [ ] **Step 4: Cleanup and commit**

Remove `.playwright-mcp/` and any screenshots; stop any servers this task started (leave the user's own running); close the browser.

```powershell
cd "c:\Users\Penar\CenroWatch Project"; git status --short
```

Confirm exactly two modified files (`web/src/components/resident/NotificationBell.jsx`, `web/src/lib/api.js`), then:

```powershell
git add web/src/components/resident/NotificationBell.jsx web/src/lib/api.js
git commit -m "Web: smart polling for notifications and a cached barangay list"
```

(End the commit message with this trailer on its own line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`)

---

### Task 4: Barangay promise cache (mobile), verify, commit, push

**Files:**
- Modify: `mobile/src/api/client.js:87` (the `barangays` entry in the `api` object, plus a module-level variable above the object)

**Interfaces:**
- Consumes: existing `request` helper.
- Produces: `api.barangays()` keeps its exact signature and return shape — `useBarangays` and `RegisterScreen` stay unchanged.

- [ ] **Step 1: Memoize the list promise**

Directly above the `export const api = {` line, add:

```js
// The barangay list is immutable seed data (18 rows): cache the in-flight
// promise so the register screen and the report forms share one fetch per
// app session. A failed fetch clears the cache before rethrowing, so a
// rejection is never cached and the next mount retries cleanly.
let barangaysPromise = null;
```

Then replace the `barangays` entry:

```js
  barangays: () => request('/barangays'),
```

with:

```js
  barangays: () => {
    if (!barangaysPromise) {
      barangaysPromise = request('/barangays').catch((err) => {
        barangaysPromise = null;
        throw err;
      });
    }
    return barangaysPromise;
  },
```

- [ ] **Step 2: Verify the mobile bundle**

```powershell
cd "c:\Users\Penar\CenroWatch Project\mobile"; npx expo export --platform android
```

Expected: export completes with the `.hbc` bundle, exit code 0.

- [ ] **Step 3: Commit and push**

```powershell
cd "c:\Users\Penar\CenroWatch Project"; git status --short
```

Confirm exactly one modified file (`mobile/src/api/client.js`), then:

```powershell
git add mobile/src/api/client.js
git commit -m "Mobile: cache the barangay list (one fetch per app session)"
git push
```

(End the commit message with this trailer on its own line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`)
