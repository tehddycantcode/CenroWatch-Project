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
- MySQL 8 IS installed and running locally (service `MySQL80`). `cenrowatch_db`
  is migrated (`prisma/migrations/`) and seeded (18 barangays + SLA settings).
  The `mysql` CLI is not on PATH, but Prisma connects over TCP via `DATABASE_URL`.

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
- Test accounts (dev): admin@cenrowatch.local / AdminPass123 (Admin);
  staff@cenrowatch.local / StaffPass123 (CENRO_Staff); juan.delacruz@example.com /
  Resident123. Known gotcha: Express 5 req.query is read-only — coerce query params
  in services (see memory `express5-query-readonly`).
