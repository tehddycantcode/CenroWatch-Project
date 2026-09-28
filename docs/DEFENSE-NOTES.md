# CENROWATCH — Panel Defense Notes

One card per section. Every version, path and function name below was read out of
the source on 2026-09-29, not from memory. If a panelist asks something not on a
card, say "I'd have to check the code" rather than guess — that answer costs you
far less than a wrong one.

**Test figures you may quote:** backend **408 tests / 30 suites**, mobile
**47 tests / 4 suites**. Run `npm test` in `backend/` and `mobile/` to confirm on
the day. The web app has **no test runner** — say so plainly if asked.

---

## CARD 1 — Tech Stack

**Backend** — `backend/package.json`
- Node.js + **Express 5.2.1**, **Prisma ORM 6.19.3**, **MySQL 8**
- `bcryptjs 3.0.3`, `jsonwebtoken 9.0.3`, `helmet 8.2.0`
- `express-validator 7.3.2`, `express-rate-limit 8.5.2`, `multer 2.2.0`
- `nodemailer 9.0.1`, `pdfkit 0.19.1`, `@google-cloud/storage 7.21.0`

**Web** — `web/package.json`
- **React 18.3.1** + **Vite 5.4.21**, **Tailwind CSS 3.4.19**
- `react-router-dom 7.18.3`, `maplibre-gl 5.24.0`, `lucide-react`

**Mobile** — `mobile/package.json`
- **Expo SDK 56**, **React Native 0.85.3**, React 19.2.3
- `expo-notifications`, `expo-secure-store`, `expo-location`, `expo-image-picker`
- `@maplibre/maplibre-react-native 11.3.7`

**Architecture:** routes → controllers → services → Prisma client.
Folders: `backend/src/routes|controllers|services|middlewares|utils`.

> **Likely question: "Why Prisma instead of raw SQL?"**
> Type-safe queries, migrations under version control, and one place to enforce
> rules. Our field-encryption layer is a Prisma *client extension*
> (`backend/src/utils/prismaEncryption.js`), so a new query physically cannot
> forget to encrypt. Raw SQL would make that opt-in per query.

> **Likely question: "Why MapLibre and not Google Maps?"**
> Open-source, no per-load billing, and we control the tile source. We're pinned
> to 5.24.0 deliberately — v6 broke tile loading in our app, tested and reverted.

---

## CARD 2 — Passwords & Sessions

**Password hashing** — `backend/src/utils/password.js`
- **bcrypt, 12 salt rounds** (`SALT_ROUNDS = 12`)
- `hashPassword()`, `verifyPassword()`

**Tokens** — `backend/src/utils/jwt.js`
- **JWT (HS256)**, `signToken()` / `verifyToken()`
- Two lifetimes: `JWT_EXPIRES_IN` (remember me) vs `JWT_SHORT_EXPIRES_IN`
- Refuses to start without `JWT_SECRET` — fails loudly rather than issuing
  forgeable tokens

**Two session transports, both load-bearing**
- **Web:** HttpOnly cookie — `backend/src/utils/sessionCookie.js`
  (`setSessionCookie`, `clearSessionCookie`); `HttpOnly`, `SameSite`, `Secure` in
  production
- **Mobile:** `Authorization: Bearer`, token in the OS keychain
  (`expo-secure-store`)
- `backend/src/middlewares/authenticate.js` reads **Bearer first**, cookie second

**Login** — `backend/src/services/auth.service.js` → `login()`

> **Likely question: "Why bcrypt and not SHA-256?"**
> SHA-256 is a *fast* hash — that's what makes it wrong for passwords, because
> fast means cheap to brute-force. bcrypt is deliberately slow and salted per
> user, so identical passwords produce different hashes and an attacker can't use
> rainbow tables. 12 rounds is the cost factor. We use SHA-256 only where speed is
> correct — hashing reset tokens and signing URLs. That's documented in
> `SECURITY.md`.

> **Likely question: "Why is the web token in a cookie but mobile's isn't?"**
> An HttpOnly cookie can't be read by JavaScript, so an XSS bug can't steal a
> signed-in Admin's session. A phone has no XSS surface, and the OS keychain is
> the stronger store there. Both paths are tested.

---

## CARD 3 — Encryption at Rest

**Algorithm:** **AES-256-GCM** — `backend/src/utils/crypto.util.js`
- `ALGORITHM = 'aes-256-gcm'`, 96-bit IV (`IV_BYTES = 12`), random per value
- 32-byte key from `FIELD_ENCRYPTION_KEY` (64 hex chars); **refuses to boot in
  production without it**
- `encrypt()`, `decrypt()`

**Which fields** — `backend/src/utils/prismaEncryption.js` → `ENCRYPTED_FIELDS`
- `contact_number`, `reporter_name`, `reporter_contact`, `address_details`
- Applied as a **Prisma client extension** in `backend/src/utils/prisma.js`

**Deliberately NOT encrypted:** `email`, `first_name`, `last_name`, `description`
— login and two search features query them. The extension **throws** if a
`where`/`orderBy`/`groupBy` touches an encrypted column, because that would
silently match nothing forever.

> **Likely question: "Why GCM and not CBC?"**
> GCM is authenticated encryption — it detects tampering as well as hiding the
> value. With CBC, someone who can write to the database could flip bits and we'd
> decrypt corrupted data without noticing.

> **Likely question: "Why not encrypt everything?"**
> Encrypted columns can't be searched or sorted — the database only sees
> ciphertext. Encrypting `email` would break login itself. So we encrypt the
> fields that identify a person and are never queried, and we made the wrong
> choice impossible to make silently by having the extension throw.

---

## CARD 4 — Transport, Uploads & Abuse Control

**In transit:** HTTPS everywhere — Railway and Cloudflare both terminate TLS.
Documented in `SECURITY.md`.

**Signed file URLs** — `backend/src/utils/fileToken.js`
- `/uploads` is **not public**. Each link carries an **HMAC-SHA256** signature
  over path + expiry; default TTL **60 minutes** (`FILE_URL_TTL_MINUTES`)
- Signing key derived from `JWT_SECRET` via HMAC (domain separation)
- `signPath()`, `sign()`; route `backend/src/routes/uploads.routes.js`
- Path traversal blocked *before* the signature check

**Upload safety** — `backend/src/middlewares/upload.js`
- **Two checks:** multer's `fileFilter` on Content-Type, then **magic-byte
  sniffing** on the buffered bytes — `sniffMime()`, `sniffGuard()`
- Was needed: an SVG could previously be uploaded claiming `image/jpeg`

**Rate limits** — `backend/src/middlewares/rateLimiters.js` (15-min windows)
- `apiLimiter` 1000 · `authLimiter` **30, failed logins only** · `resetLimiter` 10
  · `fileLimiter` 600

**Other guards**
- `helmet` security headers, `backend/src/app.js`
- CORS allowlist — `backend/src/utils/corsOrigin.js` → `createOriginChecker()`
- CSRF for cookie-authenticated writes — `backend/src/utils/csrf.js`
- RBAC — `backend/src/middlewares/authorize.js`

> **Likely question: "Why signed URLs instead of requiring a login header?"**
> An `<img>` tag can't send an Authorization header, and putting a JWT in the
> query string would leak it into server logs and browser history. A short-lived
> signature is scoped to one file and expires.

---

## CARD 5 — Privacy & Data Protection (R.A. 10173)

**Public endpoints return zero personal data** — `backend/src/services/gis.service.js`
- `getMapMarkers()`, `getFeed()`, `getStats()` select only reference, type,
  status, barangay, coordinates

**Endangered-species obfuscation** — `backend/src/utils/geo.js`
- `obfuscatePoint(lat, lng, seed)`, `OFFSET_DEG = 0.001` (~110 m)
- Offset direction is **deterministic from the record id**, so the point doesn't
  jitter between requests and can't be averaged away by repeated reads

**Anonymous reporting**
- Public route `POST /complaints/anonymous` (no account)
- Signed-in residents can tick "file anonymously": `user_id = NULL`, no reporter
  columns, and the audit row stores **no IP** — otherwise it would join to that
  resident's own login record
- Trade-off stated in the UI: not in My Reports, no notifications

**Audit trail** — `backend/src/utils/audit.js` → `writeAuditLog()`; model `AuditLog`

**Known limitation — say it before they find it:** uploaded photos keep their
**EXIF data** (GPS, device). That's the biggest remaining way an "anonymous"
report could identify its filer. The forms warn about it; the pipeline doesn't
strip it yet. Recorded in `CLAUDE.md`.

> **Likely question: "How do you comply with the Data Privacy Act?"**
> Four ways: public endpoints expose no personal data; identifying fields are
> encrypted at rest with AES-256-GCM; every mutation writes an audit row; and
> endangered-species coordinates are deliberately fuzzed so the map can't be used
> to find animals. The one gap we know about is photo EXIF.

---

## CARD 6 — Key Functions

**Reference numbers** — `backend/src/utils/createSequential.js` → `createSequential()`
- Formats `CMP-2026-00001` / `WLD-` / `REQ-` (`utils/trackingId.js`,
  `formatTrackingId`), allocated inside a transaction so two reports can't collide

**SLA / Citizens Charter** — `backend/src/utils/workingTime.js`
- `addWorkingMinutes()`, `DEFAULT_CALENDAR` — Asia/Manila (UTC+8), Mon–Fri
- `backend/src/utils/sla.js` → `computeExceededSla()`
- Clock starts when CENRO **approves**, not when a resident files — otherwise
  we'd show a deadline and then move it

**Status workflow** — `backend/src/services/staff.complaint.service.js` →
`updateComplaintStatus()`; history in `ComplaintStatusHistory`

**Notifications** — `backend/src/services/notification.service.js` →
`notifyStatusChange()`: writes the in-app row **and** fires push
- Push: `backend/src/services/push.service.js` → `notifyReportUpdate()`
- App side: `mobile/src/lib/push.js`, `mobile/src/components/PushPermissionPrompt.js`

**Email confirmation — a HARD GATE on filing**
- `backend/src/middlewares/requireVerifiedEmail.js` → **403** on the create routes
  of all three report kinds
- Deliberately *not* gated: every GET, and anonymous reporting

**Office-to-report routing** — `backend/src/services/routing.service.js` →
`getRoute()`; falls back to a straight dashed line if the provider is down

**PDF reports** — `backend/src/services/report.layout.js` (pdfkit)

> **Likely question: "How is the SLA calculated?"**
> In **working minutes**, not calendar time — Monday to Friday, Philippine time.
> A complaint approved Friday afternoon isn't overdue on Sunday. The budget per
> type is an admin-editable system setting, not hardcoded.

---

## CARD 7 — Data Storage

**MySQL 8** via Prisma — schema: `backend/prisma/schema.prisma`
**15 models, 8 enums.** Main ones:

| Model | Holds |
|---|---|
| `User` | accounts, role, `email_verified_at`, encrypted `contact_number` |
| `Complaint` | the main report: type FK, barangay, description, photo, coords, status, SLA fields |
| `WildlifeTurnover` | species, condition, `is_endangered`, coords |
| `EnvironmentalRequest` | service requests, preferred schedule |
| `*StatusHistory` ×3 | every status change, who and when |
| `AuditLog` | every mutation |
| `Notification`, `PushToken` | in-app alerts and device tokens |
| `ComplaintType`, `RequestType` | **admin-managed categories**, not enums |
| `Barangay` | all 18, with coordinates and GeoJSON boundaries |
| `SystemSetting` | SLA budgets, office location |

**Migrations:** `backend/prisma/migrations/` — applied on Railway by a
**pre-deploy command** (`npx prisma migrate deploy`), not on container boot.

**Soft delete:** archived reports keep their history (`archived_at`) and drop out
of queues, analytics and public endpoints.

> **Likely question: "Why are complaint types a table and not an enum?"**
> So an Administrator can add or retire a category without a code change or
> redeploy. A retired category stays valid on reports that already use it but
> can't be chosen for a new one.

---

## CARD 8 — Deployment

| Piece | Where |
|---|---|
| API + MySQL + uploads volume | **Railway** |
| Web app | **Cloudflare Pages** |
| Android APK | **EAS Build** (Expo), internal distribution |
| JS updates | **EAS Update** over-the-air |

- Full runbook: `DEPLOYMENT.md`
- API container: `backend/Dockerfile` — `CMD ["npm", "start"]`, **serves only**
- **Migrations run as Railway's Pre-Deploy Command.** If it fails, the deploy
  stops rather than releasing a broken service
- Deploys trigger on push to `main`
- Native vs JS change decided with `eas fingerprint:compare` — a native change
  needs a rebuild, a JS change ships over the air in seconds

> **Likely question: "How do you update the app without the Play Store?"**
> Two paths. JavaScript changes go out over the air through EAS Update and reach
> the phone on next launch. Anything touching native code needs a new APK build.
> We check which it is with `eas fingerprint:compare` before publishing, because
> an update published against the wrong runtime silently reaches nobody.

> **Likely question: "Why isn't it on the Play Store?"**
> Google charges a one-time $25 developer registration, and a new personal
> account must run a 12-tester closed test for 14 days before production access.
> We distribute the APK by link instead. Publishing would be a handover decision
> for CENRO under an organisation account.

---

## CARD 9 — APIs & Integrations

| Service | Used for | Where |
|---|---|---|
| **MapTiler Cloud** | map tiles / style | `web/src/components/MapView.jsx`, `mobile/src/components/MapPicker.js` |
| **OpenRouteService** (HeiGIT) | driving route office → report | `backend/src/services/routing.service.js` |
| **Brevo** (HTTPS API) | all outbound email in production | `backend/src/utils/mailer.js` |
| **Gmail SMTP** | email in local development only | same file |
| **Expo Push → FCM** | phone notifications | `backend/src/services/push.service.js` |
| **Google Cloud Storage** | optional file storage driver | `backend/src/services/storage/` |

- All keys come from environment variables — **never hardcoded**
  (`backend/.env.example` lists every one)
- Firebase is only a **delivery pipe** for notifications: no Firebase SDK in the
  app, no `firebase-admin` on the API, no data stored there

> **Likely question: "Why two email transports?"**
> Railway blocks outbound SMTP — we measured it from inside the container, ports
> 25, 465 and 587 all time out. So production sends over HTTPS through Brevo.
> Gmail SMTP still works locally and is kept for development. The transport is
> chosen by which credentials are configured.

> **Likely question: "What happens if a third-party service is down?"**
> Each degrades instead of failing. No routing key means the map draws a straight
> dashed line instead of a road route. A failed notification never blocks a status
> update — it's fire-and-forget. A failed email is logged, not thrown.

---

## CARD 10 — Questions About Weaknesses

Panels probe for honesty. These are true, so say them plainly.

- **"What would you do differently?"** Strip EXIF from uploads before storing
  them. It's the one privacy gap we know about and documented rather than hid.
- **"What isn't tested?"** The web app has no test runner, and mobile UI
  components can't be unit-tested without a device — we test the pure logic
  (47 tests) and verify screens on a real phone. Backend has 408 tests.
- **"Biggest bug you found?"** The `PushToken` table was never created in
  production: migrations used to run on container boot, that was removed, and the
  replacement pre-deploy step was never configured. Every push silently failed
  while the API reported success. Fixed by configuring the pre-deploy command.
- **"Why not iOS?"** Apple charges $99/year and issues APNs push credentials only
  to paid accounts. The code is already cross-platform; it's a credentials and
  budget decision for CENRO, not a rewrite.
- **"How do you know it works?"** Automated tests, plus `scripts/preflight.mjs`,
  which checks the *running* system — schema drift, migrations, email auth,
  uploads, logins — because we learned that code being correct in git doesn't
  mean it's live in the environment.
