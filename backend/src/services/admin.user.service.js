// Admin user management: list, create (any role), and update (role / active /
// profile). Public registration only ever creates Residents, so this is the only
// way to mint CENRO_Staff and Admin accounts. Every mutation writes an AuditLog.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { hashPassword } = require('../utils/password');
const { writeAuditLog } = require('../utils/audit');

const ROLES = ['Admin', 'CENRO_Staff', 'Resident'];

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
  if (!ROLES.includes(role)) throw new HttpError(422, 'Invalid role.');

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

  // Prevent an admin from locking themselves out (demoting or deactivating self).
  if (targetId === adminId) {
    if (input.role !== undefined && input.role !== 'Admin') throw new HttpError(422, 'You cannot change your own role.');
    if (input.is_active === false) throw new HttpError(422, 'You cannot deactivate your own account.');
  }

  if (input.role !== undefined && !ROLES.includes(input.role)) throw new HttpError(422, 'Invalid role.');
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

module.exports = { listUsers, createUser, updateUser, ROLES };
