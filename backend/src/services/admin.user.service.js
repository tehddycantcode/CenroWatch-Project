// Admin user management: list, create (any role), and update (role / active /
// profile). Public registration only ever creates Residents, so this is the only
// way to mint CENRO_Staff and Admin accounts. Every mutation writes an AuditLog.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { hashPassword } = require('../utils/password');
const { writeAuditLog } = require('../utils/audit');

// Administrator accounts are never minted here. Only the seeded/bootstrap
// admin (npm run create-admin) holds that role; this screen assigns the other
// two. Existing Admin accounts keep working - the restriction is on assigning
// the role, not on holding it.
const ASSIGNABLE_ROLES = ['CENRO_Staff', 'Resident'];

const SAFE_FIELDS = {
  user_id: true,
  email: true,
  first_name: true,
  last_name: true,
  contact_number: true,
  role: true,
  is_active: true,
  barangay_id: true,
  created_at: true,
  email_verified_at: true,
  barangay: { select: { name: true } },
};

async function listUsers(filters = {}) {
  // Express 5 req.query is read-only — coerce here.
  const { role, search } = filters;
  const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
  const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 20;
  const is_active = filters.is_active === undefined || filters.is_active === ''
    ? undefined
    : filters.is_active === true || filters.is_active === 'true';

  const where = {};
  if (role) where.role = role;
  if (typeof is_active === 'boolean') where.is_active = is_active;
  if (search) {
    where.OR = [
      { email: { contains: search } },
      { first_name: { contains: search } },
      { last_name: { contains: search } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: SAFE_FIELDS,
    }),
  ]);

  return { items, total, page, limit };
}

async function createUser(adminId, input, ctx = {}) {
  const { email, password, first_name, last_name, role, contact_number, barangay_id } = input;
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new HttpError(422, 'Role must be CENRO Staff or Resident.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, 'An account with this email already exists.');

  if (barangay_id != null) {
    const bgy = await prisma.barangay.findUnique({ where: { barangay_id } });
    if (!bgy) throw new HttpError(422, 'Selected barangay does not exist.');
  }

  const password_hash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      first_name,
      last_name,
      role,
      contact_number: contact_number || null,
      barangay_id: barangay_id ?? null,
      privacy_consent: true,
      consent_date: new Date(),
      // An Admin typed this address and set the password, so there is nothing
      // to confirm. Leaving it null would lock a new staff member out of
      // password reset on their first day.
      email_verified_at: new Date(),
    },
    select: SAFE_FIELDS,
  });

  await writeAuditLog({
    performedBy: adminId,
    action: 'ADMIN_USER_CREATE',
    targetTable: 'User',
    targetId: user.user_id,
    data: { email: user.email, role: user.role },
    ipAddress: ctx.ipAddress || null,
  });

  return user;
}

async function updateUser(adminId, id, input, ctx = {}) {
  const targetId = Number(id);
  const target = await prisma.user.findUnique({ where: { user_id: targetId }, select: { user_id: true, role: true } });
  if (!target) throw new HttpError(404, 'User not found.');

  // A client may echo the unchanged role back while editing other fields.
  // Treat that as absent so it never trips the checks below.
  if (input.role !== undefined && input.role === target.role) delete input.role;

  // Prevent an admin from locking themselves out (demoting or deactivating self).
  if (targetId === adminId) {
    if (input.role !== undefined) throw new HttpError(422, 'You cannot change your own role.');
    if (input.is_active === false) throw new HttpError(422, 'You cannot deactivate your own account.');
  }

  if (input.role !== undefined && !ASSIGNABLE_ROLES.includes(input.role)) {
    throw new HttpError(422, 'Role must be CENRO Staff or Resident.');
  }

  // Never let the system end up with no active administrator.
  const losesAdmin = target.role === 'Admin' && (input.role !== undefined || input.is_active === false);
  if (losesAdmin) {
    const activeAdmins = await prisma.user.count({ where: { role: 'Admin', is_active: true } });
    if (activeAdmins <= 1) {
      throw new HttpError(422, 'This is the last active administrator. Assign another one first.');
    }
  }
  if (input.barangay_id) {
    const bgy = await prisma.barangay.findUnique({ where: { barangay_id: input.barangay_id } });
    if (!bgy) throw new HttpError(422, 'Selected barangay does not exist.');
  }

  const data = {};
  if (input.role !== undefined) data.role = input.role;
  if (input.is_active !== undefined) data.is_active = input.is_active;
  if (input.first_name !== undefined) data.first_name = input.first_name;
  if (input.last_name !== undefined) data.last_name = input.last_name;
  if (input.contact_number !== undefined) data.contact_number = input.contact_number || null;
  if (input.barangay_id !== undefined) data.barangay_id = input.barangay_id || null;

  const user = await prisma.user.update({ where: { user_id: targetId }, data, select: SAFE_FIELDS });

  await writeAuditLog({
    performedBy: adminId,
    action: 'ADMIN_USER_UPDATE',
    targetTable: 'User',
    targetId: targetId,
    data: { fields: Object.keys(data) },
    ipAddress: ctx.ipAddress || null,
  });

  return user;
}

/**
 * Confirm a user's email address on their behalf, after CENRO has established
 * ownership some other way (in person at the office, over the phone).
 *
 * This is the escape hatch the password-reset email already promises: "If you
 * cannot sign in, contact CENRO Cabuyao and we will confirm your address for
 * you." Until this existed, that sentence pointed at nothing. A resident who
 * never opened the confirmation mail and has since forgotten their password is
 * otherwise sealed out from every direction at once - /verify-email and
 * /resend-verification both sit behind `authenticate`, signing in needs the
 * password they have lost, and requestPasswordReset refuses to mail a link to
 * an address nobody has confirmed. Staff need a way to end that.
 *
 * Deliberately its own action rather than a field on updateUser. The only legal
 * transition is null -> now(); exposing it as an editable field would also
 * permit un-verifying an address and back-dating the stamp, and neither does
 * anything except blur the record. The separate audit action matters just as
 * much: ADMIN_EMAIL_VERIFIED says a STAFF MEMBER vouched for the address, which
 * is a weaker claim than EMAIL_VERIFIED (the user held the code and proved it),
 * and the two must stay distinguishable in the log permanently.
 */
async function markEmailVerified(adminId, id, ctx = {}) {
  const targetId = Number(id);
  // Guard NaN before it reaches Prisma, which would raise a 500 for what is
  // really a bad URL.
  if (!Number.isInteger(targetId)) throw new HttpError(404, 'User not found.');

  const target = await prisma.user.findUnique({
    where: { user_id: targetId },
    select: { user_id: true, email: true, email_verified_at: true },
  });
  if (!target) throw new HttpError(404, 'User not found.');

  // Refused rather than treated as a no-op success. Nothing would be mutated,
  // so there would be no audit entry, and an admin would walk away believing
  // they had made a vouching decision that the record does not show them making.
  if (target.email_verified_at) throw new HttpError(422, 'This address is already confirmed.');

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { user_id: targetId },
      data: { email_verified_at: new Date() },
      select: SAFE_FIELDS,
    }),
    // Any code still in flight is dead now. Mirrors verifyCode's cleanup.
    prisma.emailVerificationToken.deleteMany({ where: { user_id: targetId, used_at: null } }),
  ]);

  await writeAuditLog({
    performedBy: adminId,
    action: 'ADMIN_EMAIL_VERIFIED',
    targetTable: 'User',
    targetId: targetId,
    data: { email: target.email },
    ipAddress: ctx.ipAddress || null,
  });

  return user;
}

module.exports = { listUsers, createUser, updateUser, markEmailVerified, ASSIGNABLE_ROLES };
