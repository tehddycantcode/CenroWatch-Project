# CENROWATCH — Setup Guide

How to get the project running on a **new PC/laptop** after cloning from GitHub.

> The repo contains the **source code only**. Each machine builds its own
> environment: Node.js, dependencies (`node_modules`), a local MySQL database,
> and `.env` files with secrets. None of those are stored in git — that's
> intentional and normal. This guide rebuilds them from the blueprint.

Repo: https://github.com/tehddycantcode/CenroWatch-Project

There are **two ways** to run it:

- **Option A — Docker (recommended, easiest):** one command brings up MySQL + API
  + web, with migrations and seeding done automatically. See just below.
- **Option B — Manual setup:** install Node + MySQL yourself and run each app.
  Sections 1–7 further down.

---

## Option A — Docker Compose (recommended)

The fastest way to run everything after cloning. It starts MySQL, the API, and the
web app together — **no manual MySQL install, no manual migrate/seed**.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- Git

### Run it

```powershell
git clone https://github.com/tehddycantcode/CenroWatch-Project.git
cd CenroWatch-Project

# 1. Create env files from templates, then fill in the real values
copy backend\.env.example backend\.env    # JWT_SECRET, EMAIL_USER/PASS, GCS_*, ...
copy web\.env.example     web\.env         # VITE_MAPTILER_API_KEY

# 2. Start everything (first run builds the images — a few minutes)
docker compose up --build
```

Then open:

| App | URL |
|-----|-----|
| Web | http://localhost:5173 |
| API | http://localhost:5000/api/v1 (health: http://localhost:5000/api/health) |
| MySQL | `localhost:3307` (user `root`, password `cenrowatch`, db `cenrowatch_db`) |

The API container **applies migrations and seeds the 18 barangays + SLA settings
automatically on startup** (the seed is idempotent, so restarts are safe).

**You do NOT edit `DATABASE_URL`.** Compose points the API at the `db` service and
sets the DB password itself — the machine-specific database step disappears. You
only fill in the *secret* values (Gmail app password, JWT secret, MapTiler key).

### Handy commands

```powershell
docker compose up -d --build     # run in the background
docker compose logs -f backend   # follow API logs
docker compose down              # stop (keeps the database volume)
docker compose down -v           # stop AND wipe the DB volume (fresh DB next up)
docker compose up --build web    # rebuild just web after web code changes
```

Source is baked into the images, so after changing backend/web code, re-run with
`--build` to pick it up.

### Mobile is not containerized
Expo runs on your **phone** via Expo Go, so Docker doesn't run it. Point the app at
this PC's LAN IP in [mobile/src/config.js](mobile/src/config.js) (`ipconfig` →
IPv4), then `cd mobile ; npm install ; npx expo start`. Same Wi-Fi as the PC.

---

## Option B — Manual setup (without Docker)

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

### Optional: road directions on the staff map (`ORS_API_KEY`)

The staff report detail page draws the route from the CENRO office to the
report's pin. **Skip this and nothing breaks** — the map falls back to a dashed
straight line and an air distance, which is what it drew before routing existed.
With a key, the line follows real roads and the label becomes "2.6 km by road ·
about 8 min".

1. Sign up (free) at <https://openrouteservice.org/dev/#/signup> — an email
   address is enough, no card.
2. Verify the email, sign in, and open the **Dashboard**.
3. Request a token: choose the **free** plan (labelled *Standard* / *Free*), give
   it any name (e.g. `cenrowatch-dev`), and create it. The key is a long string.
4. Paste it into `backend/.env`:
   ```
   ORS_API_KEY="paste_the_key_here"
   ```
5. Restart the backend (nodemon does this for you if it is already running —
   `.env` is read per request, but restart anyway to be certain).
6. Check it: open any complaint with a map pin in the staff or admin view. The
   line should follow the roads and the text should say "by road". If it still
   says "in a straight line", ask the API directly —
   `GET /api/v1/staff/route?lat=14.2779&lng=121.1326` (signed in as staff or
   admin) answers with a `reason`:
   - `routing_not_configured` → the key is not reaching the server (typo in the
     variable name, or the backend was not restarted)
   - `routing_unavailable` → the key is there but the provider refused or was
     unreachable; the backend log line starting `[routing]` gives the status
     (403 = bad or disallowed key, 429 = daily quota spent)
   - `office_not_set` → the `cenro_office_lat` / `cenro_office_lng` settings are
     empty; fill them on the admin **Settings** page

Free tier limits are 2,500 routes/day and 40,000/month, and routes are cached
per office/pin pair, so a report costs one request no matter how often it is
opened. Governmental, academic and non-profit organisations can apply for an
upgraded *collaborative* plan from the same dashboard.

> The routing key stays **server-side** — unlike `VITE_MAPTILER_API_KEY`, which
> the browser must hold to fetch tiles, this one never leaves the backend.

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
