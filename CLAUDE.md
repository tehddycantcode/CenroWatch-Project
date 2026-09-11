# CENROWATCH — Claude Code Project Context

## Project
Web + Mobile system for CENRO Cabuyao (City Environment and Natural Resources Office),
Cabuyao City, Laguna, Philippines. Capstone project — Pamantasan ng Cabuyao BSIT.
Researchers: Moro, Edward Justine G. | Quizana, Koshi Cyrus G. | Zaspa, Holian Isaac R.

## Tech Stack
- Backend: Node.js + Express.js, MySQL, Prisma ORM
- Web Frontend: React.js + Vite, Tailwind CSS, shadcn/ui
- Mobile: React Native + Expo
- Maps: MapLibre GL JS + MapTiler Cloud
- File Storage: Google Cloud Storage (Multer)
- Email: Nodemailer (Gmail SMTP)
- Auth: JWT + bcryptjs, RBAC (3 roles: Admin, CENRO_Staff, Resident)

## Monorepo Structure
- `/backend` — Express API (port 5000)
- `/web` — React web app (port 5173)
- `/mobile` — Expo mobile app

## Key Rules
- Never hardcode API keys or secrets; always use `.env`
- All public API endpoints must return ZERO personal data (R.A. 10173 compliance)
- Endangered-species GIS coordinates must be obfuscated (±0.001°) on public endpoints
- All DB queries go through Prisma ORM only — no raw SQL
- Every data mutation must write an AuditLog entry
- Use modular pattern: routes → controllers → services → prisma client
- Wait for confirmation after each Sprint before proceeding to the next

## Version Pins (do NOT bump without intent)
- **Prisma pinned to v6** (`prisma@6`, `@prisma/client@6`). Prisma 7 removed `url`
  from the schema's `datasource` block and requires `prisma.config.ts` + a driver
  adapter — that breaks this schema and seed. Stay on v6 unless deliberately migrating.
- **Express 5** is installed (current default). Code avoids removed v4 features; no
  unnamed wildcard routes. Keep params as `/:id` (unchanged in v5).

## Environment Notes — TWO SETUPS, CHECK WHICH ONE YOU ARE ON
The researchers run this project differently. Neither is wrong; assuming the wrong
one wastes an afternoon. **Detect before acting:** if `backend/node_modules` exists
on disk, you are on the native setup; if `docker ps` shows `cenrowatch_api`, you are
on the Docker setup.

### Native setup (Edward's machine)
- OS: Windows 11, native (NOT WSL2). Shell: PowerShell.
- Node.js v24.17.0 (Krypton LTS) at `C:\Users\Penar\nodejs\...` (user-scope, no admin).
- A fresh shell does NOT auto-inherit Node on PATH. Prefix npm/node commands with:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`
- MySQL 8 runs as the local `MySQL80` service on **port 3306**; `DATABASE_URL` points
  at `localhost:3306/cenrowatch_db`. `backend/node_modules` EXISTS — run `npm test`,
  `npx prisma ...` and node scripts directly, no Docker involved.
- Verified 2026-09-08: `npm test` green (34 tests), 18 barangays / 6 users / 164
  audit logs / 4 settings present.

### Docker setup (Koshi's machine)
- Containers `cenrowatch_api` (port 5000) and `cenrowatch_db` (MySQL 8, host port
  **3307**). Start with `docker compose up -d` from the repo root, then verify with
  `node scripts/preflight.mjs`.
- `backend/node_modules` does NOT exist on the host there — dependencies live inside
  the image, so Prisma/node commands go through `docker exec cenrowatch_api ...`.

### Test accounts differ per setup — verify, do not assume
`seed-users.ps1` reset passwords in the DOCKER database only. On the native machine
the original passwords still work (confirmed 2026-09-08 by bcrypt-comparing each
hash). If a login fails, check which database you are pointed at before concluding
the credentials are stale.

## Lessons Learned (avoid repeating)
Standing rule: whenever I make a mistake, append the lesson here (and to
`mobile/AGENTS.md` for mobile-specific ones) so it never repeats.
- **PowerShell + inline `node -e` and `$`:** Don't put `$`-prefixed JS
  (`prisma.$disconnect()`, template `${...}`) inside a PowerShell `node -e "..."` —
  PowerShell mangles `$...` (e.g. `$disconnect()` became `\(`). Write a temporary
  `.mjs`/`.js` file, run it, then delete it; or use a single-quoted PS string.
- **One PowerShell command per concern:** Don't separate multiple statements with
  newlines in a single PowerShell tool call — they may silently not all run (a
  `Remove-Item` after a `node -e` got skipped). Chain with `&&` (pwsh 7 supports it)
  or make separate tool calls.
- **Edit needs an in-session Read:** In a continued/compacted session, Read a file
  in the current session before Edit even if its contents already appear earlier in
  context, or Edit fails with "File has not been read yet."
- **Stop the backend before `prisma migrate`/`generate` on Windows:** a running
  `node src/server.js` locks the query-engine DLL and generation can EPERM. Stop the
  background server first, migrate, then restart.
- **Don't stage `uploads/` or throwaway test scripts:** verify `git status` before
  every commit; `uploads/` and `dist/` are gitignored, and `_*.mjs` test scaffolds
  must be deleted (not committed).
- **`git commit` sweeps in anything ALREADY staged:** the user may have their own
  files pre-staged (e.g. a workflow file added by a tool). Run `git status` right
  before every commit and, if unrelated staged files appear, commit only the
  intended paths with `git commit -- <paths>` or unstage the rest first.
- **Auth rate limits are per-route now — don't hammer them in e2e tests:** the caps
  live in `backend/src/middlewares/rateLimiters.js` and are applied route by route in
  `auth.routes.js`, NOT blanket on `/api/v1/auth` (that old mount charged `GET /me`
  the strict budget, so residents sharing one IP got 429s just by opening the app).
  Today: `authLimiter` on login/register counts FAILED attempts only (30/15min/IP);
  `resetLimiter` on forgot/reset-password counts every request (10/15min/IP); every
  authenticated `/auth` route is covered by the global `apiLimiter` alone. A test that
  hits 429 makes any HTTP-based cleanup at the end silently fail — this once left the
  `juan` test account modified. Keep auth calls minimal, and restore/verify test data
  via Prisma directly (not the rate-limited HTTP endpoints).
- **Scope test cleanup by id, never by a broad predicate:** cleaning up after a
  verification I ran `auditLog.deleteMany({ action: 'PASSWORD_RESET_REQUEST',
  performed_by: juan })` and it removed 2 rows — mine plus a historical one from the
  June feature verification. Capture the ids (or a `performed_at` floor) BEFORE the
  test and delete only those; a `deleteMany` on attributes alone cannot tell my row
  from pre-existing data, and audit history is not recoverable.
- **Proofread Edit strings for stray non-ASCII characters:** twice I injected garbage
  into code/strings (`.километрwithMessage`, `częuploads`). Copy `old_string` verbatim
  from a fresh Read, keep new code ASCII-only, and re-read after writing.
- **Stopping a background `npm run dev` on Windows can orphan Vite:** killing the
  background task stops the npm wrapper but the detached Vite child can survive and
  keep holding port 5173. After stopping, verify the port is actually free (e.g.
  `Get-NetTCPConnection -LocalPort 5173`) and `Stop-Process` the owning PID if not.
- **No `Co-Authored-By` trailer on commits:** the user wants commits authored solely
  under their GitHub name (re-confirmed 2026-07-16). This overrides the harness
  default; also tell any commit-making subagent explicitly.
- **NEVER accept a Prisma "reset the database?" prompt — the answer is always no:**
  the dev `cenrowatch_db` holds the 18 seeded barangays, SLA settings, the test
  accounts, and real audit history, and a reset destroys all of it. Only `seed.js`
  content comes back; everything else is gone for good. Say no, then fix the actual
  cause. The specific trap that used to live here is now REPAIRED (2026-08-21):
  three migrations had been edited after they ran, so their checksums no longer
  matched their `_prisma_migrations` rows — `complaint_observed_at`,
  `complaint_walkin_fields`, `email_verification`. All three rows were updated to
  the files' SHA-256 and re-verified clean; the 18 barangays, 6 users, 164 audit
  logs and 4 settings were confirmed untouched afterwards.
  If it ever recurs, the method that works: hash each
  `prisma/migrations/<name>/migration.sql` with SHA-256, compare to its row, and
  `UPDATE _prisma_migrations SET checksum = ? WHERE id = ?` one row at a time
  (raw SQL is unavoidable — that table has no model in `schema.prisma`; the
  "Prisma ORM only" rule still governs application queries). Back the table up
  first. What does NOT work: `migrate resolve` — I once prescribed
  `--rolled-back`/`--applied` and both are wrong (P3012 "not in a failed state" /
  P3008 "already recorded as applied").
  **`prisma migrate status` does NOT surface checksum drift** — it reported
  "Database schema is up to date!" with all three drifted, so a clean status is
  never evidence of no drift. Hash the files to check.
- **A promise in user-facing copy is a feature commitment:** the unverified-password-
  reset email said "contact CENRO Cabuyao and we will confirm your address for you"
  while no such capability existed — staff could not even see who was unverified. If
  an email, error message, or UI string tells a person that someone can do something
  for them, the thing that does it has to exist. Grep new copy for these promises.
- **CHECK TABLE CASING ON EVERY GENERATED MIGRATION, BEFORE APPLYING IT:** Prisma
  reads table names back from the DATABASE, and Windows MySQL is case-insensitive,
  so `prisma migrate dev` here emits ``ALTER TABLE `complaint` `` for a model named
  `Complaint`. It applies fine on this machine and HARD-FAILS on the Linux
  container ("Table 'cenrowatch_db.complaint' doesn't exist"). This is not a
  one-off: it is what the tool does every single time on this setup. Three
  migrations already shipped broken and silently never applied in Docker (repaired
  in `fc6f264`); `working_days_sla`, `admin_managed_categories` and
  `encrypt_personal_fields` were each generated with the same bug and corrected
  before applying. Four for four — assume the next one is wrong too. Generate with `--create-only`, fix the casing, THEN apply —
  editing a migration after it has run breaks its `_prisma_migrations` checksum.
  `backend/tests/migrationCasing.test.js` now fails the suite if any migration
  disagrees with the model names, so `npm test` catches it.
- **A status enum value missing from the OPEN/TERMINAL arrays vanishes silently:**
  the overdue query is `status IN (...OPEN) AND sla_deadline < now`, so a status
  absent from those arrays never matches — every report in that state drops out of
  the breach counts and SLA figures with no error. The arrays live in
  `admin.analytics.service.js` AND `staff.overview.service.js` (two copies) plus
  `staff.validators.js` and `web/src/lib/staff.js`.
  `backend/tests/statusPartitions.test.js` reads the enums from `schema.prisma` and
  fails if any value is unaccounted for, so this is caught for FUTURE statuses too.
- **`sed -i` with `\n` does not insert real newlines in this Git Bash:** it
  collapsed a multi-line JS insert into a single line twice. Once that line began
  with `//`, the whole statement became a comment and `awaiting` was never defined
  — the page would have thrown at runtime and `npm run build` did NOT catch it.
  Use the Edit tool for multi-line code insertion, and read the result back.

- **maplibre-gl v6 BREAKS THE MAP HERE — do not upgrade past 5.x without redoing
  this test.** v6.9.0 was attempted (it fixes a CRITICAL XSS advisory,
  GHSA-jrc7-96c5-q579) and reverted. Two things go wrong. First, v6 is ESM-only
  with **no default export**, so `import maplibregl from 'maplibre-gl'` fails the
  build; `import * as maplibregl` fixes that. Second, and fatally: the map then
  initialises, fires `style.load` and `sourcedata`, and **hangs** — `load` never
  fires, `map.loaded()` stays false, ZERO vector tiles are requested, and **no
  error event is emitted at all**. Reproduced in the dev server AND a production
  build, on real hardware WebGL2 (NVIDIA GTX 1050 Ti via ANGLE/D3D11 — not a
  software renderer), and with a minimal standalone map that does not touch our
  component code. The v5.24.0 control on the same machine requests 6 tiles and
  renders correctly. Suspected cause: v6's ESM worker (`maplibre-gl-worker.mjs`),
  since tile fetching is worker-driven and everything the main thread does
  (style, tilejson, sprites) succeeds. **A passing `npm run build` proves nothing
  here** — the build was clean in both the broken and working states.
  Risk assessment for staying on 5.24.0: the advisory is a `DOM.sanitize()`
  bypass, and every string this app interpolates into `Popup.setHTML()` in
  `MapView.jsx` and `DensityMap.jsx` already goes through `escapeHtml()` first.
  The only unescaped values are numeric `groupBy` counts. Nothing untrusted
  reaches MapLibre's sanitizer, so there is no exploitable path — but this is a
  mitigation, not a fix, and it must be re-checked if anyone adds a new
  `setHTML` call.
- **Verify the PORT a dev server actually bound, not just that something is
  listening.** An orphaned Vite from an earlier run still held 5173, so
  `npm run dev` printed "Port 5173 is in use, trying another one..." and bound
  **5174** — while every browser check pointed at 5173 and silently tested the
  STALE server. This produced a confidently wrong conclusion about a dependency
  upgrade that had to be thrown away. Read the dev server's own "Local:" line, or
  pass `--strictPort` so it fails loudly instead of moving. Related: the existing
  orphaned-Vite lesson below.
- **`grep pattern missing-file && A || B` silently runs B.** A grep against a
  path that does not exist exits non-zero exactly like "no match", so the `||`
  branch fires and the absence of a FILE reads as the absence of a STRING. This
  produced a false "the dependency is v7" claim. The same shape burned a
  `git ls-files` check in the same session (it exits 0 with no output, so `&&`
  fired on nothing). Test the file exists first, or capture output and test the
  string — never infer from an exit code that has two meanings.
- **Appending a query string to a stored path breaks every `$`-anchored
  extension test.** Signing `/uploads` URLs turned `photo_path` into
  `/uploads/x.pdf?e=...&s=...`, and `/\.pdf$/i.test(path)` in three places
  (`web/components/staff/detail.jsx`, `web/pages/resident/TrackReportPage.jsx`,
  `mobile/screens/resident/TrackReportScreen.js`) silently stopped matching — every
  PDF attachment would have rendered as a broken `<img>` instead of a link. No
  test caught it and no build caught it, and no PDF exists in the seed data, so
  it would have first appeared the day a resident attached one. Both clients now
  export `isPdfPath()`, which strips the query first. GCS signed URLs have the
  same shape, so this was already latent for `STORAGE_DRIVER=gcs`.
- **When you close a security hole, check whether `preflight.mjs` asserts the
  hole.** Its "Uploads served" check fetched a bare `/uploads/...` path and
  PASSED on HTTP 200 — which, after the fix, is exactly the symptom of the hole
  being open. A verification script encodes the behaviour that was true when it
  was written; fixing the system can invert the meaning of its assertions. That
  check now fails on 200 and passes on 403, and separately mints a signed link to
  prove photos still render.
- **A script with its own `new PrismaClient()` bypasses every client extension.**
  `src/utils/prisma.js` is wrapped in the field-encryption extension, but
  `prisma/seed.js` and `prisma/create-admin.js` each built their own client, so
  anything they wrote would have been stored in plaintext with nothing to show
  for it. Neither wrote an encrypted field yet — the trap was for whoever added
  one next. Both now import the shared client. `scripts/encrypt-pii.js` keeps a
  raw client deliberately (it must see stored bytes to tell ciphertext from
  plaintext) and says so.
- **Verify the RUNNING system, not just the repo — use `node scripts/preflight.mjs`.**
  On 2026-08-24 an entire afternoon went into bugs that all shared one shape: the
  code was correct in git but dead in the environment. Three migrations had never
  applied, email was silently disabled, and the live API container had been built
  from a DIFFERENT project folder. Sprint plans marked all of it "complete". The
  preflight script checks schema drift, migrations, SMTP auth, uploads, logins and
  the mobile LAN IP; run it before every demo and before the defense.
- **There were TWO clones of this project.** `C:\Users\quiza\Documents\CenroWatch-Project`
  (no hyphen, 41 commits behind) vs `Cenro-Watch-Project` (hyphenated, current).
  The running container was created by an untracked `backend/docker-compose.yml` in
  the OLD folder and bind-mounted its uploads, so report photos lived there while
  all code edits went to the new folder. Uploads have been copied across and the
  stack now runs from the hyphenated repo. Do not run anything from the old folder.
- **Compose project name is pinned to `backend` — never change it.** The live database
  is the Docker volume `backend_db_data`. Compose derives volume names from the
  project name, so renaming the project silently creates a NEW EMPTY database.
- **Never load `.env` via compose `env_file:` or `docker run --env-file`.** Docker does
  not strip surrounding quotes, so `STORAGE_DRIVER="local"` arrives as the literal
  string `"local"` (quotes included) and crashes the server on boot. Mount the file
  (`./backend/.env:/app/.env:ro`) and let the app's own dotenv parse it — dotenv
  strips quotes, Docker does not.
- **Migration SQL must use PascalCase table names** (`ALTER TABLE `Complaint``, not
  ``complaint``). Windows MySQL is case-insensitive so a lowercase name works there,
  but the Linux container is case-sensitive and the migration hard-fails. Three
  migrations shipped with this bug and had silently never applied. An earlier
  workaround set `--lower-case-table-names=1` in compose; that is now REMOVED (MySQL
  refuses to start when it disagrees with the existing data dir) and the SQL is fixed.
- **A Gmail App Password is 16 lowercase letters.** If `EMAIL_PASS` is anything else the
  mailer logs `[mailer] (disabled)` or a 535/534 error and reports never email anyone.
  `isConfigured()` returning true is NOT proof — preflight runs `transporter.verify()`
  which authenticates against Gmail without sending anything.
- **Vite binds IPv6 loopback (`::1`) ONLY — never health-check it on 127.0.0.1.**
  A port probe that connects to IPv4 `127.0.0.1:5173` reports the dev server as down
  while it is running perfectly. This made `start-cenrowatch.ps1` wait its full 90s
  timeout and then wrongly announce that Vite had failed to start. Use
  `Get-NetTCPConnection -LocalPort <port> -State Listen` (address-family agnostic,
  and it does NOT need admin, unlike `Get-NetFirewallRule`), or try both `::1` and
  `127.0.0.1`. The same bug silently defeats orphaned-Vite detection in the stop
  script, which is the one thing that check exists to do.
- **`start-cenrowatch` no longer runs the backend with `npm run dev`.** The backend lives
  in Docker now and `backend/node_modules` does not exist on the host, so the old
  launcher opened a window that died instantly and would have fought the
  container for port 5000. The launcher now does: Docker -> `docker compose up -d`
  -> wait for /api/health -> web dev server -> `scripts/preflight.mjs`. Double-click
  `check-cenrowatch.bat` alone to verify a system that is already running.
## Current Sprint
Sprint 4 — Admin Analytics & Management (COMPLETE). All four sprints are done.
- Backend: Admin-only `/admin` API. `GET /admin/analytics` (Prisma groupBy + JS
  bucketing, no raw SQL): users by role/active, report totals, status breakdowns,
  by complaint/request type, per-barangay counts (with coords), 6-month trend, SLA
  compliance, avg complaint resolution time, endangered count. Users
  `GET/POST /admin/users` + `PATCH /admin/users/:id` (mint any role; self-lockout
  guard). `GET /admin/audit-logs` (filter/paginate). Settings `GET /admin/settings`
  + `PATCH /admin/settings/:key` (validates *_minutes). AuditLog on every mutation.
- Web: AdminLayout + dashboard (dependency-light SVG/CSS charts: 6-month trend +
  type/barangay bars, SLA + resolution cards), GIS analytics page (MapView + per-
  barangay table), Users (create + inline role/active edits), Audit Log viewer,
  System Settings (inline edit). All-reports views reuse the staff queue pages.
  Routes nested under `<ProtectedRoute roles={['Admin']}>`.
- Post-Sprint-4 (branch `feature/email-otp-verification`): email confirmation by
  six-digit code. SOFT GATE — an unconfirmed resident signs in and files reports
  normally; the only thing withheld is a password reset, because mailing a reset
  link to an unproven address is the actual risk. `User.email_verified_at` +
  `EmailVerificationToken` (hashed code, TTL, attempts spent BEFORE compare).
  Authenticated `POST /auth/verify-email`, `POST /auth/resend-verification`,
  `PATCH /auth/email` (self-service typo fix while unverified). Admin escape hatch
  `PATCH /admin/users/:id/verify-email` writes `ADMIN_EMAIL_VERIFIED` — deliberately
  a DIFFERENT audit action from `EMAIL_VERIFIED`, since a staff member vouching is a
  weaker claim than the user proving it. `create-admin.js` and admin-created accounts
  stamp verified at creation (an Admin typed the address).
- IT-expert evaluation response (branch `feature/email-otp-verification`), five
  items, phased. Phase 4 (encryption + file access) is the last:
  - **Uploads are no longer public.** `/uploads` was bare `express.static` — no
    auth, no rate limit, no expiry — and because the local driver's `fileUrl()`
    was a pass-through, the path stored in `photo_path` WAS the public URL. It is
    now a route requiring an HMAC signature over path+expiry (1h TTL, key derived
    from `JWT_SECRET` via HMAC for domain separation), with traversal blocked
    before the signature check and its own `fileLimiter`. Signed URLs rather than
    a Bearer header because `<img>` cannot send one and a JWT in a query string
    would leak into logs and history. Same contract the GCS driver already had.
  - **Field encryption at rest** (AES-256-GCM) on four fields verified never
    queried: `User.contact_number`, `Complaint.reporter_name`,
    `.reporter_contact`, `.address_details` (+ `WildlifeTurnover.address_details`).
    Wired as a Prisma client extension in `src/utils/prisma.js`, so a new query
    cannot forget it. `email`/`first_name`/`last_name`/`description` are
    deliberately NOT encrypted — login and two shipped search boxes use them; the
    extension THROWS if a where/orderBy/groupBy touches an encrypted column,
    because that would otherwise match nothing forever with no error.
    `npm run encrypt-pii` converted existing rows (dry-run default, idempotent).
  - Uploads are now magic-byte sniffed, not just Content-Type checked (SVG was
    accepted as `image/jpeg` before). `SECURITY.md` documents why bcrypt stays
    for passwords, where SHA-256 legitimately appears, and the HTTPS requirement.
- Sprint 3 (done): CENRO Staff interface — `/staff` queues + status workflow +
  ComplaintStatusHistory + SLA recompute + resident email (Nodemailer/Gmail,
  graceful) + StaffLayout/queues/detail web UI.
- Sprint 2 (done): resident reporting backend + web/mobile resident UI + public GIS map.
- Sprint 1 (done): auth + RBAC across backend/web/mobile; shared UI kits; Figma palette.
- Email: live — EMAIL_USER/EMAIL_PASS (Gmail App Password) set in backend/.env.
- Test accounts (dev) — THE TWO DATABASES HOLD DIFFERENT ACCOUNTS. Check which
  setup you are on (see Environment Notes) before believing either list.
  - **Docker DB** (verified 2026-08-24 against the container): admin@cenrowatch.local
    / Admin@1234; staff@cenrowatch.local / Staff@1234. Set by `seed-users.ps1`.
    Residents are quizanakoshi@gmail.com (reset 2026-08-24 to `resident123`),
    zaspaholian@gmail.com and moroedward@gmail.com — the last two are bcrypt-hashed
    and unrecoverable; reset one with `hashPassword` from `src/utils/password` if
    needed. There is no juan.delacruz@example.com here.
  - **Native DB** (verified 2026-09-08 by bcrypt-comparing every stored hash):
    admin@cenrowatch.local / AdminPass123; staff@cenrowatch.local / StaffPass123;
    juan.delacruz@example.com / Resident123. These still work — `seed-users.ps1`
    never touched this database. An earlier note here claimed they were dead; that
    was true of the container only.
- Known gotcha: Express 5 req.query is read-only — coerce query params in services
  (see memory `express5-query-readonly`).
