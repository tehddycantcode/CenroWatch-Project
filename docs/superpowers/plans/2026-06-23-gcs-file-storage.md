# GCS File Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move file uploads (report photos, custody photos, request documents) from local disk to Google Cloud Storage, behind a runtime `STORAGE_DRIVER` toggle, so files survive cloud-host restarts while local dev stays credential-free.

**Architecture:** A storage facade (`backend/src/services/storage/`) with two drivers — `local` (disk, today's behavior) and `gcs` (private bucket + short-lived V4 signed URLs). Multer buffers uploads in memory; the active driver persists the buffer and returns a driver-agnostic stored path (`/uploads/<subdir>/<file>`). Responses resolve file fields to servable URLs at render time via `signFiles` (a no-op pass-through under `local`, signed URLs under `gcs`). No serving endpoint; authorization is the already-role-gated API that returns each URL.

**Tech Stack:** Node.js + Express 5, Multer 2 (`memoryStorage`), `@google-cloud/storage` v7 (already a dependency), Prisma 6 / MySQL (unchanged).

## Global Constraints

Copied from `CLAUDE.md` and the spec — every task implicitly includes these:

- **Never hardcode secrets** — all GCS config via `.env`; the key file/JSON is gitignored (`.gitignore` already covers `gcs-key.json`, `**/gcs-key.json`, `*.key`).
- **No raw SQL** — Prisma only (this feature adds no queries).
- **Stored path shape is `/uploads/<subdir>/<filename>` for both drivers** — keeps the DB value driver-agnostic and backward-compatible.
- **GCS objects are never public** — one private bucket, uniform bucket-level access; every read is a fresh **V4 signed URL, 1-hour expiry**.
- **Windows/PowerShell:** a fresh shell lacks Node on PATH. Prefix the first node/npm call in a shell with:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`
- **One PowerShell statement per concern** (chain with `&&`, don't newline-separate); **delete throwaway `_*.mjs` scripts** after use; **keep all edits ASCII-only**.
- **Don't hammer `/auth`** (rate-limited) in tests — prefer direct-module verification over HTTP where possible.
- `@google-cloud/storage` is already in `backend/package.json` (`^7.21.0`) — confirm installed, do not add.

---

### Task 1: Storage facade — local driver, index, `signFiles`

**Files:**
- Create: `backend/src/services/storage/local.driver.js`
- Create: `backend/src/services/storage/index.js`
- Test: `backend/_verify_storage.mjs` (throwaway — deleted in the last step)

**Interfaces:**
- Produces (consumed by every later task):
  - `storage.save(subdir: string, file: MulterFile) -> Promise<string>` — returns stored path `/uploads/<subdir>/<filename>`. `file` has `.buffer`, `.originalname`, `.mimetype` (Multer memoryStorage).
  - `storage.fileUrl(storedPath: string|null) -> Promise<string|null>`
  - `storage.remove(storedPath: string|null) -> Promise<void>`
  - `storage.signFiles(payload: any) -> Promise<any>` — deep-copies, resolving `photo_path`/`document_path` (string→url) and `chain_of_custody_photos` (string[]→`[{key,url}]`).
- Consumes: `UPLOAD_ROOT` from `backend/src/middlewares/upload.js` (already exported).

- [ ] **Step 1: Create the local driver**

Create `backend/src/services/storage/local.driver.js`:

```js
// Local-disk storage driver. Persists Multer (memory) buffers under
// UPLOAD_ROOT/<subdir>/ and serves them via the /uploads static mount (gated to
// this driver in app.js). fileUrl is a pass-through: the stored path IS the URL.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { UPLOAD_ROOT } = require('../../middlewares/upload');

function genFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase() || '.bin';
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

// Persist one in-memory Multer file. Returns "/uploads/<subdir>/<filename>".
async function save(subdir, file) {
  const dir = path.join(UPLOAD_ROOT, subdir);
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = genFilename(file.originalname);
  await fs.promises.writeFile(path.join(dir, filename), file.buffer);
  return `/uploads/${subdir}/${filename}`;
}

// Local files are served directly by the static mount; the stored path is the URL.
async function fileUrl(storedPath) {
  return storedPath || null;
}

// Delete the underlying file (best-effort).
async function remove(storedPath) {
  if (!storedPath || !storedPath.startsWith('/uploads/')) return;
  const rel = storedPath.replace(/^\/uploads\//, '');
  await fs.promises.unlink(path.join(UPLOAD_ROOT, rel)).catch(() => {});
}

module.exports = { save, fileUrl, remove };
```

- [ ] **Step 2: Create the facade with `signFiles`**

Create `backend/src/services/storage/index.js`:

```js
// Storage facade. Selects the driver from STORAGE_DRIVER (default 'local') and
// exposes save/fileUrl/remove plus signFiles, which resolves file fields in an API
// response payload to servable URLs. Under 'local' every URL is a pass-through, so
// responses are unchanged; under 'gcs' they become short-lived signed URLs.

const DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

let driver;
if (DRIVER === 'local') {
  driver = require('./local.driver');
} else if (DRIVER === 'gcs') {
  driver = require('./gcs.driver'); // loaded only when selected (fails fast on bad env)
} else {
  throw new Error(`Unknown STORAGE_DRIVER "${process.env.STORAGE_DRIVER}". Use "local" or "gcs".`);
}

const save = (subdir, file) => driver.save(subdir, file);
const fileUrl = (storedPath) => driver.fileUrl(storedPath);
const remove = (storedPath) => driver.remove(storedPath);

const FILE_FIELDS = new Set(['photo_path', 'document_path']);

// Deep-copy a response payload, replacing file fields with servable URLs:
//   photo_path / document_path : string  -> awaited fileUrl
//   chain_of_custody_photos    : string[] -> [{ key, url }]  (key kept for removal)
// Only plain objects/arrays are walked; Date/Decimal/other class instances pass
// through untouched (critical: never iterate a Date's own keys).
async function signFiles(node) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return Promise.all(node.map(signFiles));
  if (Object.getPrototypeOf(node) !== Object.prototype) return node;

  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (FILE_FIELDS.has(k)) {
      out[k] = await fileUrl(v);
    } else if (k === 'chain_of_custody_photos' && Array.isArray(v)) {
      out[k] = await Promise.all(v.map(async (p) => ({ key: p, url: await fileUrl(p) })));
    } else {
      out[k] = await signFiles(v);
    }
  }
  return out;
}

module.exports = { save, fileUrl, remove, signFiles };
```

- [ ] **Step 3: Write the throwaway verification script**

Create `backend/_verify_storage.mjs`:

```js
process.env.STORAGE_DRIVER = 'local';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const fs = require('fs');
const storage = require('./src/services/storage');
const assert = require('assert');

// save() writes the buffer and returns the expected path shape
const file = { buffer: Buffer.from('hello'), originalname: 'x.JPG', mimetype: 'image/jpeg' };
const stored = await storage.save('complaints', file);
assert.match(stored, /^\/uploads\/complaints\/\d+-[0-9a-f]{12}\.jpg$/, `bad path: ${stored}`);
assert.ok(fs.existsSync('./uploads' + stored.replace('/uploads', '')), 'file not on disk');

// fileUrl() passes the path through under local
assert.equal(await storage.fileUrl(stored), stored);
assert.equal(await storage.fileUrl(null), null);

// signFiles(): photo_path stays a string; custody becomes [{key,url}]; Dates survive
const when = new Date('2026-06-23T00:00:00Z');
const signed = await storage.signFiles({
  complaint: { photo_path: stored, submitted_at: when, barangay: { name: 'Pob' } },
  turnover: { chain_of_custody_photos: ['/uploads/custody/a.jpg', '/uploads/custody/b.jpg'] },
});
assert.equal(signed.complaint.photo_path, stored);
assert.ok(signed.complaint.submitted_at instanceof Date, 'Date was mangled');
assert.equal(signed.complaint.barangay.name, 'Pob');
assert.deepEqual(signed.turnover.chain_of_custody_photos, [
  { key: '/uploads/custody/a.jpg', url: '/uploads/custody/a.jpg' },
  { key: '/uploads/custody/b.jpg', url: '/uploads/custody/b.jpg' },
]);

await storage.remove(stored);
assert.ok(!fs.existsSync('./uploads' + stored.replace('/uploads', '')), 'remove failed');
console.log('OK storage local driver + signFiles');
```

- [ ] **Step 4: Run it**

```bash
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend && node _verify_storage.mjs
```
Expected: `OK storage local driver + signFiles`

- [ ] **Step 5: Commit (driver code only — leave the verify script for now, deleted in Task 8)**

```bash
git add backend/src/services/storage/local.driver.js backend/src/services/storage/index.js
git commit -m "Storage: local driver + signFiles facade (STORAGE_DRIVER toggle)"
```

---

### Task 2: GCS driver

**Files:**
- Create: `backend/src/services/storage/gcs.driver.js`
- Test: `backend/_verify_gcs_boot.mjs` (throwaway)

**Interfaces:**
- Produces: same `save`/`fileUrl`/`remove` shape as `local.driver.js`, but `fileUrl` returns an absolute `https://…` V4 signed URL (1-hour expiry), and the module **throws at require-time** if GCS env is missing/invalid (fail-fast boot). Selected by `index.js` only when `STORAGE_DRIVER=gcs`.

- [ ] **Step 1: Create the GCS driver**

Create `backend/src/services/storage/gcs.driver.js`:

```js
// Google Cloud Storage driver. Uploads Multer (memory) buffers to a private bucket
// (uniform bucket-level access) and serves them via short-lived V4 signed URLs.
// Objects are never made public. Used only when STORAGE_DRIVER=gcs; requiring this
// module validates configuration and fails fast at boot.

const path = require('path');
const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');

const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour

function buildClient() {
  const projectId = process.env.GCS_PROJECT_ID || undefined;
  if (process.env.GCS_CREDENTIALS_JSON) {
    let credentials;
    try {
      credentials = JSON.parse(process.env.GCS_CREDENTIALS_JSON);
    } catch {
      throw new Error('GCS_CREDENTIALS_JSON is set but is not valid JSON.');
    }
    return new Storage({ projectId: projectId || credentials.project_id, credentials });
  }
  if (process.env.GCS_KEY_FILE) {
    return new Storage({ projectId, keyFilename: process.env.GCS_KEY_FILE });
  }
  throw new Error('GCS storage requires GCS_CREDENTIALS_JSON or GCS_KEY_FILE.');
}

const bucketName = process.env.GCS_BUCKET_NAME;
if (!bucketName) throw new Error('GCS storage requires GCS_BUCKET_NAME.');
const bucket = buildClient().bucket(bucketName);

function genFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase() || '.bin';
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

// Upload one in-memory Multer file. Returns "/uploads/<subdir>/<filename>" — the same
// shape the local driver uses, so the stored DB value is driver-agnostic.
async function save(subdir, file) {
  const name = `${subdir}/${genFilename(file.originalname)}`;
  await bucket.file(name).save(file.buffer, {
    resumable: false,
    contentType: file.mimetype,
    metadata: { cacheControl: 'private, max-age=0' },
  });
  return `/uploads/${name}`;
}

// Resolve a stored "/uploads/<object>" path to a 1-hour V4 signed read URL.
async function fileUrl(storedPath) {
  if (!storedPath) return null;
  if (/^https?:\/\//.test(storedPath)) return storedPath; // already absolute
  const name = storedPath.replace(/^\/uploads\//, '');
  const [url] = await bucket.file(name).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });
  return url;
}

// Delete the underlying object (best-effort).
async function remove(storedPath) {
  if (!storedPath || /^https?:\/\//.test(storedPath)) return;
  const name = storedPath.replace(/^\/uploads\//, '');
  await bucket.file(name).delete({ ignoreNotFound: true }).catch(() => {});
}

module.exports = { save, fileUrl, remove };
```

- [ ] **Step 2: Syntax-check + confirm the dependency is installed**

```bash
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend && node -c src/services/storage/gcs.driver.js && node -e "require('@google-cloud/storage'); console.log('dep ok')"
```
Expected: `dep ok` (no syntax error). If `require` fails with "Cannot find module", run `npm install` first.

- [ ] **Step 3: Verify fail-fast on missing GCS env (no real credentials needed)**

Create `backend/_verify_gcs_boot.mjs`:

```js
process.env.STORAGE_DRIVER = 'gcs';
delete process.env.GCS_BUCKET_NAME;
delete process.env.GCS_CREDENTIALS_JSON;
delete process.env.GCS_KEY_FILE;
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
let threw = false;
try {
  require('./src/services/storage');
} catch (e) {
  threw = /GCS_BUCKET_NAME|GCS_CREDENTIALS_JSON|GCS_KEY_FILE/.test(e.message);
  console.log('fail-fast message:', e.message);
}
if (!threw) { console.error('FAIL: expected a clear GCS-config error'); process.exit(1); }
console.log('OK gcs driver fails fast without config');
```

```bash
cd backend && node _verify_gcs_boot.mjs && rm _verify_gcs_boot.mjs
```
Expected: prints the fail-fast message then `OK gcs driver fails fast without config`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/storage/gcs.driver.js
git commit -m "Storage: GCS driver (private bucket, V4 signed URLs, fail-fast config)"
```

---

### Task 3: Memory-storage cutover — Multer + `storage.save` call sites

Switches Multer to `memoryStorage` and every upload call site to `storage.save`, and removes `publicPathFor`. After this task the app boots and uploads persist through the active driver (still `local`). **Multer and the save() sites must change together** — `memoryStorage` populates `req.file.buffer` (not `.filename`), which `storage.save` requires.

**Files:**
- Modify: `backend/src/middlewares/upload.js`
- Modify: `backend/src/controllers/complaint.controller.js`
- Modify: `backend/src/controllers/wildlife.controller.js`
- Modify: `backend/src/controllers/request.controller.js`
- Modify: `backend/src/controllers/staff.wildlife.controller.js`

**Interfaces:**
- Consumes: `storage.save` (Task 1).
- Produces: `req.file`/`req.files` are memory files; stored paths now come from `storage.save`. `publicPathFor` no longer exists.

- [ ] **Step 1: Switch Multer to memory storage**

Replace the entire contents of `backend/src/middlewares/upload.js` with:

```js
// Photo/document upload middleware. Parses multipart into memory (Multer
// memoryStorage); the active storage driver (local disk or GCS) persists the buffer
// — see services/storage. Buffering in memory makes the storage backend a runtime
// choice (STORAGE_DRIVER) with no controller changes. 5 MB cap; MIME-validated.

const multer = require('multer');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const IMAGE_MIME = /^image\/(jpe?g|png|webp|heic|heif)$/i;
const DOC_MIME = /^(image\/(jpe?g|png|webp|heic|heif)|application\/pdf)$/i;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Returns a Multer instance that MIME/size-validates and buffers the file in memory.
// `subdir` is consumed later by storage.save(); it stays in the signature so route
// definitions are unchanged.
function diskUpload(subdir, allowedMime = IMAGE_MIME) {
  function fileFilter(req, file, cb) {
    if (allowedMime.test(file.mimetype)) return cb(null, true);
    const err = new Error(
      allowedMime === DOC_MIME
        ? 'Unsupported file type. Allowed: images or PDF.'
        : 'Only image files (jpg, png, webp, heic) are allowed.'
    );
    err.statusCode = 422;
    return cb(err);
  }

  return multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: MAX_BYTES } });
}

module.exports = { diskUpload, UPLOAD_ROOT, IMAGE_MIME, DOC_MIME };
```

- [ ] **Step 2: complaint.controller — save via storage (2 sites)**

In `backend/src/controllers/complaint.controller.js`:

Replace the import:
```js
const { publicPathFor } = require('../middlewares/upload');
```
with:
```js
const storage = require('../services/storage');
```

In `create`, replace:
```js
  const photoPath = req.file ? publicPathFor('complaints', req.file.filename) : null;
```
with:
```js
  const photoPath = req.file ? await storage.save('complaints', req.file) : null;
```

In `createAnonymous`, replace:
```js
  const photoPath = req.file ? publicPathFor('complaints', req.file.filename) : null;
```
with:
```js
  const photoPath = req.file ? await storage.save('complaints', req.file) : null;
```

- [ ] **Step 3: wildlife.controller — save via storage**

In `backend/src/controllers/wildlife.controller.js`, replace the import:
```js
const { publicPathFor } = require('../middlewares/upload');
```
with:
```js
const storage = require('../services/storage');
```
and in `create` replace:
```js
  const photoPath = req.file ? publicPathFor('wildlife', req.file.filename) : null;
```
with:
```js
  const photoPath = req.file ? await storage.save('wildlife', req.file) : null;
```

- [ ] **Step 4: request.controller — save via storage**

In `backend/src/controllers/request.controller.js`, replace the import:
```js
const { publicPathFor } = require('../middlewares/upload');
```
with:
```js
const storage = require('../services/storage');
```
and in `create` replace:
```js
  const documentPath = req.file ? publicPathFor('requests', req.file.filename) : null;
```
with:
```js
  const documentPath = req.file ? await storage.save('requests', req.file) : null;
```

- [ ] **Step 5: staff.wildlife.controller — save custody photos via storage**

In `backend/src/controllers/staff.wildlife.controller.js`, replace the import:
```js
const { publicPathFor } = require('../middlewares/upload');
```
with:
```js
const storage = require('../services/storage');
```
and in `addCustodyPhotos` replace:
```js
  const paths = (req.files || []).map((f) => publicPathFor('custody', f.filename));
```
with:
```js
  const paths = await Promise.all((req.files || []).map((f) => storage.save('custody', f)));
```

- [ ] **Step 6: Confirm `publicPathFor` is fully gone and syntax is valid**

```bash
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend && node -c src/middlewares/upload.js && node -c src/controllers/complaint.controller.js && node -c src/controllers/wildlife.controller.js && node -c src/controllers/request.controller.js && node -c src/controllers/staff.wildlife.controller.js
```
Then confirm no references remain (search should return nothing):

Run a Grep for `publicPathFor` across `backend/src` — expected: **0 matches**.

- [ ] **Step 7: Boot the server (local driver) to prove no import/runtime breakage**

```bash
cd backend && node -e "require('dotenv').config(); const app=require('./src/app'); const s=app.listen(5055,()=>{console.log('boot ok'); s.close();});"
```
Expected: `boot ok` (no throw). The default `STORAGE_DRIVER` is `local`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/middlewares/upload.js backend/src/controllers/complaint.controller.js backend/src/controllers/wildlife.controller.js backend/src/controllers/request.controller.js backend/src/controllers/staff.wildlife.controller.js
git commit -m "Storage: buffer uploads in memory and persist via storage.save"
```

---

### Task 4: Sign file URLs in resident responses

Wrap every resident-facing response that carries a file field in `storage.signFiles`. Under `local` this is a pass-through (responses unchanged); under `gcs` it produces signed URLs. The public complaint-track endpoint returns no file fields and is left alone.

**Files:**
- Modify: `backend/src/controllers/complaint.controller.js`
- Modify: `backend/src/controllers/wildlife.controller.js`
- Modify: `backend/src/controllers/request.controller.js`

**Interfaces:**
- Consumes: `storage.signFiles` (Task 1), `storage` already imported (Task 3).

> **Edit note:** each `data: { X }` below appears in several handlers of the same file and the wrapper is identical, so use a **replace-all** on the exact string. The plural list lines (`data: { Xs }`) differ and are replaced separately. `storage` was imported into these three controllers in Task 3.

- [ ] **Step 1: complaint.controller — wrap responses in `signFiles`**

In `backend/src/controllers/complaint.controller.js`, replace **all** occurrences of:
```js
data: { complaint }
```
with:
```js
data: { complaint: await storage.signFiles(complaint) }
```
(This wraps `create`, `createAnonymous`, `getByTracking`, and the public `trackPublic` — the last has no file fields, so signing is a harmless no-op. It does **not** match the plural `data: { complaints }`.)

Then replace the `listMine` line:
```js
  res.json({ success: true, data: { complaints } });
```
with:
```js
  res.json({ success: true, data: { complaints: await storage.signFiles(complaints) } });
```

- [ ] **Step 2: wildlife.controller — wrap responses in `signFiles`**

In `backend/src/controllers/wildlife.controller.js`, replace **all** occurrences of:
```js
data: { turnover }
```
with:
```js
data: { turnover: await storage.signFiles(turnover) }
```
(This wraps `create` and `getByRef`; it does not match the plural `data: { turnovers }`.)

Then replace the `listMine` line:
```js
  res.json({ success: true, data: { turnovers } });
```
with:
```js
  res.json({ success: true, data: { turnovers: await storage.signFiles(turnovers) } });
```

- [ ] **Step 3: request.controller — wrap responses in `signFiles`**

In `backend/src/controllers/request.controller.js`, replace **all** occurrences of:
```js
data: { request }
```
with:
```js
data: { request: await storage.signFiles(request) }
```
(This wraps `create` and `getByTracking`; it does not match the plural `data: { requests }`.)

Then replace the `listMine` line:
```js
  res.json({ success: true, data: { requests } });
```
with:
```js
  res.json({ success: true, data: { requests: await storage.signFiles(requests) } });
```

- [ ] **Step 4: Syntax-check**

```bash
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend && node -c src/controllers/complaint.controller.js && node -c src/controllers/wildlife.controller.js && node -c src/controllers/request.controller.js
```
Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/complaint.controller.js backend/src/controllers/wildlife.controller.js backend/src/controllers/request.controller.js
git commit -m "Storage: sign file URLs in resident report responses"
```

---

### Task 5: Sign file URLs in staff responses

Wrap staff list/detail/status/update responses in `storage.signFiles`. The staff wildlife detail carries both `photo_path` and `chain_of_custody_photos`, so after this task those custody entries become `{ key, url }` (consumed by the web update in Task 6). `signFiles` is harmless where no file field is present (e.g. queue lists).

**Files:**
- Modify: `backend/src/controllers/staff.complaint.controller.js`
- Modify: `backend/src/controllers/staff.wildlife.controller.js`
- Modify: `backend/src/controllers/staff.request.controller.js`

**Interfaces:**
- Consumes: `storage.signFiles`. `staff.wildlife.controller` already imports `storage` (Task 3); the other two need the import added.

> **Edit note:** as in Task 4, `data: { X }` repeats across handlers in each file with an identical wrapper — use **replace-all**. The `list` handler returns `data: result` (a `{ items, total, page, limit }` object) and is replaced separately; `signFiles` recurses into `items`.

- [ ] **Step 1: staff.complaint.controller — import + sign responses**

In `backend/src/controllers/staff.complaint.controller.js`, add after the `const service = require('../services/staff.complaint.service');` line:
```js
const storage = require('../services/storage');
```
Replace **all** occurrences of `data: { complaint }` with `data: { complaint: await storage.signFiles(complaint) }` (wraps `getOne`, `updateStatus`, `update`).

Then replace the `list` response line:
```js
  res.json({ success: true, data: result });
```
with:
```js
  res.json({ success: true, data: await storage.signFiles(result) });
```

- [ ] **Step 2: staff.request.controller — import + sign responses**

In `backend/src/controllers/staff.request.controller.js`, add after the `const service = require('../services/staff.request.service');` line:
```js
const storage = require('../services/storage');
```
Replace **all** occurrences of `data: { request }` with `data: { request: await storage.signFiles(request) }` (wraps `getOne`, `updateStatus`, `update`).

Then replace the `list` response line:
```js
  res.json({ success: true, data: result });
```
with:
```js
  res.json({ success: true, data: await storage.signFiles(result) });
```

- [ ] **Step 3: staff.wildlife.controller — sign responses**

In `backend/src/controllers/staff.wildlife.controller.js` (`storage` already imported in Task 3), replace **all** occurrences of `data: { turnover }` with `data: { turnover: await storage.signFiles(turnover) }` (wraps `getOne`, `updateStatus`, `update`, `addCustodyPhotos`, `removeCustodyPhoto`).

Then replace the `list` response line:
```js
  res.json({ success: true, data: result });
```
with:
```js
  res.json({ success: true, data: await storage.signFiles(result) });
```

- [ ] **Step 4: Syntax-check**

```bash
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend && node -c src/controllers/staff.complaint.controller.js && node -c src/controllers/staff.wildlife.controller.js && node -c src/controllers/staff.request.controller.js
```
Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/staff.complaint.controller.js backend/src/controllers/staff.wildlife.controller.js backend/src/controllers/staff.request.controller.js
git commit -m "Storage: sign file URLs in staff report responses"
```

---

### Task 6: Custody gallery `{key,url}` + best-effort object delete

The staff wildlife detail now returns `chain_of_custody_photos` as `[{ key, url }]`. Update the web gallery to read those, and have the backend delete the bucket object on removal.

**Files:**
- Modify: `web/src/components/staff/CustodyPhotos.jsx`
- Modify: `backend/src/services/staff.wildlife.service.js`

**Interfaces:**
- Consumes: response shape `chain_of_custody_photos: [{ key, url }]` (Task 5); `storage.remove` (Task 1).

- [ ] **Step 1: Update the custody gallery to read `{ key, url }`**

In `web/src/components/staff/CustodyPhotos.jsx`, replace the photo grid block:
```jsx
          {photos.map((p) => (
            <div key={p} className="group relative">
              <a href={fileUrl(p)} target="_blank" rel="noreferrer">
                <img src={fileUrl(p)} alt="chain of custody" className="h-28 w-full rounded-lg border object-cover" />
              </a>
              <button
                type="button"
                onClick={() => remove(p)}
                disabled={busy}
                title="Remove photo"
                className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
          ))}
```
with:
```jsx
          {photos.map((p) => (
            <div key={p.key} className="group relative">
              <a href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt="chain of custody" className="h-28 w-full rounded-lg border object-cover" />
              </a>
              <button
                type="button"
                onClick={() => remove(p.key)}
                disabled={busy}
                title="Remove photo"
                className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
          ))}
```

Then remove the now-unused `fileUrl` import — change:
```jsx
import { fileUrl, staffApi } from '@/lib/api';
```
to:
```jsx
import { staffApi } from '@/lib/api';
```
(`remove(path)` already forwards its argument to `staffApi.wildlife.removeCustodyPhoto(id, path)`; it now receives `p.key`, which equals the stored path the backend matches on.)

- [ ] **Step 2: Delete the bucket object on custody removal (best-effort)**

In `backend/src/services/staff.wildlife.service.js`, add the storage import near the top (after the other `require`s):
```js
const storage = require('./storage');
```
In `removeCustodyPhoto`, after the `prisma.wildlifeTurnover.update(...)` that saves the filtered array and before the `writeAuditLog(...)` call, add:
```js
  await storage.remove(targetPath); // best-effort; never throws
```

- [ ] **Step 3: Syntax-check backend + build web**

```bash
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend && node -c src/services/staff.wildlife.service.js
```
Then:
```bash
cd ../web && npm run build
```
Expected: backend check silent; web build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/staff/CustodyPhotos.jsx backend/src/services/staff.wildlife.service.js
git commit -m "Storage: custody gallery reads {key,url}; delete object on removal"
```

---

### Task 7: App wiring + environment template

Mount the `/uploads` static server only under the `local` driver, and document the new env keys.

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/.env.example`

- [ ] **Step 1: Gate the `/uploads` static mount behind the local driver**

In `backend/src/app.js`, replace:
```js
// ── Uploaded files (local-disk storage stub) ──────────────
app.use('/uploads', express.static(UPLOAD_ROOT));
```
with:
```js
// ── Uploaded files: served locally only under the local driver. Under the GCS
//    driver, files live in the bucket and are reached via signed URLs instead.
if ((process.env.STORAGE_DRIVER || 'local').toLowerCase() === 'local') {
  app.use('/uploads', express.static(UPLOAD_ROOT));
}
```

- [ ] **Step 2: Update `.env.example`**

In `backend/.env.example`, replace the block:
```
# ── Google Cloud Storage ───────────────────────────────────
GCS_BUCKET_NAME="cenrowatch-uploads"
GCS_KEY_FILE="./gcs-key.json"
```
with:
```
# ── File storage ───────────────────────────────────────────
# Where uploads go: "local" (disk, default — for dev) or "gcs" (Google Cloud Storage).
STORAGE_DRIVER="local"
# Required only when STORAGE_DRIVER=gcs:
GCS_BUCKET_NAME="cenrowatch-uploads"
GCS_PROJECT_ID="your-gcp-project-id"
# Provide credentials with EXACTLY ONE of the following:
#   GCS_KEY_FILE         — path to a service-account key file (handy for local smoke tests)
#   GCS_CREDENTIALS_JSON — the key file's JSON inline (use on cloud hosts that can't store a file)
GCS_KEY_FILE="./gcs-key.json"
GCS_CREDENTIALS_JSON=""
```

- [ ] **Step 3: Boot once on the local driver to confirm wiring**

```bash
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend && node -e "require('dotenv').config(); const app=require('./src/app'); const s=app.listen(5055,()=>{console.log('boot ok'); s.close();});"
```
Expected: `boot ok`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.js backend/.env.example
git commit -m "Storage: serve /uploads only under local driver; document STORAGE_DRIVER env"
```

---

### Task 8: Local regression + GCS smoke-test script + cleanup

Prove the `local` path is unchanged end-to-end, document the one-time GCS smoke test for deploy, and remove throwaway scaffolds.

**Files:**
- Delete: `backend/_verify_storage.mjs`
- (Reference only) GCS smoke-test script — provided here for the implementer to run once real credentials exist.

- [ ] **Step 1: Re-run the local storage verification (regression)**

```bash
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend && node _verify_storage.mjs
```
Expected: `OK storage local driver + signFiles`.

- [ ] **Step 2: Boot backend (local) + health check**

In one shell, start the backend:
```bash
cd backend && npm run dev
```
In another shell:
```bash
curl http://localhost:5000/api/health
```
Expected: JSON with `"status":"ok"`. Stop the dev server afterward (Ctrl-C).

- [ ] **Step 3: GCS smoke test — run ONCE when a bucket + key exist (deploy time, not committed)**

Create `backend/_verify_gcs_live.mjs` (delete after running; never commit):

```js
// Requires real env: STORAGE_DRIVER=gcs, GCS_BUCKET_NAME, GCS_PROJECT_ID,
// and GCS_KEY_FILE (or GCS_CREDENTIALS_JSON). Run from backend/.
import { config } from 'dotenv';
config();
process.env.STORAGE_DRIVER = 'gcs';
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const storage = require('./src/services/storage');
const file = { buffer: Buffer.from('smoke'), originalname: 's.txt', mimetype: 'text/plain' };
const stored = await storage.save('custody', file);
console.log('saved:', stored);
const url = await storage.fileUrl(stored);
console.log('signed url:', url.slice(0, 80) + '...');
const res = await fetch(url);
console.log('fetch status (expect 200):', res.status);
await storage.remove(stored);
const res2 = await fetch(await storage.fileUrl(stored));
console.log('fetch after remove (expect 403/404):', res2.status);
console.log('GCS smoke test done');
```
Run: `node _verify_gcs_live.mjs` → expect a 200 then a 403/404, then `rm _verify_gcs_live.mjs`.

- [ ] **Step 4: Delete the local verify scaffold and confirm a clean tree**

```bash
cd backend && rm _verify_storage.mjs
```
Then from the repo root confirm no stray scaffolds or uploads are staged:

Run `git status` — expected: only intended changes; **no** `_verify_*.mjs`, no `uploads/`, no `.env`, no `gcs-key.json`.

- [ ] **Step 5: Final commit (if anything remains)**

```bash
git add -A
git commit -m "Storage: finalize GCS swap (local regression verified)" || echo "nothing to commit"
git push origin main
```

---

## Deploy-time follow-ups (outside this plan; no code)

- Create the GCS project + bucket (uniform bucket-level access, **private**), in an Always-Free region (`us-east1`, `us-west1`, or `us-central1`).
- Create a service account with **Storage Object Admin** on the bucket; download its key.
- On the host set `STORAGE_DRIVER=gcs`, `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, and `GCS_CREDENTIALS_JSON` (paste the key JSON).
- Set a **Budget Alert + low cap** so usage can never produce a charge.
- Set `CLIENT_URL` to the deployed web origin (already-flagged follow-up so password-reset email links don't point at localhost).
