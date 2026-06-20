// Auth business logic: registration, login, and profile lookup.
// All DB access goes through Prisma; every successful mutation writes an AuditLog.

const prisma = require('../utils/prisma');
const { hashPassword, verifyPassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { writeAuditLog } = require('../utils/audit');
const HttpError = require('../utils/httpError');

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

async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { user_id: userId },
    select: PUBLIC_USER_FIELDS,
  });
  if (!user) throw new HttpError(404, 'User not found.');
  return user;
}

module.exports = { register, login, getProfile };
