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

## Environment Notes (this machine)
- OS: Windows 11, native (NOT WSL2). Shell: PowerShell.
- Node.js v24.17.0 (Krypton LTS) installed to `C:\Users\Penar\nodejs\...` (user-scope, no admin).
- A fresh shell does NOT auto-inherit Node on PATH. Prefix npm/node commands with:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`
- **The backend and database actually run in DOCKER, not natively.** Containers:
  `cenrowatch_api` (port 5000) and `cenrowatch_db` (MySQL 8, host port 3307).
  Start with `docker compose up -d` from the repo root, then ALWAYS verify with
  `node scripts/preflight.mjs`. `backend/node_modules` does NOT exist on the host —
  dependencies live inside the image, so run Prisma/node commands through
  `docker exec cenrowatch_api ...`. A local MySQL 8 service (`MySQL80`) is also
  installed but is NOT what the app uses.

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
- **`/auth` is rate-limited — don't hammer it in e2e tests:** the `authLimiter`
  throttles `/api/v1/auth/*`, so a test making many rapid auth calls hits 429 and any
  HTTP-based cleanup at the end silently fails — this once left the `juan` test account
  modified. Keep auth calls minimal, and restore/verify test data via Prisma directly
  (not the rate-limited HTTP endpoints).
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
- Sprint 3 (done): CENRO Staff interface — `/staff` queues + status workflow +
  ComplaintStatusHistory + SLA recompute + resident email (Nodemailer/Gmail,
  graceful) + StaffLayout/queues/detail web UI.
- Sprint 2 (done): resident reporting backend + web/mobile resident UI + public GIS map.
- Sprint 1 (done): auth + RBAC across backend/web/mobile; shared UI kits; Figma palette.
- Email: live — EMAIL_USER/EMAIL_PASS (Gmail App Password) set in backend/.env.
- Test accounts (dev), VERIFIED 2026-08-24 against the running container:
  admin@cenrowatch.local / Admin@1234 (Admin); staff@cenrowatch.local / Staff@1234
  (CENRO_Staff). These come from `seed-users.ps1`, which overwrote the older
  AdminPass123/StaffPass123 pair — those NO LONGER WORK. There is no
  juan.delacruz@example.com in this database; the residents are
  quizanakoshi@gmail.com, zaspaholian@gmail.com and moroedward@gmail.com, whose
  passwords are bcrypt-hashed and unrecoverable (reset one if you need to log in). Known gotcha: Express 5 req.query is read-only — coerce query params
  in services (see memory `express5-query-readonly`).
