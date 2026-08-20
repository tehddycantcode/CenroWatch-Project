// Unit test for register()'s deliberate swallow of a sendVerificationCode
// failure. Prisma, audit, password and emailVerification.service are mocked:
// a mail outage must not turn a successful registration into a 500, and
// nothing else here guards that.
//
// auth.service.js requires ../utils/jwt at module load, which throws if
// JWT_SECRET is unset - so this must be set before the first require below.
process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/utils/prisma', () => ({
  user: { findUnique: jest.fn(), create: jest.fn() },
  barangay: { findUnique: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  verifyPassword: jest.fn(),
}));
jest.mock('../src/services/emailVerification.service', () => ({
  sendVerificationCode: jest.fn(),
}));

const prisma = require('../src/utils/prisma');
const { sendVerificationCode } = require('../src/services/emailVerification.service');
const { register } = require('../src/services/auth.service');

const NEW_USER = {
  user_id: 1,
  email: 'juan@example.com',
  first_name: 'Juan',
  last_name: 'Dela Cruz',
  role: 'Resident',
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue(null); // address not already registered
  prisma.user.create.mockResolvedValue(NEW_USER);
});

test('register() still returns a user and token when sendVerificationCode throws', async () => {
  sendVerificationCode.mockRejectedValue(new Error('mail provider is down'));
  // Silence the deliberate [register] error log so it doesn't dirty test output.
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  const result = await register({
    email: 'juan@example.com',
    password: 'Password123',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
  });

  expect(result.user).toEqual(NEW_USER);
  expect(typeof result.token).toBe('string');
  expect(result.token.length).toBeGreaterThan(0);
  expect(sendVerificationCode).toHaveBeenCalled();

  errSpy.mockRestore();
});
