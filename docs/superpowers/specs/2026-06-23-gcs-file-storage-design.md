# GCS File Storage — Design Spec

**Date:** 2026-06-23
**Author:** CENROWATCH team (via Claude Code brainstorming)
**Status:** Approved design — ready for implementation plan

## Problem

File uploads (report photos, chain-of-custody photos, request documents) are
currently written to local disk under `backend/uploads/` and served read-only at
`/uploads/...` (see [upload.js](../../../backend/src/middlewares/upload.js) and the
static mount in [app.js](../../../backend/src/app.js)). This is a deliberate
swappable stub.

CENROWATCH will be deployed to a cloud host (e.g. Render/Railway). Those platforms
use an **ephemeral filesystem** — every restart or redeploy wipes local files, so
uploaded photos and documents would silently disappear. The manuscript specifies
**Google Cloud Storage (GCS)**. This spec defines the swap from local disk to GCS.

## Goals

- Persist all uploads in GCS so they survive restarts/redeploys.
- Keep the change **contained to the storage layer** — controllers, services, web
  and mobile UIs change minimally or not at all.
- Keep **local development free and credential-free** — devs run on disk; only the
  deployed host talks to GCS.
- Honor RA 10173: sensitive files must never be world-readable by guessable URL.

## Non-Goals

- Migrating existing local files to GCS (production starts on a fresh DB).
- Image resizing/transcoding/CDN tuning (out of scope; YAGNI for a capstone).
- Changing what gets uploaded or any report/business logic.

## Decisions

### 1. Storage-driver toggle (`STORAGE_DRIVER`)

A `STORAGE_DRIVER` env var selects the backend at runtime: `local` (default, current
disk behavior) or `gcs`. Local development keeps working with no GCS account, no
card, no bucket. Only the deployed host sets `gcs`. Same code path for both, so
there is nothing GCS-specific to break local dev.

New environment variables (all secret; never committed — added to `.env.example`
with placeholder values only):

| Var | Purpose |
|---|---|
| `STORAGE_DRIVER` | `local` or `gcs` |
| `GCS_BUCKET` | target bucket name |
| `GCS_PROJECT_ID` | GCP project id |
| `GCS_CREDENTIALS_JSON` | service-account key as inline JSON (cloud hosts can't hold a key *file*) |

The service-account key is treated like `.env` — gitignored, never echoed, never
committed.

### 2. Storage abstraction with two drivers

New module `backend/src/services/storage/`:

- `index.js` — selects the driver from `STORAGE_DRIVER` and exposes a uniform
  interface (all functions operate on the **object key** — the tier+subdir+filename
  string, e.g. `public/complaints/169-ab.jpg`, with no `/files` prefix):
  - `save(subdir, file) -> Promise<{ servingPath }>` — persists one Multer file and
    returns the DB-stored serving path `/files/<key>` (see §3).
  - `url(key) -> Promise<string>` — resolves a key to a servable URL (signed GCS URL,
    or, for `local`, a path the endpoint streams from disk).
  - `remove(key) -> Promise<void>` — deletes the object/file.

  A `TIER_BY_SUBDIR` map (`complaints`/`wildlife` → `public`, `custody`/`requests` →
  `private`) is the single source of truth for which tier a subdir belongs to; `save`
  uses it to build the key.
- `local.driver.js` — current disk behavior, refactored behind the interface.
- `gcs.driver.js` — uses `@google-cloud/storage`; uploads the buffer, generates V4
  signed URLs for reads, deletes objects.

Multer switches from `diskStorage` to `memoryStorage()` (the existing 5 MB cap makes
in-memory buffering trivial). After Multer validates MIME/size, the active driver
persists `req.file` / `req.files`. The `upload.js` middleware keeps the same exported
shape (`diskUpload(subdir, allowedMime)` factory returning a Multer instance), so
controllers change by at most one line.

### 3. Driver-agnostic serving paths

The DB stores a **serving path** of the form `/files/<tier>/<subdir>/<filename>` —
e.g. `/files/public/complaints/1699999999-ab12cd.jpg` or
`/files/private/custody/1699999999-ab12cd.jpg` — instead of today's
`/uploads/complaints/...`. This is a drop-in replacement for what `publicPathFor`
returns: a root-relative path, so the web/mobile `fileUrl()` helpers (which prefix the
API origin onto a stored path) keep working unchanged.

The **object key** handed to a driver is the serving path with the leading `/files/`
stripped — i.e. `<tier>/<subdir>/<filename>`. The GCS object name (and the local
relative path) is exactly this key. The `local` driver still understands legacy
`/uploads/...` values already present in a dev DB (backward-compatible), so existing
dev data keeps working.

### 4. Single private bucket + signed URLs on read

The bucket uses **uniform bucket-level access** (Google's recommended posture) and is
**private**. Every read is served through a freshly generated **V4 signed URL**
(default 1-hour expiry). No object is ever made world-readable, and there are no
per-object ACLs or second bucket to manage. Signing is performed locally with the
service-account key — no API call, no cost.

This uniformly satisfies RA 10173: custody photos and request documents (staff-only,
potentially PII-bearing) are never reachable by a guessable URL, and report photos
shown on the public map are served via short-lived signed URLs too.

### 5. One serving endpoint: `GET /files/*` (named wildcard)

A single route centralizes access control so **existing response code does not
change** — services keep returning the stored serving path, and the web/mobile
`fileUrl()` helpers keep prefixing the API origin. Because the key contains slashes,
the route uses an **Express 5 named wildcard** (e.g. `/files/*key`), not a `:key`
segment param (which only matches one path segment). The exact wildcard syntax is
pinned during implementation; the captured tail is the object key. The endpoint:

- **Public files** — complaint and wildlife **report photos** (tier `public/`, subdirs
  `complaints`, `wildlife`): anonymous allowed → 302 redirect to a signed URL.
- **Private files** — **custody photos** and **request documents** (tier `private/`,
  subdirs `custody`, `requests`): require an authenticated Admin or CENRO_Staff → then
  302 redirect to a signed URL.

The key's first segment (`public` vs `private`) determines the access tier. The key is
built by the `TIER_BY_SUBDIR` map from §2, which replaces `publicPathFor`.

For the `local` driver, the endpoint streams the file from disk (same authz rules), so
the two drivers behave identically from the client's perspective.

### 6. Audit, deletion, serving wiring

- Custody-photo removal already writes an AuditLog; the `gcs` driver's `remove()`
  also deletes the object. No audit changes needed elsewhere (uploads are audited by
  the existing create/update mutations).
- `app.js`: mount `/files`; keep the `/uploads` static mount **only** when
  `STORAGE_DRIVER=local` (it is dead weight under `gcs`).
- `package.json`: add `@google-cloud/storage`.

## Affected files

**New**
- `backend/src/services/storage/index.js`
- `backend/src/services/storage/local.driver.js`
- `backend/src/services/storage/gcs.driver.js`
- `backend/src/routes/files.routes.js`
- `backend/src/controllers/files.controller.js`

**Changed**
- `backend/src/middlewares/upload.js` — `memoryStorage()` + delegate to driver; key
  builder with tier prefix replacing `publicPathFor`.
- `backend/src/controllers/{complaint,wildlife,request,staff.wildlife}.controller.js`
  — call the storage `save()`/key builder (≈1 line each).
- `backend/src/app.js` — mount `/files`; gate `/uploads` static behind `local`.
- `backend/.env.example` — new keys with placeholders.
- `backend/package.json` — add dependency.

**Unchanged (by design)**
- All services' response shapes (still return the stored serving-path string).
- `web/src/lib` `fileUrl`/`FILE_BASE`; `mobile/src/api/client.js` `fileUrl` — they
  already resolve a relative path against the API origin and pass through absolute
  URLs.

## Access-control summary (RA 10173)

| File type | Subdir | Tier | Who can fetch |
|---|---|---|---|
| Complaint report photo | `complaints` | public | anyone (signed URL) |
| Wildlife report photo | `wildlife` | public | anyone (signed URL) |
| Chain-of-custody photo | `custody` | private | Admin / CENRO_Staff |
| Request document | `requests` | private | Admin / CENRO_Staff |

## Error handling

- Missing/invalid `STORAGE_DRIVER` → fail fast at boot with a clear error.
- `gcs` driver with missing/invalid credentials → fail fast at boot (don't start a
  server that can't store files).
- `/files/*` for a nonexistent key → 404. For a private key without a valid
  staff/admin token → 401/403. Never leak whether a private key exists to anonymous
  callers (treat unauthorized as 404-or-401 consistently).
- Upload failure to GCS → surface as a 5xx from the create/update mutation; no DB row
  references a key that was never stored (persist file first, then write the row, or
  wrap so a failed upload aborts the mutation).

## Verification plan

Local dev cannot exercise GCS without credentials, and that is acceptable:

1. **Local driver unaffected** — full report/upload/serve flow keeps working on
   `STORAGE_DRIVER=local` exactly as today (regression check).
2. **GCS driver smoke test** — a throwaway script points the `gcs` driver at the real
   bucket using the service-account key to confirm `save` → `url` (signed, fetchable)
   → `remove`. Script is deleted, never committed.
3. **Deployed smoke test** — after deploy, submit one report with a photo and one
   request with a document; confirm the photo renders (public) and the document is
   reachable only when authenticated as staff (private).
4. **Cost guard** — a GCS Budget Alert with a low cap is configured so usage cannot
   produce a surprise charge.

## Out-of-band follow-ups (not code)

- Create the GCS project + bucket (uniform bucket-level access, private).
- Create a service-account with `Storage Object Admin` on that bucket; download its
  key; set `GCS_CREDENTIALS_JSON` on the host.
- Set a Budget Alert / cap to guarantee no spend.
- Set `CLIENT_URL` on the host (already-flagged deploy follow-up for password-reset
  email links).
