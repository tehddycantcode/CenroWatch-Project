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
Sprint 1 — Authentication & RBAC (COMPLETE; awaiting confirmation for Sprint 2).
- Backend: register (Resident-only), login, `GET /me`, JWT (bcryptjs hashing),
  `authenticate` + `authorize(...roles)` middleware, express-validator, AuditLog on
  every mutation, public `GET /barangays`, `npm run create-admin` for Admin/Staff.
- Web: shared UI kit in `web/src/components/ui`, Inter + DM Serif Display fonts,
  AuthContext (token in localStorage) + ProtectedRoute role gating, Login/Register
  pages from Figma. Pattern: routes → controllers → services → prisma.
- Mobile: shared UI kit in `mobile/src/components`, AuthContext (token in
  expo-secure-store) + RootNavigator (role-based), Login/Register/Home screens.
  Set the LAN IP in `mobile/src/config.js` (a phone can't reach localhost).
- Design source of truth: Figma (see memory `figma-design-file`). Palette + fonts
  mirrored in web Tailwind tokens and `mobile/src/theme.js`.
- Remaining sprints: 2 resident interface → 3 staff dashboard → 4 admin analytics.
