// Controlled creation of privileged accounts (Admin / CENRO_Staff).
//
// Public registration only ever creates Residents, so this script is the
// supported way to bootstrap the first Admin (who then manages staff via the
// Sprint 4 admin UI). Credentials come from the environment — never hardcoded.
//
// Usage (PowerShell):
//   $env:NEW_USER_EMAIL="admin@cenrowatch.local"
//   $env:NEW_USER_PASSWORD="ChangeMe123"
//   $env:NEW_USER_ROLE="Admin"           # Admin | CENRO_Staff (default: Admin)
//   $env:NEW_USER_FIRST="System"; $env:NEW_USER_LAST="Administrator"
//   npm run create-admin
//
// Re-running with the same email updates that account's password/role (idempotent).

require('dotenv').config();
const bcrypt = require('bcryptjs');

// The SHARED client, not a fresh PrismaClient. src/utils/prisma.js is wrapped in
// the field-encryption extension; a client built here would bypass it and write
// personal fields in plaintext, with nothing to indicate it had happened. This
// script writes none of those fields today - the point is that the next person
// to add `contact_number` to it should not have to know that.
const prisma = require('../src/utils/prisma');

const VALID_ROLES = ['Admin', 'CENRO_Staff'];

async function main() {
  const email = (process.env.NEW_USER_EMAIL || '').trim().toLowerCase();
  const password = process.env.NEW_USER_PASSWORD || '';
  const role = process.env.NEW_USER_ROLE || 'Admin';
  const first = process.env.NEW_USER_FIRST || 'System';
  const last = process.env.NEW_USER_LAST || 'Administrator';

  if (!email || !password) {
    throw new Error('Set NEW_USER_EMAIL and NEW_USER_PASSWORD before running.');
  }
  if (password.length < 8) {
    throw new Error('NEW_USER_PASSWORD must be at least 8 characters.');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`NEW_USER_ROLE must be one of: ${VALID_ROLES.join(', ')}`);
  }

  const password_hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password_hash,
      role,
      first_name: first,
      last_name: last,
      is_active: true,
      // Repairs an account already stuck unverified from a prior run of this
      // script, before this field was set here.
      email_verified_at: new Date(),
    },
    create: {
      email,
      password_hash,
      first_name: first,
      last_name: last,
      role,
      privacy_consent: true,
      consent_date: new Date(),
      // The operator running this script typed the address and set the
      // password, so there is nothing to confirm. Without this a fresh
      // deployment's first Admin cannot use password reset.
      email_verified_at: new Date(),
    },
    select: { user_id: true, email: true, role: true },
  });

  await prisma.auditLog.create({
    data: {
      performed_by: user.user_id,
      action: 'ADMIN_BOOTSTRAP',
      target_table: 'User',
      target_id: user.user_id,
      data_generated_json: { email: user.email, role: user.role, via: 'create-admin script' },
    },
  });

  console.log(`OK: ${user.role} account ready -> ${user.email} (user_id ${user.user_id})`);
}

main()
  .catch((e) => {
    console.error('Failed:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
