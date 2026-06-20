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
Sprint 2 — Resident Interface & Reporting (COMPLETE; awaiting confirmation for Sprint 3).
- Backend: complaints / wildlife / requests modules (create + listMine + getByTracking),
  per-year sequential tracking IDs (CMP/WLD/REQ-YYYY-NNNNN via `createSequential`),
  Citizens Charter SLA stamping, photo/document upload (local-disk stub at `/uploads`,
  swappable to GCS), AuditLog on every create. Public GIS: `GET /gis/{map,stats,feed}`
  — zero personal data, endangered coords obfuscated ±0.001°.
- Web: resident interface (dashboard, 3 report forms, my-reports, track) under a
  role-gated ResidentLayout; public MapLibre map (`/map`) + reports feed (`/feed`) +
  live landing stats; in-form interactive map pin-picker (MapTiler).
- Mobile: resident interface mirroring web — dependency-light ResidentNavigator
  (screen stack + Home/My Reports tabs) routed by role from RootNavigator; Dashboard,
  Complaint/Wildlife/Service-Request forms, My Reports, Track screens. Photo via
  expo-image-picker, GPS via expo-location (no native map in Expo Go). Shared report
  metadata in `mobile/src/lib/reports.js`. Set the LAN IP in `mobile/src/config.js`.
- Sprint 1 (done): auth + RBAC across backend/web/mobile; shared UI kits; Figma palette.
- Design source of truth: Figma (see memory `figma-design-file`). Palette + fonts
  mirrored in web Tailwind tokens and `mobile/src/theme.js`.
- Remaining sprints: 3 staff dashboard → 4 admin analytics. STOP for confirmation
  before starting Sprint 3.
