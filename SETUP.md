# CENROWATCH — Setup Guide

How to get the project running on a **new PC/laptop** after cloning from GitHub.

> The repo contains the **source code only**. Each machine builds its own
> environment: Node.js, dependencies (`node_modules`), a local MySQL database,
> and `.env` files with secrets. None of those are stored in git — that's
> intentional and normal. This guide rebuilds them from the blueprint.

Repo: https://github.com/tehddycantcode/CenroWatch-Project

---

## 1. Prerequisites (install these first)

| Tool | Why | Notes |
|------|-----|-------|
| **Node.js** (LTS, v20+) | Runs backend, web, mobile | https://nodejs.org — the normal installer adds Node to your PATH automatically. |
| **MySQL Server 8** | The database | https://dev.mysql.com/downloads/installer/ — remember the **root password** you set during install. |
| **Git** | Clone + version control | https://git-scm.com |
| **Expo Go** app | Run the mobile app on a phone | App Store / Google Play (only needed for mobile). |

> **PATH note (current dev machine only):** On the machine this project was first
> built on, Node was installed without admin rights and isn't auto-added to PATH,
> so commands there must be prefixed with:
> ```powershell
> $env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
> ```
> On a **normal** Node install (new laptop), you do **not** need this — `node`
> and `npm` just work.

---

## 2. Clone the repository

```powershell
git clone https://github.com/tehddycantcode/CenroWatch-Project.git
cd CenroWatch-Project
```

---

## 3. Install dependencies (per app)

```powershell
cd backend ; npm install
cd ../web  ; npm install
cd ../mobile ; npm install
cd ..
```

---

## 4. Create the environment files

The real `.env` files are **gitignored** (they hold secrets). Copy the templates
and fill in your own values:

```powershell
copy backend\.env.example backend\.env
copy web\.env.example web\.env
```

Then edit them:

**`backend/.env`** — at minimum:
- `DATABASE_URL` → put **this machine's** MySQL root password, e.g.
  `mysql://root:YOUR_PASSWORD@localhost:3306/cenrowatch_db`
- `JWT_SECRET` → any random string, **at least 32 characters**

**`web/.env`** — at minimum:
- `VITE_API_URL` → `http://localhost:5000/api/v1` (default is fine)
- `VITE_MAPTILER_API_KEY` → leave blank until we reach the maps feature (free key at https://cloud.maptiler.com)

> Never commit `.env` or `gcs-key.json`. They are already in `.gitignore`.

---

## 5. Set up the database

Make sure the **MySQL service is running**, then from `backend/`:

```powershell
cd backend
npx prisma migrate deploy   # creates cenrowatch_db + all tables from committed migrations
npx prisma generate         # generates the Prisma client
npm run seed                # seeds the 18 barangays + SLA settings
```

Create a login account to test with (optional but recommended):

```powershell
# PowerShell — set the values you want, then run the script
$env:NEW_USER_EMAIL="admin@cenrowatch.local"
$env:NEW_USER_PASSWORD="ChangeMe123"
$env:NEW_USER_ROLE="Admin"        # Admin | CENRO_Staff
npm run create-admin
```

> **Your data does not transfer from another machine.** Each PC has its own local
> database. The migrations rebuild the table **structure** and the seed adds the
> 18 barangays; user accounts are created fresh per machine (register in the app,
> or use `create-admin`).

---

## 6. Run the apps

Each app runs in its **own terminal** (they are long-running). Start the backend
first so web/mobile can reach the API.

| App | Folder | Command | URL |
|-----|--------|---------|-----|
| Backend API | `backend` | `npm run dev` | http://localhost:5000 |
| Web | `web` | `npm run dev` | http://localhost:5173 |
| Mobile | `mobile` | `npm start` | Expo QR → scan with Expo Go |

Quick health check (backend running):
```powershell
# open in a browser or:
curl http://localhost:5000/api/health
```

### Mobile + API on a real phone
A physical phone cannot reach `localhost` (that means the phone itself). When the
mobile app starts calling the API, point it at your computer's **LAN IP**
(e.g. `http://192.168.1.10:5000`). Find it with `ipconfig` (look for IPv4 Address).
The phone and PC must be on the **same Wi-Fi**.

---

## 7. Daily workflow (for the team)

Everyone shares **code** via git; each person keeps their **own** local database
and `.env`.

```powershell
git pull                 # get the latest code
# if package.json changed: npm install in the affected app
# if prisma/migrations changed: cd backend ; npx prisma migrate deploy
```

When you add code:
```powershell
git add -A
git commit -m "describe your change"
git push
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `'node'/'npm' not recognized` | Node not installed or not on PATH. Reinstall Node LTS, reopen the terminal. |
| `P1001: Can't reach database server` | MySQL service isn't running, or wrong password in `DATABASE_URL`. |
| `Unknown database 'cenrowatch_db'` | Run `npx prisma migrate deploy` (it creates the DB). |
| `JWT_SECRET is not set` | Add `JWT_SECRET` to `backend/.env` (min 32 chars). |
| Web loads but no data | Start the **backend** first; check `VITE_API_URL` in `web/.env`. |
| Mobile app can't log in | Use the PC's LAN IP, not `localhost`; same Wi-Fi network. |
| Port 5000 / 5173 already in use | Another process is using it — close it, or change `PORT` / Vite port. |

---

## What is intentionally NOT in the repo

`node_modules/`, `.env`, `gcs-key.json`, build output (`dist/`, `build/`), and the
database data. All are rebuilt or supplied per machine using this guide.
