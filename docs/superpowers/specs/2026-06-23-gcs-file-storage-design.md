# GCS File Storage — Design Spec

**Date:** 2026-06-23 (rev. 2 — serving model changed to sign-at-response)
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
- Keep the change **contained to the storage layer** — controllers change minimally,
  services and UIs almost not at all.
- Keep **local development free and credential-free** — devs run on disk; only the
  deployed host talks to GCS.
- Honor RA 10173: files are never world-readable by a permanent guessable URL.

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

- `index.js` — selects the driver from `STORAGE_DRIVER` and exposes:
  - `save(subdir, file) -> Promise<string>` — persists one Multer (memory) file and
    returns the **stored path** `/uploads/<subdir>/<generated-filename>` (see §3). The
    filename is generated here (`<timestamp>-<random><ext>`), since memory storage
    has no filename.
  - `fileUrl(storedPath) -> Promise<string|null>` — resolves a stored path to a
    servable URL. `local`: returns the path unchanged (served by the `/uploads` static
    mount). `gcs`: returns a fresh **V4 signed URL** (1-hour expiry). `null`/empty in,
    `null` out.
  - `signFiles(payload) -> Promise<payload>` — returns a deep copy of an API response
    payload with known file fields resolved to URLs via `fileUrl` (see §5).
  - `remove(storedPath) -> Promise<void>` — deletes the underlying object/file
    (best-effort; never throws to callers).
- `local.driver.js` — disk behavior: `save` writes the Multer `buffer` to
  `UPLOAD_ROOT/<subdir>/<filename>`; `fileUrl` returns the path as-is; `remove`
  unlinks the file.
- `gcs.driver.js` — uses `@google-cloud/storage`: `save` uploads the buffer to object
  `<subdir>/<filename>`; `fileUrl` generates a V4 signed read URL; `remove` deletes
  the object.

Multer switches from `diskStorage` to `memoryStorage()` (the existing 5 MB cap makes
in-memory buffering trivial); MIME/size validation in `diskUpload(subdir, allowedMime)`
is unchanged. The factory keeps its name and signature so route files don't change.

### 3. Stored path shape (back-compatible)

The DB stores `/uploads/<subdir>/<filename>` for **both** drivers — the same shape
`publicPathFor` produces today — so existing dev rows keep working and the web/mobile
`fileUrl()` helpers need no change. The GCS **object name** is the stored path minus
the leading `/uploads/` (e.g. stored `/uploads/custody/169-ab.jpg` → object
`custody/169-ab.jpg`).

### 4. One private bucket, signed URLs at read time

The bucket uses **uniform bucket-level access** (Google's recommended posture) and is
**private**. No object is ever public. Every served URL is a freshly generated **V4
signed URL** (1-hour expiry), produced when the API builds a response (§5). Signing is
performed locally with the service-account key — no API call, no cost.

Authorization is **the endpoint that returns the URL**, which is already correctly
role-gated:

| File field | Returned by | Who reaches it |
|---|---|---|
| Report `photo_path` | resident/public/staff report endpoints | reporter, staff, public map |
| Request `document_path` | owner's request endpoint + staff request endpoints | owning resident, staff |
| `chain_of_custody_photos` | staff wildlife **detail** only (`/staff/wildlife/:id`) | Admin / CENRO_Staff |

A short-lived signed URL is the capability, so it works directly in `<img src>` and
download links with **no `Authorization` header** — which is exactly what a browser
cannot send for image/download requests. This is why a header-authenticated serving
endpoint was rejected.

### 5. Sign at response time (`signFiles`)

`signFiles(payload)` deep-copies an API response payload and replaces known file
fields with resolved URLs:

- `photo_path` (string) → `await fileUrl(value)`
- `document_path` (string) → `await fileUrl(value)`
- `chain_of_custody_photos` (string[]) → `[{ key, url }]`, where `key` is the stored
  path (unchanged, used for removal) and `url` is `await fileUrl(key)` (for display).

It recurses through plain objects and arrays (nested `barangay`, `resident`, etc. have
no file fields, so they pass through untouched) and is idempotent on already-absolute
URLs. Controllers wrap their `data` object in one `await signFiles(...)` call before
`res.json`. Under the `local` driver every replacement is a no-op string pass-through,
so local responses are byte-for-byte unchanged (regression-safe); only `gcs` produces
signed URLs.

### 6. Custody add/remove identity

`chain_of_custody_photos` is an additive array with a per-photo remove. The DB keeps
storing **plain stored-path strings** (`/uploads/custody/...`); only the *response* is
reshaped to `{ key, url }` by `signFiles`. On removal the web client sends back the
`key`, so the service's existing exact-match filter is unchanged; it additionally calls
`storage.remove(key)` (best-effort) so the bucket object is also deleted. The only web
change is `CustodyPhotos.jsx` reading `photo.url`/`photo.key` instead of a bare string.

### 7. Wiring

- `app.js`: keep the `/uploads` static mount **only** when `STORAGE_DRIVER=local` (dead
  weight under `gcs`, where no files are written locally).
- `package.json`: `@google-cloud/storage` is already a dependency (`^7.21.0`) — confirm
  it is installed; no add needed.
- No new routes, no new endpoint.

## Affected files

**New**
- `backend/src/services/storage/index.js`
- `backend/src/services/storage/local.driver.js`
- `backend/src/services/storage/gcs.driver.js`

**Changed**
- `backend/src/middlewares/upload.js` — `memoryStorage()`; drop `publicPathFor`
  (replaced by `storage.save`); keep `diskUpload` factory + `UPLOAD_ROOT` export.
- `backend/src/controllers/complaint.controller.js` — `save` on create; `signFiles` on
  `listMine`/`getByTracking` (and `create` response).
- `backend/src/controllers/wildlife.controller.js` — `save` on create; `signFiles` on
  `listMine`/`getByRef`/create response.
- `backend/src/controllers/request.controller.js` — `save` on create; `signFiles` on
  `listMine`/`getByTracking`/create response.
- `backend/src/controllers/staff.complaint.controller.js` — `signFiles` on list/detail.
- `backend/src/controllers/staff.wildlife.controller.js` — `save` on custody upload;
  `signFiles` on list/detail/status/update responses.
- `backend/src/controllers/staff.request.controller.js` — `signFiles` on list/detail.
- `backend/src/services/staff.wildlife.service.js` — `removeCustodyPhoto` calls
  `storage.remove(key)` (best-effort).

(The public map / gis payload carries no `photo_path`, and the public complaint-track
endpoint returns zero file fields, so neither is touched.)
- `backend/src/app.js` — gate `/uploads` static behind `local`.
- `backend/.env.example` — new keys with placeholders.

**Changed (web)**
- `web/src/components/staff/CustodyPhotos.jsx` — read `{ key, url }` items.

**Unchanged (by design)**
- Web/mobile `fileUrl`/`FILE_BASE` helpers (absolute signed URLs pass straight through;
  local paths resolve against the API origin as today).
- All route files (the `diskUpload` factory keeps its name/signature).
- Report-photo / request-document display components (they render a URL string either
  way).

## Error handling

- Missing/invalid `STORAGE_DRIVER` → fail fast at boot with a clear error.
- `gcs` driver with missing/invalid `GCS_*` config → fail fast at boot (don't start a
  server that cannot store files).
- `save` failure (GCS upload error) → propagates as a 5xx from the create/upload
  mutation, before any DB row references a key that was never stored.
- `fileUrl`/`signFiles` for a missing object → return the best available value without
  throwing (a broken image is preferable to a 500 on a list endpoint); log server-side.
- `remove` failure → swallow (best-effort); the DB array entry is already gone.

## Verification plan

Local dev cannot exercise GCS without credentials, and that is acceptable:

1. **Local driver unaffected** — full report/upload/serve flow works on
   `STORAGE_DRIVER=local` exactly as today; responses are unchanged (regression check).
2. **`signFiles` unit check** — a small Node script asserts that under `local`,
   `signFiles` passes paths through unchanged and reshapes `chain_of_custody_photos` to
   `{ key, url }` with `url === key`.
3. **GCS driver smoke test** — a throwaway script points the `gcs` driver at the real
   bucket using the service-account key to confirm `save` → `fileUrl` (signed,
   fetchable) → `remove`. Script is deleted, never committed.
4. **Deployed smoke test** — after deploy, submit one report with a photo and one
   request with a document; confirm both render via signed URLs and that the URLs expire.
5. **Cost guard** — a GCS Budget Alert with a low cap is configured so usage cannot
   produce a surprise charge.

## Out-of-band follow-ups (not code)

- Create the GCS project + bucket (uniform bucket-level access, private).
- Create a service-account with `Storage Object Admin` on that bucket; download its
  key; set `GCS_CREDENTIALS_JSON` on the host. Choose an **Always-Free region**
  (`us-east1`, `us-west1`, or `us-central1`) so free-tier storage applies.
- Set a Budget Alert / cap to guarantee no spend.
- Set `CLIENT_URL` on the host (already-flagged deploy follow-up for password-reset
  email links).
