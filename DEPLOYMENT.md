# CENROWATCH — Deployment Runbook

Target: **Railway** (API + MySQL + uploads volume), **Cloudflare Pages** (web app),
**EAS** (Android APK), behind a custom domain with managed TLS.

Follow this in order on deployment day. `SETUP.md` covers local development and is
not a substitute — nothing below runs on a laptop.

> **This replaces an earlier Google Cloud runbook** (Cloud Run + Cloud SQL + Cloud
> Storage). That version is still in git history — `git log --follow DEPLOYMENT.md` —
> if it is ever needed. The move was made because Railway and Cloudflare deploy on
> `git push`, cost roughly a fifth as much, and remove two of the four blockers the
> Cloud Run path required.

Placeholders used below, replace consistently:

| Placeholder | Example |
|---|---|
| `DOMAIN` | `cenrowatch.cabuyao.gov.ph` |
| `API_DOMAIN` | `api.cenrowatch.cabuyao.gov.ph` |
| `REPO` | `tehddycantcode/CenroWatch-Project` |

---

## Part 0 — The domain decision, before you create any account

**Read this first.** It is the one choice that is expensive to reverse, and getting
it wrong silently weakens the system rather than breaking it.

The web session is an HttpOnly cookie (`backend/src/utils/sessionCookie.js`) set
with `SameSite=Lax`. Lax is what stops another website from making a
state-changing request using a signed-in resident's session. **It only holds while
the web app and the API are on the same registrable domain.**

| Setup | Cookie needed | CSRF protection |
|---|---|---|
| `DOMAIN` + `API_DOMAIN` (sibling hosts, one domain) | `SameSite=Lax` | **intact** |
| `cenrowatch.pages.dev` + `x.up.railway.app` | `SameSite=None` | **given up** |

The platforms' free subdomains are *different registrable domains*, so using them
forces `SESSION_COOKIE_SAMESITE=none`. The code makes that an explicit opt-in
precisely so nobody switches it on without noticing what it costs.

**So: register the domain first, and put the API on a subdomain of it.** Everything
below assumes that. If CENRO truly cannot obtain a domain, the system still works —
set `SESSION_COOKIE_SAMESITE=none`, and record it as a known weakness in
`HANDOVER.md` §10 rather than leaving it undocumented.

---

## Part 0b — Code fixes before you deploy

Two of the four blockers that the Cloud Run path required are **gone** under this
architecture, and it is worth knowing why so nobody "fixes" them later:

- **`web/Dockerfile` runs the Vite dev server.** No longer relevant — Cloudflare
  Pages builds `web/` and serves the static `dist/`. The Dockerfile is unused by
  deployment. Delete it or leave it for local Docker; it is no longer on the path.
- **The GCS driver cannot use Cloud Run's built-in identity.** No longer relevant —
  uploads go to a Railway volume with `STORAGE_DRIVER=local`. Google Cloud Storage
  is not used at all. `gcs.driver.js` stays in the tree as a supported option if
  CENRO ever outgrows a single volume.

Two remain, and both still matter:

### 0.1 `mobile/src/config.js` points at a LAN address

```js
export const API_URL = 'http://192.168.0.97:5000/api/v1';
```

It must become `https://API_DOMAIN/api/v1`. This is a plain constant in `src/`, so
since over-the-air updates were wired up it can be corrected by `eas update`
without a rebuild — **but only for phones already running a build that contains the
updater**. The first production APK must be built with the correct value.

Note also `usesCleartextTraffic: true` in `mobile/app.json`. It exists for local
`http://` development. Production is HTTPS, so it is no longer needed and should be
removed — that is a native change, so it needs a rebuild, not an update.

### 0.2 Add production guards

Three settings fail *silently* rather than loudly when wrong. Make the server
refuse to boot in production unless each is right.

**1. The uploads volume must actually be mounted.** With `STORAGE_DRIVER=local`
and no volume, an upload returns 200, the database row is written, and the file
lives on the container's ephemeral disk until the next deploy destroys it. No
error, at any point. This is the most dangerous misconfiguration available to you.

Railway automatically sets `RAILWAY_VOLUME_MOUNT_PATH` on a service that has a
volume attached. Guard on it: in production, refuse to boot if
`STORAGE_DRIVER=local` and that variable is missing or does not point at the
uploads directory. (Confirm the exact variable name in the service's Variables tab
before relying on it.)

**2. `TRUST_PROXY` is unset.** Railway terminates TLS in front of your container,
so `req.ip` is the proxy for every request and **all of Cabuyao shares one
rate-limit bucket** — the first person to trip a limit 429s everyone. Set
`TRUST_PROXY=1`. Never `true`: that trusts a client-supplied `X-Forwarded-For` and
lets anyone spoof around the limits.

**3. `FIELD_ENCRYPTION_KEY` is unset.** Already implemented — keep it.

---

## Part 1 — Railway project and the API service

1. Sign in to Railway with the **CENRO-owned** GitHub account, not a student's.
2. **New Project → Deploy from GitHub repo → `REPO`**.
3. In the service's **Settings**:
   - **Root Directory:** `backend`
   - **Start Command:** `npm start`

> **Do not use `npm run start:docker`.** It runs `prisma migrate deploy && node
> prisma/seed.js` before the server on *every* start. Migrations belong in the
> pre-deploy command (Part 4), and re-running the seed against a live database
> reverts admin-edited settings — see Part 4 for exactly what it overwrites.

Railway sets `PORT` itself and `server.js` already reads it, so no change there.

---

## Part 2 — MySQL

1. In the project: **New → Database → Add MySQL**.
2. Open the MySQL service's **Variables** tab and note the connection URL variable
   (typically `MYSQL_URL`; confirm the exact name rather than assuming).
3. On the **API service**, add:

```
DATABASE_URL=${{MySQL.MYSQL_URL}}
```

The `${{Service.VARIABLE}}` syntax resolves inside Railway's private network, so
the database is never exposed to the public internet and the credential is never
copied into a second place.

**Backups are not automatic.** Railway does not take scheduled logical backups for
you the way Cloud SQL did. Before handover, set up a recurring `mysqldump` (a
scheduled Railway cron service writing to object storage is the usual shape) and
**restore it once to prove it works** — `HANDOVER.md` §7 and §11.1f depend on this
existing. Do not skip it because the old runbook made it free.

---

## Part 3 — The uploads volume

`UPLOAD_ROOT` is hardcoded in `backend/src/middlewares/upload.js` as
`backend/uploads`, and Railway places application files at `/app` with
`backend` as the root directory.

**Mount the volume at exactly `/app/uploads`.**

1. Command Palette (`Ctrl/⌘ K`) → **New Volume** → attach to the API service.
2. Mount path: `/app/uploads`
3. Set `STORAGE_DRIVER=local` on the API service.

Volumes are mounted when the container **starts**, not during build or pre-deploy.
Nothing written at build time persists. The local driver calls `mkdir` on demand,
so an empty volume is fine.

---

## Part 4 — Migrations as a pre-deploy command

In the API service's **Settings → Deploy → Pre-Deploy Command**:

```
npx prisma migrate deploy
```

This runs once per deployment, between build and release, with the service's
environment available. **If it fails the deploy does not proceed** — which is
exactly what you want from a migration step, and better than the old boot-time
approach where every cold start raced every other one.

> **Before every migration:** confirm the generated SQL uses **PascalCase** table
> names (`ALTER TABLE \`Complaint\``). Prisma generates them lowercase on the
> Windows dev machine and that SQL hard-fails on Linux. This has happened four
> times out of four. `npm test` catches it via `migrationCasing.test.js` — run the
> suite before you push.

### The seed runs **once**, by hand, and never again

On first deploy only, from the service's shell or a one-off command:

```
node prisma/seed.js
```

It is idempotent in row *count*, but destructive of *edits*: the `update` branch
of every upsert re-applies the seeded value over whatever is in the row now.

| Re-running the seed silently overwrites | Where |
|---|---|
| All four service deadlines (`setting_value`) | `seed.js:86-90` |
| Every seeded barangay's latitude, longitude and boundary | `seed.js:76-79` |
| Every complaint type's `sort_order` | `seed.js:102-105` |
| Every request type's `sort_order`, `sla_setting_key`, `sla_fallback_minutes` | `seed.js:109-116` |

Only `is_active` and `label` are spared, deliberately. **An SLA figure an Admin
corrected to match the Citizens Charter is not.** It reverts with no error, no
warning and no audit row. See `HANDOVER.md` §11.1c.

---

## Part 5 — Environment variables on the API service

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{MySQL.MYSQL_URL}}` | Part 2 |
| `NODE_ENV` | `production` | Also makes `FIELD_ENCRYPTION_KEY` mandatory |
| `STORAGE_DRIVER` | `local` | With the volume from Part 3 |
| `TRUST_PROXY` | `1` | Never `true` |
| `JWT_SECRET` | *(generate, 32+ random bytes)* | Rotating it signs everyone out |
| `JWT_EXPIRES_IN` | `7d` | The session cookie's lifetime is parsed from this |
| `FIELD_ENCRYPTION_KEY` | *(the existing key)* | **No recovery if lost** — `HANDOVER.md` §2 |
| `CLIENT_URL` | `https://DOMAIN` | CORS allowlist |
| `MOBILE_URL` | *(only if a distinct origin is needed)* | CORS allowlist |
| `EMAIL_USER` | the CENRO mailbox | `HANDOVER.md` §1.2 |
| `EMAIL_PASS` | the 16-letter Gmail App Password | Not the account password |
| `EMAIL_FROM` | the display address | Optional |

`FIELD_ENCRYPTION_KEY` must be the **same key the existing data was encrypted
with**. A new key does not re-encrypt anything; it makes every existing encrypted
field unreadable, permanently.

Do **not** set `SESSION_COOKIE_SAMESITE` unless Part 0 forced you to.

---

## Part 6 — API custom domain

1. API service → **Settings → Networking → Custom Domain** → `API_DOMAIN`.
2. Add the CNAME Railway gives you at your DNS provider.
3. TLS is provisioned automatically; wait for it to go green before testing.

Confirm `https://API_DOMAIN/api/health` returns `200` with `"status":"ok"` before
continuing. Everything after this depends on it.

---

## Part 7 — Administrator accounts

Public registration only ever creates Residents, and **no Administrator can be
created from inside the running app**: `ASSIGNABLE_ROLES` in
`backend/src/validators/admin.validators.js:9` is `['CENRO_Staff', 'Resident']`,
so the Admin → Users screen cannot mint the role even for an existing Admin.

Create each Admin as a one-off command on the API service:

```
NEW_USER_EMAIL=admin@cabuyao.gov.ph NEW_USER_PASSWORD=<temp> NEW_USER_ROLE=Admin \
  node prisma/create-admin.js
```

Hand the password to CENRO and have them change it immediately.

**Do it twice.** CENRO must hand over with **two** Administrator accounts
(`HANDOVER.md` §11.1e) — with only one, a forgotten password or a single staff
transfer locks the office out of its own system, and there is no self-service way
back in.

Never leave a password in a saved command or variable. Run it, then clear it.

---

## Part 8 — Web app on Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** →
   `REPO`.
2. Build settings:
   - **Root directory:** `web`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Settings → Environment variables**, for the Production environment:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://API_DOMAIN/api/v1` |
| `VITE_MAPTILER_API_KEY` | the MapTiler key |

> `VITE_*` values are baked into the bundle at **build** time, not read at runtime.
> Changing one means triggering a rebuild, not restarting anything.

4. **Custom domains → Set up a domain** → `DOMAIN`.

Cloudflare Pages' free tier has unlimited bandwidth on static assets and permits
commercial use, which is why it is used here rather than Vercel — Vercel's free
Hobby plan is **non-commercial only**, and a government service would be in breach.

After this, `git push` to the default branch rebuilds and redeploys the site.

---

## Part 9 — Android APK

```
cd mobile
eas build --profile preview --platform android
```

`eas.json`'s `preview` profile produces an internal-distribution APK and sets the
`preview` update channel. Distribute the link EAS returns.

Once that build is installed, JS-only revisions no longer need a reinstall:

```
eas update --channel preview --message "what changed" --environment preview
```

The update applies on the **next** app launch. What still requires a rebuild —
permissions, icon, app name, native packages — is recorded in `mobile/AGENTS.md`.

---

## Part 10 — Post-deploy verification

Do not declare success on a green deploy log. Check the running system — this
project has a documented history of features that were correct in git and dead in
the environment.

| # | Check | Expected |
|---|---|---|
| 1 | `curl https://API_DOMAIN/api/health` | `200`, `"status":"ok"` |
| 2 | Register a test resident | Confirmation email **arrives** |
| 3 | Sign in on `https://DOMAIN` | Works, and stays signed in on reload |
| 4 | File a complaint **with a photo** | Returns 201 |
| 5 | Open that complaint | Photo renders |
| 6 | Copy the photo URL, strip the `?e=...&s=...` query, open it | **403** — if this returns the photo, uploads are public |
| 7 | **Redeploy the API, then reopen the complaint** | Photo still loads |
| 8 | Admin → Users, search a name | Returns results (encryption boundary intact) |
| 9 | Admin → Users, view a contact number | Readable, not `enc:v1:...` |
| 10 | Query the database directly for that same number | Stored as `enc:v1:...` |
| 11 | Sign in from two different networks | Neither gets 429 (proves `TRUST_PROXY`) |
| 12 | Print a complaint PDF | Reporter name and address render |
| 13 | APK on mobile data, not Wi-Fi | Reaches the API |
| 14 | `curl https://API_DOMAIN/api/v1/gis/map` signed out | `200`, and **zero** personal data |

**Checks 6, 7 and 10 matter most.** Each corresponds to a failure that produces no
error message: uploads served publicly, the volume not actually mounted, and
encryption not actually applied. Check 7 is the one the old Cloud Run runbook could
not express — a redeploy is precisely when an unmounted volume loses everything.

---

## Rollback

Railway keeps previous deployments. Open the service's **Deployments** tab, find
the last good one, and **Redeploy**. Traffic moves in under a minute.

Cloudflare Pages keeps every build; **Deployments → Rollback** on the previous one.

**A database migration does not roll back with either.** Prisma has no
down-migrations here. If a deploy includes a destructive migration, take a
`mysqldump` immediately before it and treat restoring that as the real rollback
plan.

---

## Running costs (verify current pricing — these are order-of-magnitude)

| Service | Rough monthly |
|---|---|
| Railway — API service | usage-based; Hobby is $5/mo including $5 of usage |
| Railway — MySQL | billed from the same usage pool (storage, memory, CPU) |
| Railway — volume | small, by size |
| Cloudflare Pages | **free** — unlimited static bandwidth, commercial use permitted |
| EAS Build / Update | **free** at this scale — 30 builds/month, 1,000 monthly active users |
| Domain | annual, at the registrar |

Expect roughly **$5–10/month** in total, against $25–40 for the Cloud Run
equivalent. Railway has **no permanent free tier** and **requires a card** — settle
how CENRO will pay before committing (`HANDOVER.md` §11.1i; most LGUs cannot hold
a card). Set a usage alert on the Railway project before handover so a surprise
bill arrives as an email rather than as a suspended service.

---

## Ongoing

- **Backups:** not automatic here — see Part 2. Set up the dump, and verify a
  *restore* before handover. An untested backup is a belief, not a backup.
- **Logs:** Railway captures stdout, so morgan output lands there. It contains
  request paths; it should not contain personal data. Check before relying on it.
- **Uptime check:** point one at `https://API_DOMAIN/api/health` and alert to a
  CENRO address, not a student's.
- **`FIELD_ENCRYPTION_KEY`:** see `HANDOVER.md` §2. The one secret with no recovery
  path.
- **Recurring maintenance** — what expires, drifts or needs a yearly decision — is
  in `HANDOVER.md` §11.
