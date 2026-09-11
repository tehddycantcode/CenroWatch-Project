# CENROWATCH — Deployment Runbook

Target: **Google Cloud Run** (API) + **Cloud SQL for MySQL** (database) +
**Cloud Storage** (uploads), fronted by a custom domain with managed TLS.

This is the document you follow on deployment day, in order. `SETUP.md` covers
local development and is not a substitute — nothing below runs on a laptop.

> **Region:** use `asia-southeast1` (Singapore) throughout. It is the closest
> Google region to Cabuyao; picking a US region adds ~200 ms to every request for
> no benefit. Whatever you choose, use the **same region for all three services** —
> Cloud Run, Cloud SQL and the bucket — or you pay egress between them.

Placeholders used below, replace consistently:

| Placeholder | Example |
|---|---|
| `PROJECT_ID` | `cenrowatch-prod` |
| `REGION` | `asia-southeast1` |
| `INSTANCE` | `cenrowatch-db` |
| `BUCKET` | `cenrowatch-uploads-prod` |
| `DOMAIN` | `cenrowatch.cabuyao.gov.ph` |

---

## Part 0 — Fix these BEFORE you deploy anything

Four things in the current codebase will not survive contact with Cloud Run.
None is large; all are cheaper to fix now than to debug at 2 a.m.

### 0.1 `web/Dockerfile` runs the Vite **dev server**

```dockerfile
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

That is a development server: unminified, single-process, with HMR, and
explicitly not for production use. The web app must be `npm run build` and served
as static files (nginx, or Firebase Hosting / Cloud Storage + CDN). Do not deploy
this image as-is.

### 0.2 The GCS driver cannot use Cloud Run's built-in identity

`gcs.driver.js` requires `GCS_CREDENTIALS_JSON` or `GCS_KEY_FILE` and throws
without one. Cloud Run normally authenticates through its attached service
account (Application Default Credentials) with **no key file at all**, which is
the safer pattern — there is no long-lived key to leak.

Two options:

- **Ship as-is:** create a service-account JSON key, store it in Secret Manager,
  expose it as `GCS_CREDENTIALS_JSON`. Works today, no code change. But it is a
  permanent credential that must be rotated by hand.
- **Add ADC support (recommended):** let `buildClient()` fall back to
  `new Storage({ projectId })` with no credentials when neither variable is set.
  Then grant the Cloud Run service account **`roles/iam.serviceAccountTokenCreator`
  on itself** — without it, `getSignedUrl()` fails, because signing with ADC goes
  through the IAM SignBlob API rather than a local private key. This failure mode
  is easy to miss: uploads succeed, and only *viewing* a photo breaks.

### 0.3 `mobile/src/config.js` points at a LAN address

```js
export const API_URL = 'http://192.168.0.97:5000/api/v1';
```

This is baked into the APK at build time. It must become
`https://DOMAIN/api/v1` **and the APK rebuilt** — roughly 15 minutes. An APK
built before the domain exists will never reach production, and users cannot fix
it from inside the app.

### 0.4 Add production guards

Three settings fail silently rather than loudly when wrong. Make the server
refuse to boot in production if:

- `STORAGE_DRIVER` is not `gcs` — see 1 below
- `TRUST_PROXY` is unset — see 2 below
- `FIELD_ENCRYPTION_KEY` is unset — *already implemented*; keep it

**1. `STORAGE_DRIVER` defaults to `local`.** Cloud Run's filesystem is in-memory
and per-instance. Under the local driver an upload returns 200, the database row
is written, and the file is destroyed when the instance recycles — invisible to
every other instance in the meantime. There is no error at any point. This is the
single most dangerous misconfiguration available to you.

**2. `TRUST_PROXY` is unset.** Cloud Run always sits behind a load balancer, so
`req.ip` is the proxy for every request and **all of Cabuyao shares one
rate-limit bucket**. The first person to trip a limit 429s everyone. Set
`TRUST_PROXY=1`. Never `true` — that trusts a client-supplied `X-Forwarded-For`
and lets anyone spoof their way around the limits.

---

## Part 1 — Google Cloud project

Billing must be owned by **CENRO or Pamantasan ng Cabuyao**, not by a student.
A project on a personal card dies when that card expires or the student
graduates, and transferring billing afterwards is far harder than setting it up
correctly once.

```bash
gcloud auth login
gcloud projects create PROJECT_ID --name="CENROWATCH"
gcloud config set project PROJECT_ID

# Link the CLIENT's billing account
gcloud billing projects link PROJECT_ID --billing-account=BILLING_ACCOUNT_ID

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  iamcredentials.googleapis.com
```

`iamcredentials` is the one people forget — it is what signs GCS URLs under ADC.

---

## Part 2 — Cloud SQL (MySQL 8)

```bash
gcloud sql instances create INSTANCE \
  --database-version=MYSQL_8_0 \
  --tier=db-f1-micro \
  --region=REGION \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup-start-time=18:00 \
  --enable-bin-log
```

`--backup-start-time=18:00` is UTC = **02:00 Manila**, outside office hours.
`--enable-bin-log` enables point-in-time recovery; without it your only restore
granularity is the nightly backup.

```bash
gcloud sql databases create cenrowatch_db --instance=INSTANCE
gcloud sql users create cenrowatch --instance=INSTANCE --password='<strong-password>'
```

Note the connection name — you need it below:

```bash
gcloud sql instances describe INSTANCE --format='value(connectionName)'
# -> PROJECT_ID:REGION:INSTANCE
```

**The `DATABASE_URL` for Cloud Run** connects over a unix socket, not TCP:

```
mysql://cenrowatch:PASSWORD@localhost/cenrowatch_db?socket=/cloudsql/PROJECT_ID:REGION:INSTANCE
```

---

## Part 3 — Cloud Storage bucket

```bash
gcloud storage buckets create gs://BUCKET \
  --location=REGION \
  --uniform-bucket-level-access \
  --public-access-prevention
```

Both flags matter. **Uniform bucket-level access** removes per-object ACLs so no
single upload can accidentally be made public. **Public access prevention** makes
"make this public" impossible even for a project owner who tries.

Objects are reached only through V4 signed URLs (1-hour TTL), which the app
already generates. Google encrypts every object with AES-256 at rest
automatically — this is what satisfies "encrypt uploaded photos", and it is the
reason no file-encryption code exists in the repo.

**Retention/lifecycle:** consider a lifecycle rule only after discussing it with
CENRO. Complaint photos are evidence; deleting them on a timer may conflict with
records-retention rules for a government office.

---

## Part 4 — Secrets

> ### Enter every value UNQUOTED
>
> `.env` contains `GCS_BUCKET_NAME="cenrowatch-uploads"` and dotenv strips those
> quotes. **Secret Manager does not.** A quoted value arrives as the literal
> string `"cenrowatch-uploads"`, quote marks included, and the failure is
> confusing — the bucket "does not exist" even though you are looking at it.
>
> This exact class of bug already cost this project once, with Docker's
> `env_file` (see `CLAUDE.md`). It is about to reappear wearing a different hat.

```bash
# Never echo a secret into shell history — pipe from a file or use --data-file=-
printf '%s' 'THE_VALUE' | gcloud secrets create jwt-secret --data-file=-
```

Create these:

| Secret | Value | Notes |
|---|---|---|
| `database-url` | the `mysql://...?socket=...` string from Part 2 | |
| `jwt-secret` | a **new** 32+ char random string | do NOT reuse the dev one |
| `field-encryption-key` | **the existing key** from `backend/.env` | see warning below |
| `email-user` | the CENRO mailbox address | |
| `email-pass` | its app password | |
| `gcs-credentials-json` | service-account key JSON | only if you skipped 0.2 |

> **`FIELD_ENCRYPTION_KEY` is not a fresh secret.** If production starts with a
> new key it cannot read anything encrypted under the old one. If you migrate
> development data into production, carry the **same key** across. If production
> starts genuinely empty, a new key is fine — decide deliberately, because it
> cannot be reversed later.

---

## Part 5 — Service account and IAM

```bash
gcloud iam service-accounts create cenrowatch-api --display-name="CENROWATCH API"
SA=cenrowatch-api@PROJECT_ID.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$SA" --role="roles/cloudsql.client"

gcloud storage buckets add-iam-policy-binding gs://BUCKET \
  --member="serviceAccount:$SA" --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"

# ONLY if you took the ADC route in 0.2 — required for getSignedUrl()
gcloud iam service-accounts add-iam-policy-binding $SA \
  --member="serviceAccount:$SA" --role="roles/iam.serviceAccountTokenCreator"
```

Grant `objectAdmin` **on the bucket**, not project-wide. Project-wide storage
admin would let a compromised API container read every bucket you ever create.

---

## Part 6 — Migrations run as their own step, not at boot

`backend/Dockerfile` currently ends with:

```dockerfile
CMD ["npm", "run", "start:docker"]   # migrate deploy && seed && start
```

That is right for a single Docker Compose container and wrong for Cloud Run. With
autoscaling, every cold start runs `migrate deploy` and `seed` again —
concurrently. Prisma takes an advisory lock so it is *usually* survivable, but
you are relying on luck, and reseeding on every instance start wastes cold-start
budget on the request that triggered it.

Change the production image to `CMD ["npm", "start"]` and run migrations as a
one-off Cloud Run **Job** before each deploy:

```bash
gcloud run jobs create cenrowatch-migrate \
  --image=REGION-docker.pkg.dev/PROJECT_ID/cenrowatch/api:TAG \
  --region=REGION \
  --service-account=$SA \
  --set-cloudsql-instances=PROJECT_ID:REGION:INSTANCE \
  --set-secrets=DATABASE_URL=database-url:latest \
  --command=npx --args=prisma,migrate,deploy

gcloud run jobs execute cenrowatch-migrate --region=REGION --wait
```

Run the seed **once**, by hand, on first deploy only. It is idempotent, but it
has no business running on every deployment.

> **Before every migration:** confirm the generated SQL uses **PascalCase** table
> names (`ALTER TABLE \`Complaint\``). Prisma generates them lowercase on the
> Windows dev machine and that SQL hard-fails on Linux. This has happened four
> times out of four. `npm test` catches it via `migrationCasing.test.js` — run the
> suite before you build the image.

---

## Part 7 — Deploy the API

```bash
gcloud artifacts repositories create cenrowatch --repository-format=docker --location=REGION

cd backend
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/cenrowatch/api:v1

gcloud run deploy cenrowatch-api \
  --image=REGION-docker.pkg.dev/PROJECT_ID/cenrowatch/api:v1 \
  --region=REGION \
  --service-account=$SA \
  --set-cloudsql-instances=PROJECT_ID:REGION:INSTANCE \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=4 \
  --memory=512Mi \
  --set-secrets=DATABASE_URL=database-url:latest,JWT_SECRET=jwt-secret:latest,FIELD_ENCRYPTION_KEY=field-encryption-key:latest,EMAIL_USER=email-user:latest,EMAIL_PASS=email-pass:latest \
  --set-env-vars=NODE_ENV=production,STORAGE_DRIVER=gcs,GCS_BUCKET_NAME=BUCKET,GCS_PROJECT_ID=PROJECT_ID,TRUST_PROXY=1,CLIENT_URL=https://DOMAIN,FILE_URL_TTL_MINUTES=60,APP_NAME=CENROWATCH,CITY=Cabuyao City,OFFICE=CENRO Cabuyao
```

`--allow-unauthenticated` is correct here — it means *Google IAM* does not gate
the endpoint. The app's own JWT and RBAC still apply to every route.

**`--min-instances=1`** is deliberate and worth its cost. At zero, the first
resident of the morning waits through a cold start *and* every in-memory rate
limit counter resets on each scale-to-zero.

**`--max-instances=4`** is also deliberate: rate limits use an in-memory store,
so each instance counts separately and the effective cap is
`instances × limit`. At 4 instances the login cap is 120 failed attempts per 15
minutes rather than 30 — acceptable; at 100 instances it is meaningless. If
traffic ever justifies more instances, move the limiter to a shared store
(Memorystore/Redis) first.

---

## Part 8 — First admin account

Public registration only ever creates Residents. Create the first Admin as a
one-off job, then **hand the password to CENRO and have them change it**:

```bash
gcloud run jobs create cenrowatch-admin \
  --image=REGION-docker.pkg.dev/PROJECT_ID/cenrowatch/api:v1 \
  --region=REGION --service-account=$SA \
  --set-cloudsql-instances=PROJECT_ID:REGION:INSTANCE \
  --set-secrets=DATABASE_URL=database-url:latest,FIELD_ENCRYPTION_KEY=field-encryption-key:latest \
  --set-env-vars=NEW_USER_EMAIL=admin@cabuyao.gov.ph,NEW_USER_PASSWORD=<temp>,NEW_USER_ROLE=Admin \
  --command=node --args=prisma/create-admin.js

gcloud run jobs execute cenrowatch-admin --region=REGION --wait
gcloud run jobs delete cenrowatch-admin --region=REGION   # don't leave a password in job config
```

---

## Part 9 — Web app

Build static, serve static. **Do not** deploy `web/Dockerfile` as written (0.1).

```bash
cd web
# VITE_* values are baked into the bundle at BUILD time, not read at runtime
VITE_API_URL=https://DOMAIN/api/v1 \
VITE_MAPTILER_API_KEY=<key> \
npm run build
# deploy dist/ to Firebase Hosting, or Cloud Storage + Cloud CDN, or nginx on Cloud Run
```

> **Restrict the MapTiler key to your domain** in the MapTiler dashboard. It ships
> inside the JavaScript bundle — that is unavoidable for a browser map — so
> anyone can read it. Domain restriction is what stops them spending your quota.

---

## Part 10 — Domain and TLS

```bash
gcloud beta run domain-mappings create --service=cenrowatch-api --domain=api.DOMAIN --region=REGION
```

Add the DNS records it prints. Google provisions and renews a managed
certificate automatically — there is no certificate to buy or remember to renew.

Then, **and only then**:

1. Set `CLIENT_URL` on Cloud Run to the final `https://` origin (CORS allows
   exactly this value).
2. Rebuild the web app with the final `VITE_API_URL`.
3. Rebuild the mobile APK with the final `API_URL` (0.3).
4. Enable HSTS in helmet now that a certificate exists.

---

## Part 11 — Post-deploy verification

Do not declare success on a green deploy log. Check the running system — this
project has a documented history of features that were correct in git and dead in
the environment.

| # | Check | Expected |
|---|---|---|
| 1 | `curl https://api.DOMAIN/api/health` | `200`, `"status":"ok"` |
| 2 | Register a test resident | Confirmation email **arrives** |
| 3 | File a complaint **with a photo** | Returns 201 |
| 4 | Open that complaint; check `photo_path` | Long `https://storage.googleapis.com/...` signed URL |
| 5 | Open the signed URL | Photo loads |
| 6 | Strip the query string; open again | **403** — if this returns the photo, uploads are public |
| 7 | `gcloud storage ls gs://BUCKET/complaints/` | The object is there (proves GCS, not ephemeral disk) |
| 8 | Restart the service, reopen the complaint | Photo still loads (**the local-driver trap**) |
| 9 | Admin → Users, search a name | Returns results (proves encryption boundary intact) |
| 10 | Admin → Users, view a contact number | Readable, not `enc:v1:...` |
| 11 | Log in from two different networks | Neither gets 429 (proves `TRUST_PROXY`) |
| 12 | Print a complaint PDF | Reporter name and address render |
| 13 | Mobile APK on mobile data (not Wi-Fi) | Reaches the API |

**Checks 6, 7 and 8 are the ones that matter most.** They are the difference
between "the demo worked" and "the system is actually configured correctly", and
each corresponds to a failure that produces no error message.

---

## Rollback

```bash
gcloud run revisions list --service=cenrowatch-api --region=REGION
gcloud run services update-traffic cenrowatch-api --to-revisions=REVISION=100 --region=REGION
```

Traffic moves in seconds. **A database migration does not roll back with it** —
Prisma has no down-migrations here. If a deploy includes a destructive migration,
take a Cloud SQL backup immediately before, and treat restoring it as the real
rollback plan.

---

## Running costs (verify current pricing — these are order-of-magnitude)

| Service | Configuration | Rough monthly |
|---|---|---|
| Cloud Run | `min-instances=1`, 512 Mi | the largest line; a warm instance bills continuously |
| Cloud SQL | `db-f1-micro`, 10 GB | second largest, billed 24/7 |
| Cloud Storage | a few GB of photos | cents |
| Secret Manager | 6 secrets | cents |
| Egress | low LGU traffic | small |

`min-instances=0` roughly halves the Cloud Run line at the cost of cold starts
and resetting rate-limit counters. Set a **billing budget alert** on the project
before handover, so an unexpected bill reaches CENRO as an email rather than as a
suspended service.

---

## Ongoing

- **Backups:** Cloud SQL automated backups are configured in Part 2. Verify a
  *restore* actually works before handover — an untested backup is a belief, not
  a backup.
- **Logs:** Cloud Logging captures morgan output. It will contain request paths;
  it should not contain personal data. Check before relying on it.
- **Uptime check:** point one at `/api/health` and alert to a CENRO address, not
  a student's.
- **`FIELD_ENCRYPTION_KEY`:** see `HANDOVER.md`. This is the one secret with no
  recovery path.
