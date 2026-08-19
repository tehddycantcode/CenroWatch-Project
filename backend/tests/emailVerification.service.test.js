// Unit tests for the verification service. Prisma, mail and audit are mocked:
// the logic is what carries risk here, and mocking keeps the suite runnable
// without a database.
const crypto = require('crypto');

jest.mock('../src/utils/prisma', () => ({
  user: { findUnique: jest.fn(), update: jest.fn() },
  emailVerificationToken: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(async (ops) => ops),
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyEmailVerification: jest.fn() }));
// A jest.fn(), not a fixed arrow function - the console-gate tests below
// need to flip its return value per test.
jest.mock('../src/utils/mailer', () => ({ isConfigured: jest.fn(() => true) }));

const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const { notifyEmailVerification } = require('../src/utils/notify');
const { isConfigured } = require('../src/utils/mailer');
const service = require('../src/services/emailVerification.service');

const UNVERIFIED_USER = {
  user_id: 1,
  email: 'juan@example.com',
  first_name: 'Juan',
  email_verified_at: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
  prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
  prisma.emailVerificationToken.create.mockResolvedValue({});
  // clearAllMocks() wipes call history but not a mockReturnValue, so restate
  // the "mail is configured" default here - otherwise a test that flips it
  // to false would leak into whatever runs next.
  isConfigured.mockReturnValue(true);
});

describe('sendVerificationCode', () => {
  test('mints a six-digit code, stores only its hash, and mails the code', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    jest.spyOn(crypto, 'randomInt').mockReturnValue(418203);

    const result = await service.sendVerificationCode(1);

    expect(result).toEqual({ ok: true });

    const stored = prisma.emailVerificationToken.create.mock.calls[0][0].data;
    expect(stored.code_hash).toBe(
      crypto.createHash('sha256').update('418203').digest('hex')
    );
    expect(stored.email).toBe('juan@example.com');
    // The raw code must never be persisted. Asserted on the field, not by
    // substring-searching the hex digest - a fixed digest either contains
    // those six characters or does not, and that is luck, not a test.
    expect(stored.code).toBeUndefined();
    expect(stored.code_hash).not.toBe('418203');
    expect(notifyEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan@example.com', code: '418203' })
    );
    // The code must never reach the audit trail: right action, and an empty
    // data payload (not merely "no code key" - the whole object is {}).
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMAIL_VERIFY_SENT', data: {} })
    );

    crypto.randomInt.mockRestore();
  });

  test('pads a small random value to six digits', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    jest.spyOn(crypto, 'randomInt').mockReturnValue(42);

    await service.sendVerificationCode(1);

    expect(notifyEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ code: '000042' })
    );
    crypto.randomInt.mockRestore();
  });

  test('refuses a resend inside the cooldown', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    prisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: 9,
      created_at: new Date(Date.now() - 10 * 1000), // 10s ago, cooldown is 60s
    });

    await expect(service.sendVerificationCode(1)).rejects.toMatchObject({ statusCode: 429 });
    expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
  });

  test('allows a resend once the cooldown has passed', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    prisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: 9,
      created_at: new Date(Date.now() - 61 * 1000),
    });

    await service.sendVerificationCode(1);
    expect(prisma.emailVerificationToken.create).toHaveBeenCalled();
  });

  test('refuses when the address is already confirmed', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...UNVERIFIED_USER, email_verified_at: new Date() });
    await expect(service.sendVerificationCode(1)).rejects.toMatchObject({ statusCode: 409 });
  });

  test('logs the raw code to console when mail is not configured', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    isConfigured.mockReturnValue(false);
    jest.spyOn(crypto, 'randomInt').mockReturnValue(418203);
    // Spied and silenced so this deliberate dev-fallback log doesn't dirty
    // the test runner's own output.
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.sendVerificationCode(1);

    expect(logSpy).toHaveBeenCalled();
    expect(logSpy.mock.calls[0][0]).toContain('418203');

    crypto.randomInt.mockRestore();
    logSpy.mockRestore();
  });

  test('does not log the code to console when mail is configured', async () => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    isConfigured.mockReturnValue(true);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.sendVerificationCode(1);

    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
