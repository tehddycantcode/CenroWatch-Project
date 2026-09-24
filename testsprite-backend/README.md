# CenroWatch backend API — TestSprite suite

21 backend tests covering the Express API: 17 endpoint tests plus a
4-test integration chain in `integration/`. Each `.py` file is a standalone
TestSprite backend test: a plain `requests` script with concrete assertions,
executed from TestSprite's cloud.

- **TestSprite project:** `CenroWatch backend API`
  (`974cd510-b596-4739-922c-192632843333`, type `backend`)
- **Frontend plans** for the web UI live separately in [`testsprite-plans/`](../testsprite-plans/).

## THE ONE THING THAT WILL BREAK THIS

TestSprite runs backend tests **from its own cloud**, and `--target-url` refuses
`localhost` and private IPs. The `--local <port>` tunnel is **frontend-only**.
So the API at `localhost:5000` is only testable while a **public tunnel** is open,
and a cloudflared quick tunnel gets a **new random URL every restart**.

A stale URL shows up as every test failing at once with a connection error —
the API itself is fine. Re-point it (see below) before concluding anything is broken.

## Runbook — from cold to a green run

```bash
# 1. Start the API (native setup: backend/node_modules exists)
cd backend && npm run dev            # http://localhost:5000

# 2. Open a public tunnel (binary lives in the scratchpad; re-install with
#    `npm i cloudflared` anywhere if it is gone)
cloudflared tunnel --url http://localhost:5000
#    -> note the https://<random>.trycloudflare.com line

# 3. Point the project at the new URL
testsprite project update 974cd510-b596-4739-922c-192632843333 --url https://<new>.trycloudflare.com

# 4. Run one test, or the whole suite
testsprite test run <testId> --wait
testsprite test run --all --project 974cd510-b596-4739-922c-192632843333 --wait
```

Each backend run costs **~0.2 credits**, so the full 17 is roughly **3.4 credits**.
Check `testsprite usage` before a full sweep.

## Auth

The project carries a **static Bearer token** (an Admin JWT) that TestSprite
injects into every test as `__AUTH_HEADERS__`. No token, key, or password is
hardcoded in any test file.

`JWT_EXPIRES_IN` is **7d**, so the credential goes stale after a week. Re-mint it
without ever printing it to a terminal:

```bash
# writes only the JWT into the file
node scripts/mint-testsprite-token.mjs https://<tunnel> ./admin.token admin@cenrowatch.local "<password>"
testsprite project credential 974cd510-b596-4739-922c-192632843333 \
  --type "Bearer token" --credential-file ./admin.token
rm ./admin.token
```

Auto-refreshing auth (`project auto-auth`) would remove this chore, but it is a
**Pro** feature and this workspace is on Free.

Symptom of an expired credential: the 9 authenticated tests fail with 401 while
the 8 public ones stay green.

## What the suite covers

| # | Test | Guards |
|---|------|--------|
| 01 | Health endpoint | service up, identity fields |
| 02 | Public barangay list | all 18, Cabuyao bounds, **no personal data** |
| 03 | Public categories | report forms have options |
| 04 | Public GIS map | **R.A. 10173** — marker key allowlist + raw-payload scan |
| 05 | Endangered obfuscation | public coords shifted ~0.001°, plain ones not, shift **stable** |
| 06 | Public GIS stats | counters non-negative and mutually consistent |
| 07 | Login, wrong password | 401, generic message, **no token, no cookie** |
| 08 | Login validation | **422** (not 400) + per-field errors |
| 09 | `/auth/me` | 401 anonymous & forged; 200 signed in; **never returns a password** |
| 10 | RBAC | 10 admin/staff routes refuse anonymous **and** forged tokens |
| 11 | Admin analytics | totals reconcile, 18 barangays, 6-month trend, SLA maths |
| 12 | Admin users | **no password / bcrypt hash** ever serialised |
| 13 | Admin settings | the 4 `*_minutes` SLA windows + office coordinates |
| 14 | Audit log | pagination advances, page 2 is a different slice |
| 15 | Staff overview | `by_status` sums to total; cards equal the queues |
| 16 | Unknown tracking id | clean 404, no record, no personal data |
| 17 | `/uploads` | unsigned **403**, forged signature 403, traversal refused |

## Integration tests (`integration/`)

TestSprite's **Integration Tests** tab is not something you author directly. The
platform *auto-assembles* it from backend tests that share captured variables
across a POST+GET/PUT/DELETE lifecycle, and the assembled result is **run from
the portal** — `test run --all` deliberately skips it ("assembled integration
test skipped (run via the portal)").

What you author is the chain. `--produces` / `--needs` declare the shared
variables and drive wave ordering; `--category teardown` puts cleanup in the
final wave.

| # | Test | produces / needs |
|---|------|------------------|
| 1 | A resident files a complaint with a photo | produces `testsprite_complaint_tracking_id` |
| 2 | The resident tracks it anonymously, sees no personal data | needs it |
| 3 | Staff review, the SLA clock, the status reaching the resident | needs it, produces `testsprite_complaint_reviewed` |
| 4 | Teardown archives the records and restores every figure | needs both, `--category teardown` |

Run the chain (about 0.8 credits):

```bash
testsprite test run --all --project 974cd510-b596-4739-922c-192632843333   --filter "Lifecycle" --wait
```

### These tests WRITE to the dev database

That is unavoidable — a lifecycle test has to create something. It is made safe
by three rules:

1. **Everything created carries `[TESTSPRITE]`** in its description.
2. **Teardown archives every live marked record**, not just the current run's, so
   a run that dies half way does not leave test data behind. Each candidate is
   re-read and confirmed to carry the marker before it is touched — cleanup is
   scoped to those rows, never to a broad predicate.
3. **Archiving is the system's soft delete.** GIS, analytics, the staff queues
   and public tracking all filter archived rows, so the map, the dashboard and
   the SLA figures come back exactly as the run found them.

Verified before and after a full cloud run: complaints 59 -> 59, total reports
72 -> 72, public map markers 57 -> 57, live marked complaints 0.

**What does persist:** an AuditLog row per mutation (by design — every mutation
writes one), the archived Complaint rows themselves (invisible to the app; there
is no DELETE endpoint), the uploaded 1x1 PNG in `uploads/`, and the tracking-id
sequence, which advances by one per run. If you quote report counts in the
manuscript, those are unaffected; if you quote **audit-log counts**, they are not.

### What the chain proves that no single-endpoint test can

- The public tracking page and the staff detail view disagree about the *same
  record* in exactly the way R.A. 10173 requires — staff see the reporter, the
  public sees a status and nothing else.
- A status change made by staff **reaches the resident's tracking page**.
- The SLA clock **starts on approval, not at intake**, and a status round trip
  (`Approved -> Pending -> Approved`) does **not** mint a fresh deadline — which
  is what stops a breach being erased by toggling the status.
- Every transition is journalled with old status, new status, who and when.
- An archived report disappears from the queue, the tracking page **and** the
  public map at once.


## Verified contract facts these tests rely on (probed 2026-09-25)

| Behavior | Observed |
|---|---|
| Validation failure | **422**, `errors[]` of `{field, message}` |
| Missing token | 401 `"Not signed in."` |
| Bad/garbage token | 401 `"Invalid or expired token."` |
| Wrong password | 401 `"Invalid email or password."` |
| Unsigned `/uploads/...` | 403 `"This link is missing its access token."` |
| Unknown route | 404 `"Route not found: ..."` |
| Public marker keys | id, kind, category, status, priority, barangay, latitude, longitude, endangered |

## Running them locally (free, no credits)

`scripts/run-testsprite-backend-locally.py` execs each file with `TARGET_URL` and
`__AUTH_HEADERS__` injected exactly as TestSprite does. Use it to check a test
before uploading it:

```bash
py scripts/run-testsprite-backend-locally.py http://localhost:5000 ./admin.token testsprite-backend/*.py
```

## Adding a test

Start from `_header_template.py` (the `_base_url()` / `_auth_headers()` preamble
every file shares), append a body, verify locally, then:

```bash
testsprite test create --type backend --name "<behavior>" \
  --code-file ./testsprite-backend/<file>.py \
  --project 974cd510-b596-4739-922c-192632843333
```
