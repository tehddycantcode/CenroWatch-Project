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
| `DOMAIN` + `API_DOMAIN` (sibling hosts, one domain) | `SameSite=Lax` | **intact**, two layers |
| `cenrowatch.pages.dev` + `x.up.railway.app` | `SameSite=None` | **intact**, one layer (see below) |

The platforms' free subdomains are *different registrable domains*, so using them
forces `SESSION_COOKIE_SAMESITE=none`. The code makes that an explicit opt-in
precisely so nobody switches it on without noticing what it costs.

**Since 2026-09-23 that no longer means giving CSRF protection up.** A second,
domain-independent defence is in place: `authenticate` refuses any
cookie-authenticated write that does not carry an `X-Requested-With` header
(`backend/src/utils/csrf.js`). A cross-site page cannot add a header to a
"simple" request, and adding one makes the request non-simple, which triggers a
preflight that the exact-origin CORS allowlist then refuses.

That closes the one gap `SameSite=None` actually opened. It is worth being precise
about what that gap was: every JSON endpoint was **already** safe, because
`Content-Type: application/json` is non-simple and gets preflighted — role
changes, settings, status updates and archiving were never reachable cross-site.
The exposure was the six `multipart/form-data` upload routes, which are simple
requests that skip the preflight, so an attacker's page could file reports in a
signed-in user's name.

Mobile is untouched by the rule: it authenticates with `Authorization: Bearer`,
which a browser never attaches by itself, so there is no forgery to prevent and
no installed APK to break.

**A real domain is still the better answer** — defence in depth, and a government
service on `*.pages.dev` has a credibility problem regardless of security. But a
free-subdomain deployment is now a reasonable starting point rather than a
documented weakness. If you take it, still record the choice in `HANDOVER.md` §10.

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

### 0.1 The mobile app's API target — **now an environment variable**

`mobile/src/config.js` no longer hardcodes an address. It reads:

```js
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.18.11:5000/api/v1';
```

The fallback is a development desk and must never reach a production build. Set
`EXPO_PUBLIC_API_URL=https://API_DOMAIN/api/v1` as an **EAS environment variable**
on the `production` (and `preview`) environment, the same way
`EXPO_PUBLIC_MAPTILER_API_KEY` is already set — `eas env:list --environment
production` to check. `EXPO_PUBLIC_*` values are inlined at **build** time, so a
wrong one cannot be corrected by `eas update`; it needs a rebuild.

Verify after building rather than trusting the config: open the app with the API
stopped and confirm the failure names your domain, not a `192.168.*` address.

### 0.1b `usesCleartextTraffic` — **already removed** (2026-09-23)

It is gone from `mobile/app.json`. Android release builds block plain `http://`
by default, which is correct now that the API is HTTPS.

The consequence to remember: an **EAS-built APK can no longer reach a plain
`http://` LAN backend at all**. Testing an APK against a laptop on the same Wi-Fi
stops working — use Expo Go for that, which ignores the release manifest's network
policy. If you ever genuinely need it back, it is the `expo-build-properties`
plugin entry in `plugins` (see `mobile/AGENTS.md` for why it cannot be a bare
`android` key), and restoring it changes the native fingerprint, so it needs a new
build and cuts existing installs off from OTA updates.

### 0.2 Add production guards

Three settings fail *silently* rather than loudly when wrong. Make the server
refuse to boot in production unless each is right.

**1. The uploads volume must actually be mounted — DONE (2026-09-23).** With
`STORAGE_DRIVER=local` and no volume, an upload returns 201, the database row is
written, and the file lives on the container's ephemeral disk until the next
deploy destroys it. No error, at any point. This was the most dangerous
misconfiguration available to you.

`backend/src/utils/uploadsPersistence.js` now refuses to start the server in that
state — the check runs in `server.js` **before the port opens**, and exits 1 with
an explanation. It is deliberately not a warning: a server that will not start is
noticed in minutes, a warning in a deploy log is not.

How it decides, in order: not production or `STORAGE_DRIVER=gcs` → nothing to
check. Otherwise the uploads directory must exist and be writable, and then be
either (a) `UPLOADS_PERSISTENT=1`, an explicit operator claim for hosts like a VPS
where the directory really does survive, (b) named by
`RAILWAY_VOLUME_MOUNT_PATH`, or (c) on a **different device id from its parent** —
which is what a real mount looks like, and needs no vendor-specific variable.

So on Railway, mounting the volume at `/app/uploads` (Part 3) is sufficient and
no extra variable is needed. Covered by `backend/tests/uploadsPersistence.test.js`.

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
3. In the **service's** Settings — not the project's; Root Directory does not
   exist on the project page, which has Shared Variables and Members instead:
   - **Source → Root Directory:** `backend`
   - **Deploy → Custom Start Command:** `npm start`

> **Connecting the repo starts a build immediately**, before you have set the
> root directory, and that first build fails: Railway looks at the repository
> root, finds no `package.json` among `backend/ web/ mobile/`, and reports
> "Railpack could not determine how to build the app". That is expected. Set the
> root directory and redeploy.

> **The build uses `backend/Dockerfile`, not Railpack.** Railway prefers a
> Dockerfile when it finds one, so the image — Debian slim, Node 20, OpenSSL for
> Prisma's query engine — is what ships, and `engines`/Railpack detection are not
> consulted. The same image builds Koshi's local stack, so a change here affects
> both; `docker-compose.yml` supplies its own `command` for the local behaviour
> that does not belong in a deployed image.

> **Do not use `npm run start:docker`.** It runs `prisma migrate deploy && node
> prisma/seed.js` before the server on *every* start. Migrations belong in the
> pre-deploy command (Part 4), and re-running the seed against a live database
> reverts admin-edited settings — see Part 4 for exactly what it overwrites.
>
> That used to be the Dockerfile's own `CMD`, which meant this warning was the
> only thing standing between a deploy and silently reverted settings — one
> cleared text field in the Railway UI and every restart re-seeded production.
> Since 2026-09-23 the image just serves (`CMD ["npm", "start"]`), so the Start
> Command above is belt-and-braces rather than the whole belt.

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
| All **six** settings — the four SLA budgets **and** the two CENRO office coordinates | `seed.js:90-96` |
| Every seeded barangay's latitude, longitude and boundary | `seed.js:76-79` |
| Every complaint type's `sort_order` | `seed.js:102-105` |
| Every request type's `sort_order`, `sla_setting_key`, `sla_fallback_minutes` | `seed.js:109-116` |

Only `is_active` and `label` are spared, deliberately. **An SLA figure an Admin
corrected to match the Citizens Charter is not.** It reverts with no error, no
warning and no audit row. See `HANDOVER.md` §11.1c.

The same now applies to the CENRO office coordinates: if the office moves and an
Admin updates them on the Settings page, a second seed puts them back at City
Hall, and the only visible symptom is that every report's "distance from the
office" is quietly wrong.

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
| `BREVO_API_KEY` | the Brevo transactional API key | **Required — SMTP does not work here, see below** |
| `EMAIL_FROM` | the display address | Must be a **verified sender** in Brevo |
| `EMAIL_USER` | the CENRO mailbox | Local development only |
| `EMAIL_PASS` | the 16-letter Gmail App Password | Local development only |
| `ORS_API_KEY` | the OpenRouteService "Basic Key" | Optional — see below |

### Email: the host blocks SMTP, so do not try to use Gmail directly

**Railway drops outbound SMTP.** Measured from inside the running container on
2026-09-24: ports 25, 465 and 587 to `smtp.gmail.com` all time out with no
response, while `api.github.com:443` connects in 44 ms from the same process.
DNS resolves Gmail correctly and the App Password is valid — nothing ever
reaches Gmail to be authenticated, so every verification code, password reset
and status-update email is silently discarded. `sendMail` never throws, so the
app reports success throughout and the only trace is `[mailer] failed to
email …: Connection timeout` in the server log.

No nodemailer setting fixes this. An earlier attempt set `family: 4`, reading
the `ENETUNREACH … 2607:f8b0:…` in the log as an IPv6 problem; nodemailer 9 has
no `family` option, and it already tries IPv4 before IPv6, so that error only
ever meant the IPv4 attempt had failed first. Both families are blocked on all
three ports.

So mail goes over **HTTPS** instead, via Brevo's transactional API:

1. Create a free Brevo account (300 emails/day, no card).
2. **Senders → add and verify a sender address.** A Gmail address is fine; a
   custom domain is not required. Whatever you verify must equal `EMAIL_FROM`,
   or the API answers `400 sender is not valid`.
3. **SMTP & API → API Keys → generate**, and set it as `BREVO_API_KEY` on the
   Railway service.

`EMAIL_USER`/`EMAIL_PASS` stay for local development, where Gmail is reachable.
With `BREVO_API_KEY` set the SMTP path is not used at all.

`ORS_API_KEY` draws the driving route from the office to a report on the staff
detail map. Leave it unset and that map falls back to a straight line and an air
distance; nothing breaks and no error appears. It is server-side only — the web
bundle never sees it. `SETUP.md` covers getting a key, and `ORS_ENDPOINT`
overrides the provider URL if HeiGIT's migration off `api.openrouteservice.org`
ever bites.

The office coordinates themselves are **not** environment variables: they are the
`cenro_office_lat` / `cenro_office_lng` rows on the admin Settings page, seeded by
`prisma/seed.js` to the City Hall location. Confirm them after the seed (Part 4);
if either is blank the distance line simply does not render.

`FIELD_ENCRYPTION_KEY` must be the **same key the existing data was encrypted
with**. A new key does not re-encrypt anything; it makes every existing encrypted
field unreadable, permanently.

### `SESSION_COOKIE_SAMESITE` — required on free subdomains

On a real domain with the API on a subdomain of it, leave this unset: `Lax` is
the default and the stronger setting.

**Deploying on the platforms' free subdomains, you MUST set it:**

```
SESSION_COOKIE_SAMESITE=none
```

`*.pages.dev` and `*.up.railway.app` are different registrable domains, so the
browser refuses to attach a `Lax` cookie to the API call. The symptom is not an
error anyone would connect to cookies: **sign-in appears to succeed, the page
loads for a moment, then bounces back to the login screen** — because `/auth/me`
goes out without the cookie, answers 401, and `AuthContext` signs the user out.
Nothing in the logs says "cookie".

`Secure` is implied by `NODE_ENV=production`, which `None` requires anyway, so
both sides must be HTTPS — they are.

This gives up SameSite's CSRF protection, which is survivable **only because**
cookie-authenticated writes separately require the `X-Requested-With` header
(`backend/src/utils/csrf.js`). Without that, this setting would be a real
weakness rather than a trade.

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
| 15 | File a report **from the deployed web app** | Succeeds — proves the CSRF header survives the cross-origin preflight |
| 16 | Repeat that write with the `X-Requested-With` header removed | **403** |

Checks 15 and 16 are a pair, and 15 is the one that can only be done after
deploying. Locally the web app reaches the API through Vite's proxy, so it is
same-origin and no preflight happens; in production they are different origins
and every write is preflighted. `cors()` is configured without an explicit
`allowedHeaders`, so it reflects whatever the browser asks for and this should
pass — but "should" is why it is on the list.

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
