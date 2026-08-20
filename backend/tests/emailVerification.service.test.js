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
  auditLog: { count: jest.fn() },
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

describe('verifyCode', () => {
  const CODE = '418203';
  const hashOf = (c) => crypto.createHash('sha256').update(c).digest('hex');

  function tokenFor(overrides = {}) {
    return {
      id: 7,
      user_id: 1,
      code_hash: hashOf(CODE),
      email: 'juan@example.com',
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
      used_at: null,
      attempts: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(UNVERIFIED_USER);
    prisma.emailVerificationToken.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});
  });

  test('accepts the correct code and stamps email_verified_at', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor());

    await expect(service.verifyCode(1, CODE)).resolves.toMatchObject({ ok: true });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 1 },
        data: { email_verified_at: expect.any(Date) },
      })
    );
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EMAIL_VERIFIED' })
    );
  });

  test('rejects a wrong code and does NOT verify', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor());

    await expect(service.verifyCode(1, '000000')).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('rejects an expired code', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(
      tokenFor({ expires_at: new Date(Date.now() - 1000) })
    );

    await expect(service.verifyCode(1, CODE)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('rejects a code minted for a different address', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(
      tokenFor({ email: 'jaun@example.com' })
    );

    await expect(service.verifyCode(1, CODE)).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('rejects once past the attempt cap, without comparing', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor({ attempts: 5 }));

    await expect(service.verifyCode(1, CODE)).rejects.toMatchObject({ statusCode: 429 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('counts the attempt BEFORE comparing, so a wrong code always costs one', async () => {
    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor());

    await expect(service.verifyCode(1, '999999')).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { attempts: { increment: 1 } },
    });

    // What actually proves attempt-before-compare is the assertion above: the
    // code was WRONG, so the request rejected, and the increment still landed.
    // The ordering check below is the weaker companion property - the token is
    // read before it is incremented - which mocks can pin directly. Neither can
    // observe the hash comparison itself, since it is not a mocked call.
    const lookedUp = prisma.emailVerificationToken.findFirst.mock.invocationCallOrder[0];
    const incremented = prisma.emailVerificationToken.update.mock.invocationCallOrder[0];
    expect(lookedUp).toBeLessThan(incremented);

    // The rejecting path must never stamp the user as verified.
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('reports the same message for wrong, expired, and missing', async () => {
    const messages = [];

    prisma.emailVerificationToken.findFirst.mockResolvedValue(tokenFor());
    await service.verifyCode(1, '111111').catch((e) => messages.push(e.message));

    prisma.emailVerificationToken.findFirst.mockResolvedValue(
      tokenFor({ expires_at: new Date(Date.now() - 1000) })
    );
    await service.verifyCode(1, CODE).catch((e) => messages.push(e.message));

    prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
    await service.verifyCode(1, CODE).catch((e) => messages.push(e.message));

    // Exhaustiveness first. Without this the test passes green if a path stops
    // rejecting at all: its catch never fires, the array holds only the two
    // surviving messages, and a Set of two identical strings is still size 1 -
    // so a broken anti-enumeration path would look identical to a healthy one.
    expect(messages).toHaveLength(3);
    expect(new Set(messages).size).toBe(1);
  });

  test('is a no-op when the address is already confirmed', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...UNVERIFIED_USER, email_verified_at: new Date() });

    await expect(service.verifyCode(1, CODE)).resolves.toMatchObject({ ok: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('changeUnverifiedEmail', () => {
  beforeEach(() => {
    prisma.user.update.mockResolvedValue({});
    prisma.auditLog.count.mockResolvedValue(0);
  });

  test('updates the address and mails a code to the NEW one', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(UNVERIFIED_USER)              // the caller
      .mockResolvedValueOnce(null)                          // new address is free
      .mockResolvedValueOnce({ ...UNVERIFIED_USER, email: 'juan.fixed@example.com' }); // reload inside send

    await service.changeUnverifiedEmail(1, 'juan.fixed@example.com');

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 1 },
        data: { email: 'juan.fixed@example.com' },
      })
    );
    expect(notifyEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan.fixed@example.com' })
    );
  });

  test('binds the new code to the new address', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(UNVERIFIED_USER)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...UNVERIFIED_USER, email: 'juan.fixed@example.com' });

    await service.changeUnverifiedEmail(1, 'juan.fixed@example.com');

    const stored = prisma.emailVerificationToken.create.mock.calls[0][0].data;
    expect(stored.email).toBe('juan.fixed@example.com');

    // The address must be written BEFORE the code is minted. Without this, the
    // canned third findUnique would keep these tests green even if the two were
    // swapped - which is exactly the bug that would mail a code bound to the
    // address the resident cannot read.
    expect(prisma.user.update.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.emailVerificationToken.create.mock.invocationCallOrder[0]
    );
  });

  test('ignores the resend cooldown, so a corrected typo is not made to wait', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(UNVERIFIED_USER)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...UNVERIFIED_USER, email: 'juan.fixed@example.com' });
    // A code was sent seconds ago; this must NOT block the change.
    prisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: 9,
      created_at: new Date(),
    });

    await expect(
      service.changeUnverifiedEmail(1, 'juan.fixed@example.com')
    ).resolves.toMatchObject({ ok: true });
    expect(prisma.emailVerificationToken.create).toHaveBeenCalled();
  });

  test('refuses when the address is already confirmed', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      ...UNVERIFIED_USER,
      email_verified_at: new Date(),
    });

    await expect(
      service.changeUnverifiedEmail(1, 'juan.fixed@example.com')
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('refuses when the new address equals the current one', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(UNVERIFIED_USER);

    await expect(
      service.changeUnverifiedEmail(1, 'juan@example.com')
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('refuses an address that belongs to another account', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(UNVERIFIED_USER)
      .mockResolvedValueOnce({ user_id: 2, email: 'taken@example.com' });

    await expect(
      service.changeUnverifiedEmail(1, 'taken@example.com')
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('refuses once the per-hour change cap is hit, without touching the row', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(UNVERIFIED_USER);
    prisma.auditLog.count.mockResolvedValue(5); // MAX_EMAIL_CHANGES_PER_HOUR

    await expect(
      service.changeUnverifiedEmail(1, 'juan.fixed@example.com')
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
