// Unit test for admin.user.service.createUser stamping email_verified_at.
// This is the only implementation of that spec decision (an Admin-created
// account has nothing to confirm) and had no test covering it.
jest.mock('../src/utils/prisma', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
  barangay: { findUnique: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
}));

const prisma = require('../src/utils/prisma');
const { createUser } = require('../src/services/admin.user.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(null); // email not taken
  prisma.user.create.mockImplementation(({ data, select }) => Promise.resolve({ ...data, select }));
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
