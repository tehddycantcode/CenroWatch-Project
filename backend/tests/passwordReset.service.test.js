// Unit tests for requestPasswordReset's four input states (no account,
// inactive, unverified, inactive-and-unverified) plus the happy path.
// Prisma, audit, notify and password are mocked: the branching logic is what
// carries risk here, and mocking keeps the suite runnable without a database.
//
// auth.service.js requires ../utils/jwt at module load, which throws if
// JWT_SECRET is unset - so this must be set before the first require below.
process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/utils/prisma', () => ({
  user: { findUnique: jest.fn() },
  passwordResetToken: { deleteMany: jest.fn(), create: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({
  notifyPasswordReset: jest.fn(),
  notifyPasswordResetUnavailable: jest.fn(),
  notifyEmailVerification: jest.fn(),
}));
jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn(),
}));

const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const { notifyPasswordReset, notifyPasswordResetUnavailable } = require('../src/utils/notify');
const { requestPasswordReset } = require('../src/services/auth.service');

const ACTIVE_VERIFIED_USER = {
  user_id: 1,
  email: 'juan@example.com',
  first_name: 'Juan',
  is_active: true,
  email_verified_at: new Date('2026-01-01T00:00:00Z'),
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
  prisma.passwordResetToken.create.mockResolvedValue({});
});

describe('requestPasswordReset branching', () => {
  test('no user -> reason no_account, action PASSWORD_RESET_UNKNOWN_EMAIL', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await requestPasswordReset('nobody@example.com', {});

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_RESET_UNKNOWN_EMAIL', data: {} })
    );
    expect(notifyPasswordResetUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'no_account' })
    );
    expect(notifyPasswordReset).not.toHaveBeenCalled();
  });

  test('exists, inactive, verified -> reason inactive, action PASSWORD_RESET_INACTIVE', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...ACTIVE_VERIFIED_USER,
      is_active: false,
    });

    await requestPasswordReset('juan@example.com', {});

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_RESET_INACTIVE', data: {} })
    );
    expect(notifyPasswordResetUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'inactive' })
    );
    expect(notifyPasswordReset).not.toHaveBeenCalled();
  });

  test('exists, active, unverified -> reason unverified, action PASSWORD_RESET_UNVERIFIED', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...ACTIVE_VERIFIED_USER,
      email_verified_at: null,
    });

    await requestPasswordReset('juan@example.com', {});

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_RESET_UNVERIFIED', data: {} })
    );
    expect(notifyPasswordResetUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'unverified' })
    );
    expect(notifyPasswordReset).not.toHaveBeenCalled();
  });

  // The precedence guarantee: deactivated beats unverified. This is the row a
  // future edit to the nested ternary is most likely to break.
  test('exists, inactive AND unverified -> reason inactive, action PASSWORD_RESET_INACTIVE', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...ACTIVE_VERIFIED_USER,
      is_active: false,
      email_verified_at: null,
    });

    await requestPasswordReset('juan@example.com', {});

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_RESET_INACTIVE', data: {} })
    );
    expect(notifyPasswordResetUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'inactive' })
    );
    expect(notifyPasswordReset).not.toHaveBeenCalled();
  });

  test('exists, active, verified -> mints a token and sends the reset email, not the unavailable one', async () => {
    prisma.user.findUnique.mockResolvedValue(ACTIVE_VERIFIED_USER);

    await requestPasswordReset('juan@example.com', {});

    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 1, used_at: null } })
    );
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ user_id: 1 }),
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_RESET_REQUEST' })
    );
    expect(notifyPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan@example.com', name: 'Juan' })
    );
    expect(notifyPasswordResetUnavailable).not.toHaveBeenCalled();
  });
});
