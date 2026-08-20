// Unit tests for admin.user.service: the two places this service makes a
// claim about whether an email address is real.
jest.mock('../src/utils/prisma', () => ({
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  barangay: { findUnique: jest.fn() },
  emailVerificationToken: { deleteMany: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
}));

const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const { createUser, markEmailVerified } = require('../src/services/admin.user.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(null); // email not taken
  prisma.user.create.mockImplementation(({ data, select }) => Promise.resolve({ ...data, select }));
  prisma.user.update.mockImplementation(({ data }) => Promise.resolve({ user_id: 7, ...data }));
  prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
  prisma.$transaction.mockImplementation((ops) => Promise.all(ops));
});

test('createUser stamps email_verified_at, since an Admin typed the address', async () => {
  await createUser(99, {
    email: 'staff@example.com',
    password: 'Password123',
    first_name: 'Staff',
    last_name: 'Member',
    role: 'CENRO_Staff',
  });

  const createArgs = prisma.user.create.mock.calls[0][0];
  expect(createArgs.data.email_verified_at).toBeInstanceOf(Date);
});

describe('markEmailVerified', () => {
  const unverified = { user_id: 7, email: 'juan@example.com', email_verified_at: null };

  test('stamps the address and purges any code still in flight', async () => {
    prisma.user.findUnique.mockResolvedValue(unverified);

    await markEmailVerified(99, 7);

    expect(prisma.user.update.mock.calls[0][0].data.email_verified_at).toBeInstanceOf(Date);
    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 7, used_at: null },
    });
  });

  // The whole point of a separate action. A staff member vouching for an
  // address out of band is a weaker claim than the user entering the code, and
  // an auditor must be able to tell the two apart years later. If this ever
  // collapses into EMAIL_VERIFIED, that distinction is gone from the record
  // with no way to reconstruct it.
  test('records ADMIN_EMAIL_VERIFIED, never the user-proved EMAIL_VERIFIED', async () => {
    prisma.user.findUnique.mockResolvedValue(unverified);

    await markEmailVerified(99, 7);

    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const entry = writeAuditLog.mock.calls[0][0];
    expect(entry.action).toBe('ADMIN_EMAIL_VERIFIED');
    expect(entry.performedBy).toBe(99); // the admin, not the account holder
    expect(entry.targetId).toBe(7);
  });

  // A no-op that answered 200 would leave an admin believing they had made a
  // vouching decision the audit log has no record of them making.
  test('refuses an already-confirmed address rather than silently succeeding', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...unverified, email_verified_at: new Date() });

    await expect(markEmailVerified(99, 7)).rejects.toMatchObject({ statusCode: 422 });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  test('404s an unknown user without touching the audit log', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(markEmailVerified(99, 1234)).rejects.toMatchObject({ statusCode: 404 });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  // A non-numeric :id reached Prisma as NaN before the guard, turning a bad
  // URL into a 500.
  test('404s a non-numeric id instead of handing NaN to Prisma', async () => {
    await expect(markEmailVerified(99, 'abc')).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
