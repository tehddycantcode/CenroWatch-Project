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
const MAX_EMAIL_CHANGES_PER_HOUR = 5;

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
  // when mail IS configured. The production guard is a second independent
  // check: it stops a misconfigured live deployment (creds unset or still the
  // placeholder) from writing real six-digit codes to server logs in plaintext.
  if (!isConfigured() && process.env.NODE_ENV !== 'production') {
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

  // The resend cooldown is deliberately bypassed for a corrected address, so
  // this is the only brake on using an unverified account to mail arbitrary
  // recipients. authLimiter cannot serve: it is keyed by IP, so residents
  // sharing a barangay-hall connection would pay for one account's abuse.
  const recentChanges = await prisma.auditLog.count({
    where: {
      performed_by: userId,
      action: 'EMAIL_CHANGE_UNVERIFIED',
      performed_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recentChanges >= MAX_EMAIL_CHANGES_PER_HOUR) {
    throw new HttpError(429, 'Too many address changes. Please try again later.');
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

module.exports = {
  sendVerificationCode,
  verifyCode,
  changeUnverifiedEmail,
  CODE_TTL_MINUTES,
  RESEND_COOLDOWN_SECONDS,
  MAX_ATTEMPTS,
};
