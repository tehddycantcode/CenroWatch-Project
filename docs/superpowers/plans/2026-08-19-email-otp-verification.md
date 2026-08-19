# Email OTP Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A resident who mistypes their email at registration is told, and can correct it themselves, instead of being locked out of their account forever.

**Architecture:** Soft gate. Registration still returns a JWT and the account is fully usable, but a six-digit code is mailed and the account carries `email_verified_at = null` until it is entered. Password reset refuses an unverified address. An unverified resident can change their own address, which mints a fresh code bound to the new address. Verification state travels to both clients as one new field on the existing user object, so a banner can render from data both clients already fetch.

**Tech Stack:** Node.js 24 + Express 5 + Prisma 6 + MySQL 8 (backend); React 18 + Vite 5 + Tailwind (web); React Native 0.85 + Expo SDK 56 (mobile). One new dev dependency: Jest, the backend's first test framework.

**Spec:** `docs/superpowers/specs/2026-08-19-email-otp-verification-design.md`

## Global Constraints

- **PATH prefix.** Every node/npm command in a fresh PowerShell needs this first: `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`
- **Stop the backend before any `prisma migrate` or `prisma generate`.** A running `node src/server.js` locks the query-engine DLL on Windows and generation fails with EPERM.
- **Prisma stays on v6.** Do not bump. v7 removes `url` from the datasource block and breaks this schema.
- **Every mutation writes an AuditLog.** Actions used here: `EMAIL_VERIFY_SENT`, `EMAIL_VERIFIED`, `EMAIL_CHANGE_UNVERIFIED`, `PASSWORD_RESET_UNVERIFIED`.
- **The code is never written to an AuditLog, and never logged when mail is configured.**
- **All DB access through Prisma.** No raw SQL except inside the generated migration file.
- **ASCII-only source edits.** Match surrounding comment density and style.
- **Constants, exact:** `CODE_TTL_MINUTES = 10`, `RESEND_COOLDOWN_SECONDS = 60`, `MAX_ATTEMPTS = 5`.
- **One wrong-code message covers wrong, expired, and missing:** `That code is not valid. Request a new one and try again.` Never reveal which.
- **Tagalog strings go in BOTH** `web/src/lib/tagalog.js` and `mobile/src/lib/tagalog.js`, byte-identical below the header comment. Verify with: `diff <(sed -n '/^export const STAGE_TL/,$p' web/src/lib/tagalog.js) <(sed -n '/^export const STAGE_TL/,$p' mobile/src/lib/tagalog.js)`
- **`/auth` is rate-limited to 10 requests per 15 min per IP.** Keep manual verification to the minimum number of calls; do not loop.
- **Do not stage** `uploads/`, `dist/`, `.agents/`, `.claude/`, `skills-lock.json`, or throwaway `_*.mjs` scripts. Run `git status` before every commit.
- **No `Co-Authored-By` trailer on commits.**

---

### Task 1: Schema, migration, and backfill

**Files:**
- Modify: `backend/prisma/schema.prisma` (the `User` model, and a new model after `PasswordResetToken`)
- Create: `backend/prisma/migrations/<timestamp>_email_verification/migration.sql` (generated)

**Interfaces:**
- Produces: `User.email_verified_at` (`DateTime?`) and the `EmailVerificationToken` model with fields `id`, `user_id`, `code_hash`, `email`, `expires_at`, `used_at`, `attempts`, `created_at`. Every later task depends on these exact names.

- [ ] **Step 1: Stop the backend**

If a dev server is running, stop it. On Windows a live `node src/server.js` locks the Prisma query-engine DLL and `migrate` fails with EPERM.

- [ ] **Step 2: Add the field to `User`**

In `backend/prisma/schema.prisma`, in the `User` model, directly below the `privacy_consent`/`consent_date` pair and above `created_at`, add:

```prisma
  email_verified_at DateTime?
```

- [ ] **Step 3: Add the relation to `User`**

In the same model, in the relations block, directly below the `password_reset_tokens` line, add:

```prisma
  email_verification_tokens EmailVerificationToken[]
```

- [ ] **Step 4: Add the new model**

Directly below the closing brace of `model PasswordResetToken`, add:

```prisma
// Six-digit email-confirmation codes. Mirrors PasswordResetToken, with two
// deliberate differences: code_hash is NOT unique (a six-digit code has only
// 10^6 values, so two users would eventually collide and a unique constraint
// would reject a legitimate code - lookup is by user_id instead), and the
// target address is stored, so a code mailed to an old address can never
// confirm a new one after the user corrects a typo.
model EmailVerificationToken {
  id         Int       @id @default(autoincrement())
  user_id    Int
  code_hash  String    @db.VarChar(64) // sha256 hex
  email      String    @db.VarChar(255)
  expires_at DateTime
  used_at    DateTime?
  attempts   Int       @default(0)
  created_at DateTime  @default(now())

  user User @relation(fields: [user_id], references: [user_id])

  @@index([user_id])
}
```

- [ ] **Step 5: Generate the migration WITHOUT applying it**

`--create-only` writes the SQL but does not run it, so the backfill can be added
before it ever touches the database. Applying first and rolling back is the
messy path — do not do that.

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend
npx prisma migrate dev --create-only --name email_verification
```

Expected: a new `prisma/migrations/<timestamp>_email_verification/migration.sql`, and the message that it was created but not applied.

- [ ] **Step 6: Add the backfill to the generated migration**

Open the new `migration.sql` and append this at the very end:

```sql
-- Accounts that predate email verification are treated as confirmed. They were
-- never asked, and leaving them unverified would remove password reset from
-- working accounts, including the seeded test residents. Only accounts created
-- after this migration start null.
UPDATE `User` SET `email_verified_at` = `created_at` WHERE `email_verified_at` IS NULL;
```

- [ ] **Step 7: Apply it**

```powershell
npx prisma migrate dev
```

Expected: the pending migration is applied and the Prisma client regenerates.

- [ ] **Step 8: Verify the backfill**

Create `backend/_check-verify.mjs`:

```js
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const total = await prisma.user.count();
const unverified = await prisma.user.count({ where: { email_verified_at: null } });
console.log(`users=${total} unverified=${unverified} (expect unverified=0)`);
await prisma.$disconnect();
```

Run it, confirm `unverified=0`, then delete the file:

```powershell
node _check-verify.mjs
Remove-Item _check-verify.mjs -Force
```

- [ ] **Step 9: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "Schema: email verification tokens and User.email_verified_at"
```

---

### Task 2: Jest setup and sendVerificationCode

**Files:**
- Modify: `backend/package.json` (devDependencies + scripts + jest config)
- Create: `backend/src/services/emailVerification.service.js`
- Create: `backend/tests/emailVerification.service.test.js`
- Modify: `backend/src/utils/notify.js` (add `notifyEmailVerification`)

**Interfaces:**
- Consumes: `User.email_verified_at` and the `EmailVerificationToken` model from Task 1.
- Produces: `sendVerificationCode(userId, ctx)` returning `{ ok: true }`; module-level constants `CODE_TTL_MINUTES`, `RESEND_COOLDOWN_SECONDS`, `MAX_ATTEMPTS` exported for the tests; `notifyEmailVerification({ to, name, code })` in `notify.js`. Tasks 3 and 4 add `verifyCode` and `changeUnverifiedEmail` to the same service file.

- [ ] **Step 1: Install Jest**

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend
npm install --save-dev jest
```

- [ ] **Step 2: Configure Jest**

In `backend/package.json`, add `"test": "jest"` to `scripts`, and add this top-level key after `scripts`:

```json
  "jest": {
    "testEnvironment": "node",
    "testMatch": ["**/tests/**/*.test.js"]
  },
```

- [ ] **Step 3: Add the verification email**

In `backend/src/utils/notify.js`, directly above the final `module.exports` line, add:

```js
/**
 * Email a six-digit confirmation code. Never throws. The code is only ever
 * sent here - the DB stores its hash - and it expires in 10 minutes.
 * @param {Object} p
 * @param {string} p.to    recipient email
 * @param {string} p.name  recipient first name
 * @param {string} p.code  the six-digit code
 */
function notifyEmailVerification({ to, name, code }) {
  const subject = '[CENROWATCH] Your confirmation code';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#0f3d1f">
      <h2 style="color:#22a050;margin-bottom:4px">CENROWATCH</h2>
      <p style="color:#66756e;margin-top:0">CENRO Cabuyao &middot; Environmental Monitoring</p>
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>Use this code to confirm your email address:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0f3d1f">${escapeHtml(code)}</p>
      <p>The code expires in 10 minutes. CENRO sends your report updates to this
         address, so confirming it is what lets us reach you.</p>
      <p style="color:#66756e;font-size:12px;margin-top:24px">
        If you did not create a CENROWATCH account, you can ignore this email.
      </p>
    </div>`;

  const text = `CENROWATCH\n\nHi ${name || 'there'},\n\nYour confirmation code is: ${code}\n\nThe code expires in 10 minutes.\n\nIf you did not create a CENROWATCH account, you can ignore this email.`;

  return sendMail({ to, subject, html, text });
}
```

Then change the export line to:

```js
module.exports = { notifyReportStatus, notifyPasswordReset, notifyPasswordResetUnavailable, notifyEmailVerification };
```

- [ ] **Step 4: Write the failing tests**

Create `backend/tests/emailVerification.service.test.js`:

```js
// Unit tests for the verification service. Prisma, mail and audit are mocked:
// the logic is what carries risk here, and mocking keeps the suite runnable
// without a database.
const crypto = require('crypto');

jest.mock('../src/utils/prisma', () => ({
  user: { findUnique: jest.fn(), update: jest.fn() },
  emailVerificationToken: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(async (ops) => ops),
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyEmailVerification: jest.fn() }));
jest.mock('../src/utils/mailer', () => ({ isConfigured: () => true }));

const prisma = require('../src/utils/prisma');
const { notifyEmailVerification } = require('../src/utils/notify');
const service = require('../src/services/emailVerification.service');

const UNVERIFIED_USER = {
  user_id: 1,
  email: 'juan@example.com',
  first_name: 'Juan',
  email_verified_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
  prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
  prisma.emailVerificationToken.create.mockResolvedValue({});
});

describe('sendVerificationCode', () => {
  test('mints a six-digit code, stores only its hash, and mails the code', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    jest.spyOn(crypto, 'randomInt').mockReturnValue(418203);

    await service.sendVerificationCode(1);

    const stored = prisma.emailVerificationToken.create.mock.calls[0][0].data;
    expect(stored.code_hash).toBe(
      crypto.createHash('sha256').update('418203').digest('hex')
    );
    expect(stored.email).toBe('juan@example.com');
    // The raw code must never be persisted. Asserted on the field, not by
    // substring-searching the hex digest - a fixed digest either contains
    // those six characters or does not, and that is luck, not a test.
    expect(stored.code).toBeUndefined();
    expect(stored.code_hash).not.toBe('418203');
    expect(notifyEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan@example.com', code: '418203' })
    );

    crypto.randomInt.mockRestore();
  });

  test('pads a small random value to six digits', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    jest.spyOn(crypto, 'randomInt').mockReturnValue(42);

    await service.sendVerificationCode(1);

    expect(notifyEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ code: '000042' })
    );
    crypto.randomInt.mockRestore();
  });

  test('refuses a resend inside the cooldown', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    prisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: 9,
      created_at: new Date(Date.now() - 10 * 1000), // 10s ago, cooldown is 60s
    });

    await expect(service.sendVerificationCode(1)).rejects.toMatchObject({ statusCode: 429 });
    expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
  });

  test('allows a resend once the cooldown has passed', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    prisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: 9,
      created_at: new Date(Date.now() - 61 * 1000),
    });

    await service.sendVerificationCode(1);
    expect(prisma.emailVerificationToken.create).toHaveBeenCalled();
  });

  test('refuses when the address is already confirmed', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...UNVERIFIED_USER, email_verified_at: new Date() });
    await expect(service.sendVerificationCode(1)).rejects.toMatchObject({ statusCode: 409 });
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

```powershell
npm test
```

Expected: FAIL — `Cannot find module '../src/services/emailVerification.service'`.

- [ ] **Step 6: Write the implementation**

Create `backend/src/services/emailVerification.service.js`:

```js
// Email confirmation codes for resident self-registration.
//
// Soft gate by design: an unverified account works normally. Verification is
// enforced only where its absence causes real harm - password reset, which
// would otherwise mail a link to an address the owner cannot read.
//
// The stored sha256 is defence in depth, NOT the control. A six-digit code has
// only 10^6 values and is brute-forceable offline in seconds if the database
// leaks. What actually protects it is the 10-minute TTL, single use, and the
// 5-attempt cap.

const crypto = require('crypto');
const prisma = require('../utils/prisma');
const { writeAuditLog } = require('../utils/audit');
const { notifyEmailVerification } = require('../utils/notify');
const { isConfigured } = require('../utils/mailer');
const HttpError = require('../utils/httpError');

const CODE_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// crypto.randomInt, not Math.random - this is a credential.
// Called as a property (not destructured) so tests can spy on it.
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

/**
 * Mint a code, store its hash against the user's CURRENT address, and mail it.
 * Any unused code is discarded first, so only the newest one ever works.
 * ctx.bypassCooldown is set by changeUnverifiedEmail: a brand-new address has
 * received nothing yet, so making someone who just fixed a typo wait 60
 * seconds would punish the exact recovery this exists for.
 */
async function sendVerificationCode(userId, ctx = {}) {
  const user = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!user) throw new HttpError(404, 'User not found.');
  if (user.email_verified_at) {
    throw new HttpError(409, 'This email address is already confirmed.');
  }

  if (!ctx.bypassCooldown) {
    const newest = await prisma.emailVerificationToken.findFirst({
      where: { user_id: userId, used_at: null },
      orderBy: { created_at: 'desc' },
    });
    if (newest) {
      const elapsed = (Date.now() - new Date(newest.created_at).getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed);
        throw new HttpError(429, `Please wait ${wait} seconds before asking for another code.`);
      }
    }
  }

  await prisma.emailVerificationToken.deleteMany({ where: { user_id: userId, used_at: null } });

  const code = generateCode();
  await prisma.emailVerificationToken.create({
    data: {
      user_id: userId,
      code_hash: hashCode(code),
      email: user.email,
      expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
    },
  });

  // Without this a fresh `docker compose up` mints accounts nobody can confirm,
  // because sendMail quietly no-ops when credentials are absent. Never logged
  // when mail IS configured.
  if (!isConfigured()) {
    console.log(`[verify] mail disabled - code for ${user.email} is ${code}`);
  }

  await notifyEmailVerification({ to: user.email, name: user.first_name, code });

  await writeAuditLog({
    performedBy: userId,
    action: 'EMAIL_VERIFY_SENT',
    targetTable: 'User',
    targetId: userId,
    data: {}, // never the code
    ipAddress: ctx.ipAddress || null,
  });

  return { ok: true };
}

module.exports = {
  sendVerificationCode,
  CODE_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  MAX_ATTEMPTS,
};
```

- [ ] **Step 7: Run the tests to verify they pass**

```powershell
npm test
```

Expected: PASS, 5 tests.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/emailVerification.service.js backend/src/utils/notify.js backend/tests
git commit -m "Verification: mint and mail six-digit codes, with the backend's first tests"
```

---

### Task 3: verifyCode

**Files:**
- Modify: `backend/src/services/emailVerification.service.js`
- Modify: `backend/tests/emailVerification.service.test.js`

**Interfaces:**
- Consumes: `hashCode`, `MAX_ATTEMPTS` from Task 2.
- Produces: `verifyCode(userId, code, ctx)` returning `{ ok: true }`, throwing `HttpError(400)` for any invalid code and `HttpError(429)` past the attempt cap.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/emailVerification.service.test.js`:

```js
describe('verifyCode', () => {
  const CODE = '418203';
  const hashOf = (c) => crypto.createHash('sha256').update(c).digest('hex');

  function tokenFor(overrides = {}) {
    return {
      id: 7,
      user_id: 1,
      code_hash: hashOf(CODE),
      email: 'juan@example.com',
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
      used_at: null,
      attempts: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    prisma.emailVerificationToken.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});
  });

  test('accepts the correct code and stamps email_verified_at', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor());

    await expect(service.verifyCode(1, CODE)).resolves.toMatchObject({ ok: true });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 1 },
        data: { email_verified_at: expect.any(Date) },
      })
    );
  });

  test('rejects a wrong code and does NOT verify', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor());

    await expect(service.verifyCode(1, '000000')).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('rejects an expired code', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(
      tokenFor({ expires_at: new Date(Date.now() - 1000) })
    );

    await expect(service.verifyCode(1, CODE)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('rejects a code minted for a different address', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(
      tokenFor({ email: 'jaun@example.com' })
    );

    await expect(service.verifyCode(1, CODE)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('rejects once past the attempt cap, without comparing', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor({ attempts: 5 }));

    await expect(service.verifyCode(1, CODE)).rejects.toMatchObject({ statusCode: 429 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('counts the attempt BEFORE comparing, so a wrong code always costs one', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor());

    await expect(service.verifyCode(1, '999999')).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { attempts: { increment: 1 } },
    });
  });

  test('reports the same message for wrong, expired, and missing', async () => {
    const messages = [];

    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor());
    await service.verifyCode(1, '111111').catch((e) => messages.push(e.message));

    prisma.emailVerificationToken.findFirst.mockResolvedValue(
      tokenFor({ expires_at: new Date(Date.now() - 1000) })
    );
    await service.verifyCode(1, CODE).catch((e) => messages.push(e.message));

    prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
    await service.verifyCode(1, CODE).catch((e) => messages.push(e.message));

    expect(new Set(messages).size).toBe(1);
  });

  test('is a no-op when the address is already confirmed', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...UNVERIFIED_USER, email_verified_at: new Date() });

    await expect(service.verifyCode(1, CODE)).resolves.toMatchObject({ ok: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
npm test
```

Expected: FAIL — `service.verifyCode is not a function`.

- [ ] **Step 3: Write the implementation**

In `backend/src/services/emailVerification.service.js`, add above `module.exports`:

```js
// Constant-time compare of two hex digests. With a 5-attempt cap a timing
// attack is already impractical; this simply removes the question.
function hashesEqual(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// One message for wrong, expired, and missing. Telling them apart would say
// whether a live code exists, which is the same reason login uses a single
// message for a bad email and a bad password.
const INVALID_CODE = 'That code is not valid. Request a new one and try again.';

/**
 * Confirm the address with a code. Idempotent: verifying an already-confirmed
 * account succeeds without touching anything.
 */
async function verifyCode(userId, code, ctx = {}) {
  const user = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!user) throw new HttpError(404, 'User not found.');
  if (user.email_verified_at) return { ok: true, already: true };

  const token = await prisma.emailVerificationToken.findFirst({
    where: { user_id: userId, used_at: null },
    orderBy: { created_at: 'desc' },
  });
  if (!token) throw new HttpError(400, INVALID_CODE);

  if (token.attempts >= MAX_ATTEMPTS) {
    throw new HttpError(429, 'Too many incorrect attempts. Ask for a new code.');
  }

  // Spend the attempt BEFORE comparing. Otherwise a dropped connection mid
  // verify would hand back a free retry.
  await prisma.emailVerificationToken.update({
    where: { id: token.id },
    data: { attempts: { increment: 1 } },
  });

  if (token.expires_at < new Date()) throw new HttpError(400, INVALID_CODE);
  // The address moved after this code was sent: the old code must not confirm
  // the new address.
  if (token.email !== user.email) throw new HttpError(400, INVALID_CODE);
  if (!hashesEqual(hashCode(code), token.code_hash)) throw new HttpError(400, INVALID_CODE);

  await prisma.$transaction([
    prisma.user.update({
      where: { user_id: userId },
      data: { email_verified_at: new Date() },
    }),
    prisma.emailVerificationToken.update({
      where: { id: token.id },
      data: { used_at: new Date() },
    }),
    prisma.emailVerificationToken.deleteMany({ where: { user_id: userId, used_at: null } }),
  ]);

  await writeAuditLog({
    performedBy: userId,
    action: 'EMAIL_VERIFIED',
    targetTable: 'User',
    targetId: userId,
    data: { email: user.email },
    ipAddress: ctx.ipAddress || null,
  });

  return { ok: true };
}
```

Then add `verifyCode` to the `module.exports` object.

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
npm test
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/emailVerification.service.js backend/tests/emailVerification.service.test.js
git commit -m "Verification: confirm a code, spending the attempt before comparing"
```

---

### Task 4: changeUnverifiedEmail

**Files:**
- Modify: `backend/src/services/emailVerification.service.js`
- Modify: `backend/tests/emailVerification.service.test.js`

**Interfaces:**
- Consumes: `sendVerificationCode` from Task 2.
- Produces: `changeUnverifiedEmail(userId, email, ctx)` returning `{ ok: true }`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/emailVerification.service.test.js`:

```js
describe('changeUnverifiedEmail', () => {
  beforeEach(() => {
    prisma.user.update.mockResolvedValue({});
  });

  test('updates the address and mails a code to the NEW one', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(UNVERIFIED_USER)              // the caller
      .mockResolvedValueOnce(null)                          // new address is free
      .mockResolvedValueOnce({ ...UNVERIFIED_USER, email: 'juan.fixed@example.com' }); // reload inside send

    await service.changeUnverifiedEmail(1, 'juan.fixed@example.com');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 1 },
        data: { email: 'juan.fixed@example.com' },
      })
    );
    expect(notifyEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan.fixed@example.com' })
    );
  });

  test('binds the new code to the new address', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(UNVERIFIED_USER)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...UNVERIFIED_USER, email: 'juan.fixed@example.com' });

    await service.changeUnverifiedEmail(1, 'juan.fixed@example.com');

    const stored = prisma.emailVerificationToken.create.mock.calls[0][0].data;
    expect(stored.email).toBe('juan.fixed@example.com');
  });

  test('ignores the resend cooldown, so a corrected typo is not made to wait', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(UNVERIFIED_USER)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...UNVERIFIED_USER, email: 'juan.fixed@example.com' });
    // A code was sent seconds ago; this must NOT block the change.
    prisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: 9,
      created_at: new Date(),
    });

    await expect(
      service.changeUnverifiedEmail(1, 'juan.fixed@example.com')
    ).resolves.toMatchObject({ ok: true });
    expect(prisma.emailVerificationToken.create).toHaveBeenCalled();
  });

  test('refuses when the address is already confirmed', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      ...UNVERIFIED_USER,
      email_verified_at: new Date(),
    });

    await expect(
      service.changeUnverifiedEmail(1, 'juan.fixed@example.com')
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('refuses an address that belongs to another account', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(UNVERIFIED_USER)
      .mockResolvedValueOnce({ user_id: 2, email: 'taken@example.com' });

    await expect(
      service.changeUnverifiedEmail(1, 'taken@example.com')
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```powershell
npm test
```

Expected: FAIL — `service.changeUnverifiedEmail is not a function`.

- [ ] **Step 3: Write the implementation**

Add above `module.exports`:

```js
/**
 * Correct the address on an unverified account. This is what closes the gap
 * the feature exists for: without it a mistyped address is detected but still
 * unreachable, because updateProfile excludes email and no admin field edits
 * it either. Once verified, the address locks again.
 */
async function changeUnverifiedEmail(userId, email, ctx = {}) {
  const user = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!user) throw new HttpError(404, 'User not found.');
  if (user.email_verified_at) {
    throw new HttpError(409, 'Your email address is already confirmed and cannot be changed here.');
  }
  if (email === user.email) {
    throw new HttpError(422, 'That is already the address on this account.');
  }

  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken) throw new HttpError(409, 'An account with this email already exists.');

  await prisma.user.update({ where: { user_id: userId }, data: { email } });

  await writeAuditLog({
    performedBy: userId,
    action: 'EMAIL_CHANGE_UNVERIFIED',
    targetTable: 'User',
    targetId: userId,
    data: { from: user.email, to: email },
    ipAddress: ctx.ipAddress || null,
  });

  // Fresh code, bound to the new address. sendVerificationCode discards the
  // old one, and the cooldown is bypassed because the new mailbox has had
  // nothing from us yet.
  await sendVerificationCode(userId, { ...ctx, bypassCooldown: true });

  return { ok: true };
}
```

Then add `changeUnverifiedEmail` to `module.exports`.

- [ ] **Step 4: Run the tests to verify they pass**

```powershell
npm test
```

Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/emailVerification.service.js backend/tests/emailVerification.service.test.js
git commit -m "Verification: let an unverified resident correct their own address"
```

---

### Task 5: Validators, controller, routes

**Files:**
- Modify: `backend/src/validators/auth.validators.js`
- Modify: `backend/src/controllers/auth.controller.js`
- Modify: `backend/src/routes/auth.routes.js`

**Interfaces:**
- Consumes: `sendVerificationCode`, `verifyCode`, `changeUnverifiedEmail` from Tasks 2-4.
- Produces: `POST /api/v1/auth/verify-email`, `POST /api/v1/auth/resend-verification`, `PATCH /api/v1/auth/email`. All authenticated. Tasks 8 and 9 call these exact paths.

- [ ] **Step 1: Add the validators**

In `backend/src/validators/auth.validators.js`, above the final `module.exports`, add:

```js
const verifyEmailRules = [
  body('code')
    .trim()
    .notEmpty().withMessage('Enter the code from your email.')
    .bail()
    .isLength({ min: 6, max: 6 }).withMessage('The code is 6 digits.')
    .isNumeric().withMessage('The code is 6 digits.'),
];

// Mirrors registerRules so the same address normalizes to the same string on
// both paths - otherwise a change could create an address that login cannot
// match.
const changeEmailRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('A valid email is required.')
    .normalizeEmail(),
];
```

Add `verifyEmailRules` and `changeEmailRules` to the exported object.

- [ ] **Step 2: Add the controllers**

In `backend/src/controllers/auth.controller.js`, add after `changePassword` and before `forgotPassword`:

```js
const verificationService = require('../services/emailVerification.service');

// All three require `authenticate`: the soft gate means the resident is
// already signed in while their address is still unconfirmed.
const verifyEmail = asyncHandler(async (req, res) => {
  await verificationService.verifyCode(req.user.user_id, req.body.code, { ipAddress: req.ip });
  const user = await authService.getProfile(req.user.user_id);
  res.status(200).json({ success: true, message: 'Your email address is confirmed.', data: { user } });
});

const resendVerification = asyncHandler(async (req, res) => {
  await verificationService.sendVerificationCode(req.user.user_id, { ipAddress: req.ip });
  res.status(200).json({ success: true, message: 'A new code is on its way.' });
});

const changeEmail = asyncHandler(async (req, res) => {
  await verificationService.changeUnverifiedEmail(req.user.user_id, req.body.email, { ipAddress: req.ip });
  const user = await authService.getProfile(req.user.user_id);
  res.status(200).json({ success: true, message: 'Address updated. Check it for a new code.', data: { user } });
});
```

Move the `require` to the top of the file with the other requires. Add the three names to `module.exports`.

- [ ] **Step 3: Add the routes**

In `backend/src/routes/auth.routes.js`, import `verifyEmailRules` and `changeEmailRules` in the destructured validator import, then add below the `change-password` line:

```js
router.post('/verify-email', authenticate, verifyEmailRules, validate, authController.verifyEmail);
router.post('/resend-verification', authenticate, authController.resendVerification);
router.patch('/email', authenticate, changeEmailRules, validate, authController.changeEmail);
```

- [ ] **Step 4: Verify the server still boots**

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd backend
node -e "require('./src/app.js'); console.log('app loads OK')"
```

Expected: `app loads OK`. A route-ordering or import mistake throws here.

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/auth.validators.js backend/src/controllers/auth.controller.js backend/src/routes/auth.routes.js
git commit -m "Verification: three authenticated endpoints for confirm, resend and correct"
```

---

### Task 6: Registration sends the code; admin-created accounts are pre-verified

**Files:**
- Modify: `backend/src/services/auth.service.js`
- Modify: `backend/src/services/admin.user.service.js`

**Interfaces:**
- Consumes: `sendVerificationCode` from Task 2.
- Produces: `PUBLIC_USER_FIELDS` gains `email_verified_at`, so `/auth/me`, `/auth/register` and `/auth/login` all return it. Tasks 8 and 9 read `user.email_verified_at` from these responses.

- [ ] **Step 1: Expose the field**

In `backend/src/services/auth.service.js`, in `PUBLIC_USER_FIELDS`, add below `privacy_consent: true,`:

```js
  email_verified_at: true,
```

- [ ] **Step 2: Send the code on registration**

At the top of the file, add:

```js
const { sendVerificationCode } = require('./emailVerification.service');
```

In `register()`, directly after the `writeAuditLog` call and before `return`, add:

```js
  // Mail the confirmation code. Deliberately swallowed: the account exists
  // either way, the resident can use Resend, and a mail outage must not turn
  // a successful registration into an error.
  try {
    await sendVerificationCode(user.user_id, ctx);
  } catch (err) {
    console.error(`[register] could not send verification code: ${err.message}`);
  }
```

- [ ] **Step 3: Pre-verify admin-created accounts**

In `backend/src/services/admin.user.service.js`, in `createUser`'s `prisma.user.create` data block, add below `consent_date: new Date(),`:

```js
      // An Admin typed this address and set the password, so there is nothing
      // to confirm. Leaving it null would lock a new staff member out of
      // password reset on their first day.
      email_verified_at: new Date(),
```

- [ ] **Step 4: Expose the field to the Admin user list**

In the same file, add to `SAFE_FIELDS`:

```js
  email_verified_at: true,
```

The Admin user list is the only place staff can see which residents are
reachable by email, which matters when a report's owner is not responding.

- [ ] **Step 5: Verify the tests and the app still load**

```powershell
cd backend
npm test
node -e "require('./src/app.js'); console.log('app loads OK')"
```

Expected: 18 tests PASS, then `app loads OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/auth.service.js backend/src/services/admin.user.service.js
git commit -m "Verification: send a code on registration; admin-made accounts start confirmed"
```

---

### Task 7: Password reset refuses an unverified address

**Files:**
- Modify: `backend/src/services/auth.service.js` (`requestPasswordReset`)
- Modify: `backend/src/utils/notify.js` (`notifyPasswordResetUnavailable`)

**Interfaces:**
- Consumes: `User.email_verified_at` from Task 1.
- Produces: `notifyPasswordResetUnavailable({ to, reason })` now accepts `reason === 'unverified'`.

- [ ] **Step 1: Add the branch**

In `backend/src/services/auth.service.js`, change the opening condition of `requestPasswordReset` from:

```js
  if (user && user.is_active) {
```

to:

```js
  // Deactivated takes precedence over unverified: it is the harder block, and
  // sending someone to confirm an address that still will not let them reset
  // would waste their time.
  if (user && user.is_active && user.email_verified_at) {
```

- [ ] **Step 2: Pick the reason in the else branch**

In the same function's `else` branch, replace the `action:` and the `notifyPasswordResetUnavailable` call with:

```js
    const reason = !user ? 'no_account' : !user.is_active ? 'inactive' : 'unverified';
    const action =
      reason === 'no_account'
        ? 'PASSWORD_RESET_UNKNOWN_EMAIL'
        : reason === 'inactive'
          ? 'PASSWORD_RESET_INACTIVE'
          : 'PASSWORD_RESET_UNVERIFIED';

    await writeAuditLog({
      performedBy: user ? user.user_id : null,
      action,
      targetTable: 'User',
      targetId: user ? user.user_id : null,
      data: {},
      ipAddress: ctx.ipAddress || null,
    });

    await notifyPasswordResetUnavailable({ to: email, reason });
```

- [ ] **Step 3: Add the copy**

In `backend/src/utils/notify.js`, inside `notifyPasswordResetUnavailable`, replace the `inactive` boolean and the two ternaries with a three-way. Add above `const subject`:

```js
  const unverified = reason === 'unverified';
```

Change `subject` to:

```js
  const subject = unverified
    ? '[CENROWATCH] Confirm your email before resetting your password'
    : inactive
      ? '[CENROWATCH] We could not reset your password'
      : '[CENROWATCH] No CENROWATCH account uses this email';
```

Replace the whole `body` assignment with this three-way (the `inactive` and
no-account branches are the existing text, unchanged):

```js
  const body = unverified
    ? `<p>We received a request to reset the CENROWATCH password for this email address.</p>
       <p>This address has not been confirmed yet, so we cannot send a reset link to it. Sign in and enter the confirmation code we emailed you, then try again.</p>
       <p><a href="${base}/login" style="display:inline-block;background:#22a050;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Sign in</a></p>`
    : inactive
      ? `<p>We received a request to reset the CENROWATCH password for this email address.</p>
         <p>The account is registered, but it is currently inactive, so its password cannot be reset here. Please contact CENRO Cabuyao to have the account restored.</p>`
      : `<p>We received a request to reset a CENROWATCH password for this email address.</p>
         <p><strong>There is no CENROWATCH account registered with it</strong>, so there is nothing to reset. You may have signed up with a different email address.</p>
         <p><a href="${base}/register" style="display:inline-block;background:#22a050;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Create an account</a></p>`;
```

Replace the whole `text` assignment with the matching three-way:

```js
  const text = unverified
    ? `CENROWATCH Password reset\n\nWe received a request to reset the CENROWATCH password for this email address.\n\nThis address has not been confirmed yet, so we cannot send a reset link to it. Sign in and enter the confirmation code we emailed you, then try again.\n\nSign in: ${base}/login\n\nIf you did not request this, ignore this email. No account was created or changed.`
    : inactive
      ? `CENROWATCH Password reset\n\nWe received a request to reset the CENROWATCH password for this email address.\n\nThe account is registered, but it is currently inactive, so its password cannot be reset here. Please contact CENRO Cabuyao to have the account restored.\n\nIf you did not request this, ignore this email. No account was created or changed.`
      : `CENROWATCH Password reset\n\nWe received a request to reset a CENROWATCH password for this email address.\n\nThere is no CENROWATCH account registered with it, so there is nothing to reset. You may have signed up with a different email address.\n\nCreate an account: ${base}/register\n\nIf you did not request this, ignore this email. No account was created or changed.`;
```

- [ ] **Step 4: Verify the app loads and tests pass**

```powershell
cd backend
npm test
node -e "require('./src/app.js'); console.log('app loads OK')"
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/auth.service.js backend/src/utils/notify.js
git commit -m "Password reset: refuse an unverified address and say why by email"
```

---

### Task 8: Web verify banner

**Files:**
- Modify: `web/src/lib/api.js` (the `authApi` object, lines 105-113)
- Create: `web/src/components/resident/VerifyEmailBanner.jsx`
- Modify: `web/src/components/resident/ResidentLayout.jsx`
- Modify: `web/src/lib/tagalog.js`

**Interfaces:**
- Consumes: the three endpoints from Task 5 and `user.email_verified_at` from Task 6.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Add the API calls**

In `web/src/lib/api.js`, inside `authApi`, below the `resetPassword` line, add:

```js
  verifyEmail: (code) => apiFetch('/auth/verify-email', { method: 'POST', body: { code } }),
  resendVerification: () => apiFetch('/auth/resend-verification', { method: 'POST' }),
  changeEmail: (email) => apiFetch('/auth/email', { method: 'PATCH', body: { email } }),
```

- [ ] **Step 2: Add the Tagalog strings**

In `web/src/lib/tagalog.js`, inside `COPY_TL`, below the `notifications` / `noNotifications` pair, add:

```js
  confirmEmail: 'Kumpirmahin ang email mo',
  confirmEmailWhy: 'Dito ipapadala ng CENRO ang update sa ulat mo.',
  wrongAddress: 'Mali ang address? Palitan mo.',
```

- [ ] **Step 3: Create the banner**

Create `web/src/components/resident/VerifyEmailBanner.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/lib/api';
import { COPY_TL } from '@/lib/tagalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const COOLDOWN_SECONDS = 60;

// Shown until the resident confirms their address. Deliberately a banner and
// not a gate: the account works either way, so nobody is stopped from filing a
// report by a slow mailbox.
export default function VerifyEmailBanner() {
  const { user, updateUser } = useAuth();
  const [code, setCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [showChange, setShowChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!user || user.email_verified_at) return null;

  async function onVerify(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await authApi.verifyEmail(code.trim());
      updateUser(res.data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError('');
    try {
      await authApi.resendVerification();
      setNotice('A new code is on its way.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onChangeEmail(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await authApi.changeEmail(newEmail.trim());
      updateUser(res.data.user);
      setShowChange(false);
      setNewEmail('');
      setNotice('Address updated. Check it for a new code.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Confirm your email address</p>
      <p className="text-sm text-amber-900/80">{COPY_TL.confirmEmail}</p>
      <p className="mt-1 text-sm text-amber-900/80">
        We sent a 6-digit code to <strong>{user.email}</strong>. CENRO sends your report
        updates there, so confirming it is what lets us reach you.
      </p>
      <p className="text-sm text-amber-900/70">{COPY_TL.confirmEmailWhy}</p>

      <form onSubmit={onVerify} className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          aria-label="Confirmation code"
          className="h-9 w-32 tracking-[0.3em]"
        />
        <Button type="submit" size="sm" disabled={busy || code.trim().length !== 6}>
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onResend}
          disabled={busy || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
        <button
          type="button"
          onClick={() => setShowChange((s) => !s)}
          className="text-sm font-medium text-amber-900 underline"
        >
          {COPY_TL.wrongAddress}
        </button>
      </form>

      {showChange && (
        <form onSubmit={onChangeEmail} className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="your.correct@email.com"
            aria-label="Correct email address"
            className="h-9 w-64"
          />
          <Button type="submit" size="sm" disabled={busy || !newEmail.trim()}>
            Send new code
          </Button>
        </form>
      )}

      {error ? <p className="mt-2 text-sm font-medium text-destructive">{error}</p> : null}
      {notice ? <p className="mt-2 text-sm text-amber-900">{notice}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Mount it**

In `web/src/components/resident/ResidentLayout.jsx`, add the import beside the `NotificationBell` import:

```jsx
import VerifyEmailBanner from '@/components/resident/VerifyEmailBanner';
```

Then change the `<main>` block to:

```jsx
      <main className="container py-8 pb-28 sm:pb-8">
        <VerifyEmailBanner />
        <Outlet />
      </main>
```

- [ ] **Step 5: Build**

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd web
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/api.js web/src/lib/tagalog.js web/src/components/resident/VerifyEmailBanner.jsx web/src/components/resident/ResidentLayout.jsx
git commit -m "Web: confirm-your-email banner with resend and address correction"
```

---

### Task 9: Mobile verify card

**Files:**
- Modify: `mobile/src/api/client.js`
- Create: `mobile/src/components/VerifyEmailCard.js`
- Modify: `mobile/src/screens/resident/DashboardScreen.js`
- Modify: `mobile/src/lib/tagalog.js`

**Interfaces:**
- Consumes: the three endpoints from Task 5 and `user.email_verified_at` from Task 6.

- [ ] **Step 1: Add the API calls**

In `mobile/src/api/client.js`, inside the `api` object, below the `notifications` block, add:

```js
  // Email confirmation. All three require the token: the soft gate means the
  // resident is signed in while their address is still unconfirmed.
  verifyEmail: (code, token) => request('/auth/verify-email', { method: 'POST', body: { code }, token }),
  resendVerification: (token) => request('/auth/resend-verification', { method: 'POST', token }),
  changeEmail: (email, token) => request('/auth/email', { method: 'PATCH', body: { email }, token }),
```

- [ ] **Step 2: Add the Tagalog strings**

In `mobile/src/lib/tagalog.js`, add the SAME three keys as Task 8 Step 2, in the same position, byte-identical.

Verify with:

```bash
diff <(sed -n '/^export const STAGE_TL/,$p' web/src/lib/tagalog.js) <(sed -n '/^export const STAGE_TL/,$p' mobile/src/lib/tagalog.js) && echo IN_SYNC
```

- [ ] **Step 3: Create the card**

Create `mobile/src/components/VerifyEmailCard.js`:

```js
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { COPY_TL } from '../lib/tagalog';
import { colors, radius } from '../theme';
import TextField from './TextField';
import Button from './Button';

const COOLDOWN_SECONDS = 60;

// Shown until the resident confirms their address. A card, not a gate - the
// account works either way, so a slow mailbox never blocks a report.
export default function VerifyEmailCard() {
  const { user, token, updateUser } = useAuth();
  const [code, setCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [showChange, setShowChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!user || user.email_verified_at) return null;

  async function onVerify() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api.verifyEmail(code.trim(), token);
      updateUser(res.data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError('');
    try {
      await api.resendVerification(token);
      setNotice('A new code is on its way.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onChangeEmail() {
    setBusy(true);
    setError('');
    try {
      const res = await api.changeEmail(newEmail.trim(), token);
      updateUser(res.data.user);
      setShowChange(false);
      setNewEmail('');
      setNotice('Address updated. Check it for a new code.');
      setCooldown(COOLDOWN_SECONDS);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Confirm your email address</Text>
      <Text style={styles.titleTl}>{COPY_TL.confirmEmail}</Text>
      <Text style={styles.body}>
        We sent a 6-digit code to {user.email}. CENRO sends your report updates there.
      </Text>
      <Text style={styles.bodyTl}>{COPY_TL.confirmEmailWhy}</Text>

      <TextField
        label="Code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="123456"
        containerStyle={{ marginTop: 12 }}
      />
      <View style={{ gap: 8, marginTop: 10 }}>
        <Button title="Confirm" onPress={onVerify} loading={busy} disabled={code.trim().length !== 6} />
        <Button
          title={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          variant="outline"
          onPress={onResend}
          disabled={busy || cooldown > 0}
        />
        <Button
          title={showChange ? 'Cancel' : COPY_TL.wrongAddress}
          variant="outline"
          onPress={() => setShowChange((s) => !s)}
          disabled={busy}
        />
      </View>

      {showChange && (
        <View style={{ gap: 10, marginTop: 12 }}>
          <TextField
            label="Correct address"
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="your.correct@email.com"
          />
          <Button title="Send new code" onPress={onChangeEmail} loading={busy} disabled={!newEmail.trim()} />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 18,
  },
  title: { fontSize: 15, fontWeight: '800', color: '#78350f' },
  titleTl: { fontSize: 13, fontWeight: '600', color: '#92400e', marginTop: 1 },
  body: { fontSize: 13, color: '#78350f', marginTop: 6, lineHeight: 19 },
  bodyTl: { fontSize: 13, color: '#92400e', opacity: 0.85, marginTop: 2 },
  error: { fontSize: 13, color: colors.danger, marginTop: 10, fontWeight: '500' },
  notice: { fontSize: 13, color: '#78350f', marginTop: 10 },
});
```

- [ ] **Step 4: Mount it**

In `mobile/src/screens/resident/DashboardScreen.js`, add the import beside `NotificationBell`:

```js
import VerifyEmailCard from '../../components/VerifyEmailCard';
```

Then, in the `ScrollView`, directly below the closing `</View>` of the hero block and above the `{error ? ... : null}` line, add:

```jsx
        <VerifyEmailCard />
```

- [ ] **Step 5: Bundle**

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd mobile
npx expo export --platform android
```

Expected: `Android Bundled ... index.js (N modules)` with no import or JSX errors.

- [ ] **Step 6: Confirm the Tagalog copies match**

```bash
diff <(sed -n '/^export const STAGE_TL/,$p' web/src/lib/tagalog.js) <(sed -n '/^export const STAGE_TL/,$p' mobile/src/lib/tagalog.js) && echo IN_SYNC
```

Expected: `IN_SYNC`.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/api/client.js mobile/src/lib/tagalog.js mobile/src/components/VerifyEmailCard.js mobile/src/screens/resident/DashboardScreen.js
git commit -m "Mobile: confirm-your-email card with resend and address correction"
```

---

## Final manual verification

Run once, end to end, after Task 9. Keep to these exact calls — `/auth` allows only 10 requests per 15 minutes per IP.

- [ ] Start MySQL, the backend, and the web app.
- [ ] Register a NEW account on web with a real address you can read.
- [ ] Confirm the amber banner appears on the resident dashboard.
- [ ] Read the code from the email (or the `[verify]` server log if mail is off) and enter it. The banner should disappear without a page reload.
- [ ] Register a SECOND new account with a deliberately wrong address. Use "Wrong address? Change it" to correct it, and confirm a new code arrives at the corrected address and works.
- [ ] Sign in on mobile as the second account before confirming; verify the card renders and the same flow works there.
- [ ] Request a password reset for a THIRD, unconfirmed account. Confirm no reset link arrives and the "Confirm your email" email does.
- [ ] Confirm an existing seeded account (`juan.delacruz@example.com`) shows NO banner — the Task 1 backfill covers it.

## Known gap, deliberately not in this plan

`authLimiter` is keyed by IP at 10 requests per 15 minutes. Residents registering from one shared Wi-Fi will exhaust it, and verification adds two more calls each. This needs its own decision before the evaluation survey — most likely raising `AUTH_RATE_LIMIT_MAX` for that window. It is recorded in the spec's Risks section.
