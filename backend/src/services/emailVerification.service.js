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
