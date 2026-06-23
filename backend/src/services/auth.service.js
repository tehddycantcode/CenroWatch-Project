// Auth business logic: registration, login, and profile lookup.
// All DB access goes through Prisma; every successful mutation writes an AuditLog.

const crypto = require('crypto');
const prisma = require('../utils/prisma');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { writeAuditLog } = require('../utils/audit');
const { notifyPasswordReset } = require('../utils/notify');
const HttpError = require('../utils/httpError');

const RESET_TTL_MINUTES = 60;

// We never store the reset token itself — only this hash. A leaked DB row is
// therefore useless for resetting an account.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Whitelist of fields safe to return to clients (never the password hash).
const PUBLIC_USER_FIELDS = {
  user_id: true,
  email: true,
  first_name: true,
  last_name: true,
  contact_number: true,
  role: true,
  barangay_id: true,
  is_active: true,
  privacy_consent: true,
  created_at: true,
};

function tokenFor(user) {
  return signToken({ sub: user.user_id, role: user.role, email: user.email });
}

/**
 * Public self-registration. Always creates a Resident — staff/admin roles are
 * never self-assignable (any client-supplied role is ignored).
 */
async function register(input, ctx = {}) {
  const { email, password, first_name, last_name, contact_number, barangay_id } = input;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists.');
  }

  if (barangay_id != null) {
    const barangay = await prisma.barangay.findUnique({ where: { barangay_id } });
    if (!barangay) throw new HttpError(422, 'Selected barangay does not exist.');
  }

  const password_hash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      first_name,
      last_name,
      contact_number: contact_number || null,
      barangay_id: barangay_id ?? null,
      role: 'Resident',
      privacy_consent: true,
      consent_date: new Date(),
    },
    select: PUBLIC_USER_FIELDS,
  });

  await writeAuditLog({
    performedBy: user.user_id,
    action: 'USER_REGISTER',
    targetTable: 'User',
    targetId: user.user_id,
    data: { email: user.email, role: user.role },
    ipAddress: ctx.ipAddress || null,
  });

  return { user, token: tokenFor(user) };
}

/**
 * Email + password login. Uses a constant message for both "no such user" and
 * "wrong password" so the endpoint does not reveal which emails are registered.
 */
async function login(input, ctx = {}) {
  const { email, password } = input;

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && (await verifyPassword(password, user.password_hash));

  if (!ok) {
    throw new HttpError(401, 'Invalid email or password.');
  }
  if (!user.is_active) {
    throw new HttpError(403, 'This account has been deactivated.');
  }

  await writeAuditLog({
    performedBy: user.user_id,
    action: 'USER_LOGIN',
    targetTable: 'User',
    targetId: user.user_id,
    data: { email: user.email, role: user.role },
    ipAddress: ctx.ipAddress || null,
  });

  // Strip the hash before returning.
  const { password_hash, ...safeUser } = user;
  return { user: safeUser, token: tokenFor(user) };
}

/**
 * Begin a password reset. To avoid leaking which emails are registered, this
 * ALWAYS resolves the same way; a token is only minted (and emailed) when an
 * active account actually matches. Any prior unused token for the user is
 * invalidated so only the newest link works.
 */
async function requestPasswordReset(email, ctx = {}) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.is_active) {
    await prisma.passwordResetToken.deleteMany({ where: { user_id: user.user_id, used_at: null } });

    const token = crypto.randomBytes(32).toString('hex'); // 256-bit
    const expires_at = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);
    await prisma.passwordResetToken.create({
      data: { user_id: user.user_id, token_hash: hashToken(token), expires_at },
    });

    await writeAuditLog({
      performedBy: user.user_id,
      action: 'PASSWORD_RESET_REQUEST',
      targetTable: 'User',
      targetId: user.user_id,
      data: { email: user.email },
      ipAddress: ctx.ipAddress || null,
    });

    // Sends only if email is configured; never throws.
    await notifyPasswordReset({ to: user.email, name: user.first_name, token });
  }

  return { ok: true };
}

/**
 * Complete a password reset. The token must exist, be unused, and be unexpired.
 * On success the password is updated, the token is consumed, and any other
 * outstanding tokens for the user are invalidated.
 */
async function resetPassword(token, password, ctx = {}) {
  const record = await prisma.passwordResetToken.findUnique({ where: { token_hash: hashToken(token) } });

  if (!record || record.used_at || record.expires_at < new Date()) {
    throw new HttpError(400, 'This reset link is invalid or has expired. Please request a new one.');
  }

  const password_hash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { user_id: record.user_id }, data: { password_hash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { used_at: new Date() } }),
    prisma.passwordResetToken.deleteMany({ where: { user_id: record.user_id, used_at: null } }),
  ]);

  await writeAuditLog({
    performedBy: record.user_id,
    action: 'PASSWORD_RESET_COMPLETE',
    targetTable: 'User',
    targetId: record.user_id,
    data: {},
    ipAddress: ctx.ipAddress || null,
  });

  return { ok: true };
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    select: PUBLIC_USER_FIELDS,
  });
  if (!user) throw new HttpError(404, 'User not found.');
  return user;
}

// Self-service profile edit. Email and role are intentionally NOT editable here.
async function updateProfile(userId, input, ctx = {}) {
  const data = {};
  if (input.first_name !== undefined) data.first_name = input.first_name;
  if (input.last_name !== undefined) data.last_name = input.last_name;
  if (input.contact_number !== undefined) data.contact_number = input.contact_number || null;
  if (input.barangay_id !== undefined) {
    if (input.barangay_id === '' || input.barangay_id === null) {
      data.barangay_id = null;
    } else {
      const barangay = await prisma.barangay.findUnique({ where: { barangay_id: input.barangay_id } });
      if (!barangay) throw new HttpError(422, 'Selected barangay does not exist.');
      data.barangay_id = input.barangay_id;
    }
  }

  const user = await prisma.user.update({ where: { user_id: userId }, data, select: PUBLIC_USER_FIELDS });

  await writeAuditLog({
    performedBy: userId,
    action: 'PROFILE_UPDATE',
    targetTable: 'User',
    targetId: userId,
    data: { fields: Object.keys(data) },
    ipAddress: ctx.ipAddress || null,
  });

  return user;
}

// Self-service password change (requires the current password).
async function changePassword(userId, currentPassword, newPassword, ctx = {}) {
  const user = await prisma.user.findUnique({ where: { user_id: userId } });
  if (!user) throw new HttpError(404, 'User not found.');

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) throw new HttpError(400, 'Your current password is incorrect.');

  const password_hash = await hashPassword(newPassword);
  await prisma.user.update({ where: { user_id: userId }, data: { password_hash } });
  // Any outstanding reset links are no longer needed.
  await prisma.passwordResetToken.deleteMany({ where: { user_id: userId, used_at: null } });

  await writeAuditLog({
    performedBy: userId,
    action: 'PASSWORD_CHANGE',
    targetTable: 'User',
    targetId: userId,
    data: {},
    ipAddress: ctx.ipAddress || null,
  });

  return { ok: true };
}

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  requestPasswordReset,
  resetPassword,
};
