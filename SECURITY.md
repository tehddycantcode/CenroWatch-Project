# CENROWATCH — Security Notes

How personal data is protected in this system, and — just as important — where
it deliberately is not, with the reasoning in each case.

Written against **R.A. 10173** (Data Privacy Act of 2012), which asks for
"reasonable and appropriate organizational, physical and technical measures"
proportionate to the sensitivity of the data. The data here is: residents'
names, emails, contact numbers, home barangays, the complaints they file
against their neighbours, and photographs of the locations involved.

---

## 1. Passwords are hashed, not encrypted — and that is the right answer

`backend/src/utils/password.js` uses **bcrypt** (bcryptjs) at **cost factor 12**,
with a unique salt per password, and stores only the digest in
`User.password_hash`.

This is deliberate and is not a weaker version of the encryption described in
§2. Encryption is reversible by design; a password should never be recoverable
by anyone, including CENRO. If the database leaked, encrypted passwords would be
one key away from plaintext, while bcrypt hashes are not passwords at all.

**Why bcrypt rather than SHA-256.** SHA-256 is built to be *fast* — billions of
hashes per second on a consumer GPU — which is exactly the wrong property for a
password. bcrypt is deliberately slow and its cost factor is tunable, so the
work required to test one guess can be raised as hardware improves. Cost 12
means 2¹² iterations of the key schedule, roughly 250 ms per hash on this
hardware: unnoticeable at a login, ruinous at scale for an attacker.

### Where SHA-256 legitimately does appear

Three places, all correct, and worth naming because "where is SHA-256?" is a
question the code should be able to answer plainly:

| Location | Form | What it covers | Why this is right here |
|---|---|---|---|
| `auth.service.js:18` (password-reset tokens) | plain SHA-256 | 256 bits from `crypto.randomBytes` | The input is already high-entropy and random. There is nothing to brute-force, so slowness buys nothing; the hash exists so a leaked database does not hand over live reset links. |
| `emailVerification.service.js:25` (six-digit codes) | plain SHA-256 | A six-digit code, compared with `timingSafeEqual` | Six digits *is* guessable — but the brake is the attempt counter on the token (spent before the comparison) and a short TTL, not the hash's speed. A slow hash would not help; a per-account attempt limit does. The code itself says so. |
| `fileToken.js:54,70` (signed upload links) | **HMAC**-SHA256 | The file path and expiry, signed together | Keyed, so only the server can mint a valid link, and the signature proves the URL was not altered. Also derives the file-signing key from `JWT_SECRET` with a domain separator, so a session token and a file link stay cryptographically unrelated. |

The rule the first two follow: hash the value when it never needs to come back,
encrypt it when it does. The third is a different job again — HMAC is not
secrecy, it is proof of authenticity.

Four primitives, four jobs, and they are not interchangeable: **bcrypt** for
passwords (slow, because passwords are guessable), **SHA-256** for digests of
high-entropy values, **HMAC-SHA256** to prove we issued something, and
**AES-256-GCM** for data that has to be read back.

---

## 2. Field-level encryption at rest (AES-256-GCM)

`backend/src/utils/crypto.util.js` + `backend/src/utils/prismaEncryption.js`.

Four personal fields are encrypted in the database with **AES-256-GCM**, a fresh
random 96-bit IV per value, and the 128-bit authentication tag stored alongside.
Envelope format: `enc:v1:<iv>:<tag>:<ciphertext>`, all base64.

| Field | Why it is safe to encrypt |
|---|---|
| `User.contact_number` | Never appears in a `where` clause |
| `Complaint.reporter_name` | Walk-in intake; written and displayed only |
| `Complaint.reporter_contact` | Walk-in intake; written and displayed only |
| `Complaint.address_details` | Written, shown on the detail page, printed on the PDF |
| `WildlifeTurnover.address_details` | Same field, same use |

**GCM rather than CBC** because it is authenticated: a modified ciphertext fails
to decrypt instead of quietly yielding different plaintext. Someone with write
access to the database cannot alter a stored phone number and have the system
serve the result as fact.

### What is NOT encrypted, and why that is a decision rather than an omission

| Field | What encrypting it would break |
|---|---|
| `User.email` | `findUnique` on every login, and the `@unique` constraint. A random IV means the same address encrypts differently every time, so neither works. |
| `User.first_name`, `User.last_name` | The admin user search (`contains`) |
| `Complaint.description` | The staff queue search (`contains`) |

Encryption costs you every operation the database could otherwise perform on a
column: no `WHERE`, no `ORDER BY`, no `GROUP BY`, no index, no uniqueness. The
boundary above was drawn by checking each field against the actual queries in
the codebase, not by assumption. Encrypting the second group would have broken
login and two search boxes that already shipped.

If encrypted names ever need to be searchable, that requires a **blind index**
(a keyed, deterministic hash in a companion column). That is a deliberate design
change, not a line to add quietly.

### The guard that keeps this honest

Encrypting a column someone later filters on is a *silent* failure: the query
succeeds and matches nothing, forever, because the ciphertext of the search term
never equals the ciphertext in the column. So the extension **throws** if a
`where`, `orderBy`, `cursor`, `distinct` or `by` clause references an encrypted
field, and the error names the blind-index alternative.

### Key management

- `FIELD_ENCRYPTION_KEY` — 64 hex characters (32 bytes), from `.env`, never committed.
- **Required in production**: the app refuses to boot without it.
- In development it may be absent; the app then stores those fields in plaintext
  and prints a warning on every boot. Silent plaintext is the failure mode this
  avoids.
- **The key must be backed up off the machine.** There is no recovery path. It
  is not a password that can be reset — losing it makes the encrypted values
  permanently unreadable.
- Rotation is not automated. The `v1` version segment in the envelope exists so
  a future reader can still decrypt v1 rows after the format or key changes.

Existing rows were converted by `npm run encrypt-pii` (dry-run by default,
`--apply` to write, idempotent, one `PII_ENCRYPTED` audit entry, values masked
in its output).

---

## 3. Uploaded files — the finding that mattered most

**Before:** `app.js` served uploads with

```js
app.use('/uploads', express.static(UPLOAD_ROOT));
```

No authentication, no authorisation, no rate limit, no expiry. And because the
local storage driver's `fileUrl()` was a pass-through, the value stored in
`Complaint.photo_path` **was** the working public URL. Every complaint photo,
wildlife photo, chain-of-custody photo and service-request document was
retrievable by anyone who had or guessed the path. The only obstacle was 48 bits
of filename randomness — an obscurity control, not an access control.

These are photographs of identifiable properties attached to named complaints
about neighbours. Encrypting database columns while serving that folder to the
open internet would have been theatre, which is why this was fixed first.

**Now:** `backend/src/routes/uploads.routes.js` requires a **signed, expiring
token scoped to one exact file**:

- HMAC-SHA256 over `path + expiry` **together** — a token cannot be moved to a
  different file, and the expiry cannot be edited forward.
- Default 1-hour TTL (`FILE_URL_TTL_MINUTES`), matching the GCS driver.
- Signing key derived from `JWT_SECRET` via HMAC with a domain separator, so a
  session token and a file link are cryptographically unrelated despite sharing
  one secret. `FILE_URL_SECRET` overrides.
- Compared with `timingSafeEqual`.
- Path traversal blocked by resolving against the upload root and confirming
  containment — checked *before* the signature, so an unauthorised caller cannot
  distinguish an existing file from a missing one.
- `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- Its own rate limiter (`fileLimiter`), because the route sits outside `/api/v1`
  and the global limiter never sees it.

Tokens are minted by `storage.signFiles()` as a report is returned to a caller
the API has already authorised — so a photo is reachable only by someone who was
allowed to read the report it belongs to, and only for an hour.

**Why signed URLs rather than a Bearer token on the route.** Browsers and React
Native render these through `<img src>` / `<Image source>`, neither of which can
attach an `Authorization` header — a token-checking middleware would simply
break every image in both clients. Putting the JWT in the query string instead
would be worse: it copies a long-lived session credential into browser history,
`Referer` headers and every access log. A short-lived capability scoped to one
file is the correct shape, and it is what GCS already does.

### Upload validation

`backend/src/middlewares/upload.js`: 5 MB cap, plus **two** type checks.
Multer's `fileFilter` sees only the `Content-Type` the client *claimed*, so
every upload is additionally sniffed against its **magic bytes** after
buffering, and `file.mimetype` is corrected to what the bytes actually say
before the storage driver records it. SVG is the case that matters — a document
that can carry script, with no magic number, in neither allow-list.

### Google Cloud Storage

`STORAGE_DRIVER=gcs` (`backend/src/services/storage/gcs.driver.js`) is already
implemented and is the stronger deployment posture: a **private bucket** with
uniform bucket-level access, objects never public, reads through **V4 signed
URLs with a 1-hour TTL**, and Google's server-side AES-256 encryption at rest.
Both drivers now enforce the same access rule, so switching between them changes
where the bytes live and nothing about who can read them.

---

## 3a. Known dependency advisories

`npm audit` in `web/` is not clean, and the remaining entries are deliberate
rather than unnoticed.

| Package | Severity | Status |
|---|---|---|
| **maplibre-gl** 5.24 | **Critical** — `DOM.sanitize()` XSS bypass ([GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579)) | **Mitigated, not patched** — see below |
| esbuild / vite 5 | Moderate/High — dev-server path traversal and request forgery | **Not applicable in production** |

**maplibre-gl.** The fix is v6.9.0, a major release. It was attempted and
reverted: v6 initialises the map, fires `style.load`, then hangs without ever
requesting a vector tile and **without emitting an error**. Confirmed in a
production build as well as the dev server, on hardware WebGL2, with a minimal
standalone map — the v5 control on the same machine renders correctly. See
`CLAUDE.md` for the full evidence.

The advisory is a bypass of MapLibre's HTML sanitizer. This application does not
depend on that sanitizer for untrusted input: every string interpolated into
`Popup.setHTML()` in `MapView.jsx` and `DensityMap.jsx` is passed through
`escapeHtml()` first, and the only unescaped values are numeric aggregate counts
produced by Prisma `groupBy`. There is therefore no path by which resident-
supplied text reaches the vulnerable code. **This is a mitigation, not a fix** —
it must be re-verified if a new `setHTML` call is ever added, and the upgrade
should be retried when a later v6 resolves the hang.

**esbuild / vite.** All four advisories target the **development server**.
Production serves pre-built static files with Vite not running, so the
production deployment is unaffected. Developers should avoid running
`npm run dev` on an untrusted network until the toolchain is upgraded.

---

## 4. Transport security (HTTPS)

**Status: not deployed** (true as of 2026-09-16). `SETUP.md` documents local
development only, so the system currently runs over plain HTTP on localhost and
a LAN address. This is stated rather than papered over: a self-signed certificate
on a dev box would prove nothing.

`HANDOVER.md` §11 is written for the deployed system and says so at its head —
none of the maintenance clocks it describes have started while this paragraph
still reads *not deployed*. **Whoever performs the first deployment should update
this paragraph**, because it is the one place in the document set that asserts no
deployment exists, and it will otherwise quietly contradict the handover pack.

Everything above protects data **at rest**. Without TLS, credentials and
personal data are exposed **in transit**, and no amount of database encryption
compensates for that. Deployment therefore requires:

1. **HTTPS on every origin** — API, web app, and the API URL the mobile build
   points at. TLS 1.2 minimum.
2. **`TRUST_PROXY`** set to the number of proxy hops (already supported in
   `app.js`) when running behind a TLS-terminating proxy, so rate limiting sees
   real client IPs. Never `true` — that lets a client spoof `X-Forwarded-For`.
3. **HSTS** — helmet is already mounted; enable `Strict-Transport-Security` once
   a certificate exists.
4. **`CLIENT_URL` / `MOBILE_URL`** updated to the `https://` origins; CORS
   already restricts to exactly those.
5. **`STORAGE_DRIVER=gcs`**, unless the host provides a persistent filesystem.
6. **`NODE_ENV=production`**, which also makes `FIELD_ENCRYPTION_KEY` mandatory.

---

## 5. Access control and audit

- **JWT + RBAC**, three roles (Admin, CENRO_Staff, Resident). `authenticate`
  re-loads the user from the database on every request, so a deactivated account
  stops working immediately rather than when its token expires.
- **Public endpoints return zero personal data.** Endangered-species coordinates
  are obfuscated by ±0.001° on public GIS endpoints so a rare animal's location
  cannot be read off the public map.
- **Every mutation writes an `AuditLog` entry** — who, what, when, and the
  before/after payload.
- **Rate limiting** on the whole API, with tighter per-route caps on login and
  registration (failed attempts only, so shared-IP residents are not punished
  for signing in correctly) and on password reset (every request, since each one
  sends mail).

---

## Summary

| Concern | Status |
|---|---|
| Passwords | bcrypt cost 12, salted — hashed, never recoverable |
| Personal fields at rest | AES-256-GCM on 4 verified-unqueried fields |
| Queryable fields | Deliberately not encrypted; reasoning documented above |
| Uploaded files | Signed, expiring, per-file links; traversal blocked; rate limited |
| Upload validation | 5 MB cap, MIME allow-list, magic-byte verification |
| Cloud storage | Private bucket + V4 signed URLs, already implemented |
| Access control | JWT + RBAC, re-checked per request |
| Audit trail | Every mutation |
| **Transport (HTTPS)** | **Not yet — no deployment exists. Requirements in §4.** |
