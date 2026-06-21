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

## Current Sprint
Sprint 3 — CENRO Staff Interface (COMPLETE; awaiting confirmation for Sprint 4).
- Backend: role-gated `/staff` API (CENRO_Staff + Admin) — queues
  `GET /staff/{complaints,wildlife,requests}` (status/barangay/priority/search +
  pagination, reporter contact shown), detail by id-or-tracking, status workflow
  `PATCH /staff/<kind>/:id/status` (ComplaintStatusHistory, side-effects: resolved_at /
  intake-release / scheduled-completion / CENRO-head approval, recompute exceeded_sla,
  AuditLog, resident email), field edits `PATCH /staff/<kind>/:id` (assign/priority/
  notes), and `GET /staff/overview` dashboard stats. Graceful Nodemailer/Gmail mailer
  (`utils/mailer.js` no-ops + logs in dev without creds; never throws) + status
  templates (`utils/notify.js`). No schema change (staff fields already in schema).
- Web: StaffLayout + dashboard (open/SLA/priority stats + recent), reusable StaffQueue
  (filters + table + pagination) for the 3 queues, detail pages with StatusUpdateForm
  (status + note→email + conditional field) and complaint status-history timeline.
  Routes nested under `<ProtectedRoute roles={['CENRO_Staff','Admin']}>`.
- Sprint 2 (done): resident reporting backend + web/mobile resident UI + public GIS map.
- Sprint 1 (done): auth + RBAC across backend/web/mobile; shared UI kits; Figma palette.
- Email: set EMAIL_USER + EMAIL_PASS (Gmail App Password) in backend/.env to send for
  real; otherwise notifications are logged, not sent.
- Test accounts (dev): staff@cenrowatch.local / StaffPass123 (CENRO_Staff);
  admin@cenrowatch.local / AdminPass123 (Admin); juan.delacruz@example.com / Resident123.
- Remaining sprint: 4 admin analytics. STOP for confirmation before starting Sprint 4.
