# CENROWATCH

**Web-Based System for Environmental Reporting, Wildlife Turnover, and Issue Management for CENRO Cabuyao**

A centralized digital governance platform replacing the paper-based and spreadsheet-based
operations of the City Environment and Natural Resources Office (CENRO) of Cabuyao City,
Laguna. Capstone project — Pamantasan ng Cabuyao, BS Information Technology.

**Researchers:** Moro, Edward Justine G. · Quizana, Koshi Cyrus G. · Zaspa, Holian Isaac R.

---

## Monorepo Layout

| Folder      | Stack                                   | Dev Port |
|-------------|-----------------------------------------|----------|
| `backend/`  | Node.js + Express + Prisma + MySQL      | 5000     |
| `web/`      | React + Vite + Tailwind + shadcn/ui     | 5173     |
| `mobile/`   | React Native + Expo                     | Expo Go  |

## Roles (RBAC)
- **Admin** — full system, analytics, user management, audit logs, settings
- **CENRO_Staff** — process complaints, wildlife turnovers, service requests
- **Resident** — submit & track complaints, wildlife reports, service requests

---

## Prerequisites
- Node.js 20+ (this machine: v24.17.0 LTS)
- MySQL 8.0+ (or a hosted MySQL connection string) — **not yet installed**
- A MapTiler Cloud API key (web maps)
- A Gmail App Password (Nodemailer)
- A Google Cloud Storage bucket + service-account key (file uploads)

## Setup

### Backend
```powershell
cd backend
npm install
copy .env.example .env        # then fill in DATABASE_URL, JWT_SECRET, etc.
npx prisma generate
npx prisma migrate dev --name init   # requires a reachable MySQL DATABASE_URL
node prisma/seed.js                  # seeds the 18 Cabuyao barangays
npm run dev                          # starts API on http://localhost:5000
```
Health check: `GET http://localhost:5000/api/health`

### Web
```powershell
cd web
npm install
copy .env.example .env        # set VITE_API_URL, VITE_MAPTILER_API_KEY
npm run dev                   # http://localhost:5173
```

### Mobile
```powershell
cd mobile
npm install
npm start                     # opens Expo; scan QR with Expo Go
```

> **Note (Windows PATH):** Node is installed at user scope. If `node`/`npm` aren't found in
> a new terminal, open a fresh PowerShell window (it reads the updated user PATH), or run:
> `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`

---

## Development Status
- [x] **Sprint 0** — Workspace scaffolding (in progress)
- [ ] **Sprint 1** — Authentication & user management
- [ ] **Sprint 2** — Resident interface (complaint/wildlife/request forms + public pages)
- [ ] **Sprint 3** — CENRO Staff dashboard + notifications
- [ ] **Sprint 4** — Admin analytics, GIS dashboard, audit logs, PDF export

See [`CLAUDE.md`](./CLAUDE.md) for the authoritative project context and rules.
