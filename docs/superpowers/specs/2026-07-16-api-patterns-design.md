# API Patterns: Smart Polling + Barangay Cache - Design

Date: 2026-07-16
Status: Approved (brainstormed with user; audit first, then scoped to what fits)

## Background: the audit

The request was to check the frontend for five data-fetching patterns and
implement whichever fit the project. Findings:

| Pattern | Verdict |
|---|---|
| Optimistic updates | Already implemented where appropriate (NotificationBell mark-read / mark-all with rollback). Staff/admin record mutations stay pessimistic ON PURPOSE: they are audit-logged government workflow actions that trigger emails and SLA recomputes; the UI must not claim success before the server confirms. |
| Smart polling | Missing. The bell polls every 30s even in hidden tabs. IN SCOPE. |
| Request deduplication | No app-wide need (one fetch per page mount; concurrent duplicates do not occur). The one real inefficiency is the immutable barangay list refetched on every form mount. IN SCOPE via the cache below. |
| Stale-while-revalidate | Not implemented, and correctly so for staff/admin queues: staff act on report statuses, so always-fresh + skeletons is the safer design. Only SWR-safe data is the barangay list. IN SCOPE via the cache below. |
| Streaming UI | No use case (plain JSON REST, no SSE/chat/LLM; PDF export is a blob). OUT OF SCOPE. |

Also out of scope per YAGNI: any app-wide SWR/dedup layer or a react-query
dependency (contradicts the dependency-light stance and queue freshness).

## Goals

1. The notification bell makes zero requests while its tab is hidden and
   refreshes immediately when the tab becomes visible again.
2. The barangay list (18 immutable seeded rows) is fetched at most once per
   app session on each platform, shared by all consumers, including
   concurrent ones.
3. Zero call-site changes; consumer error handling unchanged.

## Design

### 1. Smart polling (web/src/components/resident/NotificationBell.jsx)

The polling effect changes in place:
- the 30s interval callback runs `load()` only when `!document.hidden`;
- a `visibilitychange` listener calls `load()` immediately when the document
  becomes visible;
- both interval and listener are cleaned up in the effect return.

No backoff logic: a 401 after expiry is handled globally by the
session-expiry interceptor, and other failures keep the existing
"keep last good state" catch and simply wait for the next tick.

### 2. Barangay promise cache (API layer, both platforms)

`barangayApi.list()` in `web/src/lib/api.js` and `api.barangays()` in
`mobile/src/api/client.js` each hold a module-level `barangaysPromise`:

- first call stores the in-flight promise and returns it;
- every later or concurrent call returns the same promise (dedup + cache);
- on rejection the cache is cleared before the error re-throws, so a
  rejection is never cached and the next mount retries cleanly.

Consumers untouched: web `BarangaySelect`, `AdminUsersPage`; mobile
`useBarangays`, `RegisterScreen`. Staleness is a non-issue: the list is
immutable seed data; a page/app restart clears the cache naturally.

## Files touched

- `web/src/components/resident/NotificationBell.jsx` - polling effect
- `web/src/lib/api.js` - barangayApi.list promise cache
- `mobile/src/api/client.js` - api.barangays promise cache

No backend changes. No new dependencies. No AuditLog entry needed.

## Verification

- Web build passes.
- Playwright network-log checks on 5173:
  - open a report form: exactly one `/barangays` request; navigate to a
    second barangay-bearing page: no new `/barangays` request;
  - with `document.hidden` stubbed via `Object.defineProperty` and a
    synthetic `visibilitychange` dispatched, hidden = no `/notifications`
    request on the next tick window, visible again = an immediate
    `/notifications` request.
- Mobile: `npx expo export --platform android` bundle check.
