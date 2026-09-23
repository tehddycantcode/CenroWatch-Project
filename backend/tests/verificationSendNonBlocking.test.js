// Asking for a verification code must not wait for the email to go out.
//
// The mail send reports nothing useful to the caller: sendMail never rejects,
// it returns { sent: false } and logs. So awaiting it gave the HTTP response no
// information at all - it only added the mail server's latency to it.
//
// On the deployed system that latency was two minutes (an unreachable IPv6
// route plus nodemailer's default timeouts), so "Resend code" appeared frozen.
// The transport fix cut it to about ten seconds; this removes it from the
// response path entirely, so a mail outage is invisible to the person clicking
// the button rather than merely shorter.
//
// What must STILL be awaited is the token row. The code has to exist in the
// database before the response says it was sent, or a fast user could type a
// code that is not yet valid.

jest.mock('../src/utils/prisma', () => ({
  user: { findUnique: jest.fn() },
  emailVerificationToken: { findFirst: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyEmailVerification: jest.fn() }));

const prisma = require('../src/utils/prisma');
const { notifyEmailVerification } = require('../src/utils/notify');
const { sendVerificationCode } = require('../src/services/emailVerification.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({
    user_id: 7,
    email: 'resident@example.com',
    first_name: 'Juan',
    email_verified_at: null,
  });
  prisma.emailVerificationToken.findFirst.mockResolvedValue(null);
  prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });
  prisma.emailVerificationToken.create.mockResolvedValue({});
});

test('resolves even while the mail send is still hanging', async () => {
  // A send that never settles - exactly what an unreachable SMTP host looks
  // like until it times out.
  notifyEmailVerification.mockReturnValue(new Promise(() => {}));

  const result = await Promise.race([
    sendVerificationCode(7),
    new Promise((resolve) => setTimeout(() => resolve('TIMED OUT'), 1000)),
  ]);

  expect(result).not.toBe('TIMED OUT');
  expect(result).toEqual({ ok: true });
});

test('still writes the code to the database before returning', async () => {
  notifyEmailVerification.mockReturnValue(new Promise(() => {}));
  await sendVerificationCode(7);
  expect(prisma.emailVerificationToken.create).toHaveBeenCalled();
});

test('the mail is still requested', async () => {
  notifyEmailVerification.mockResolvedValue({ sent: true });
  await sendVerificationCode(7);
  expect(notifyEmailVerification).toHaveBeenCalledWith(
    expect.objectContaining({ to: 'resident@example.com', name: 'Juan' })
  );
});

// A rejected send must not become an unhandled rejection, which on some Node
// configurations takes the whole process down.
test('a failing send does not reject or go unhandled', async () => {
  notifyEmailVerification.mockRejectedValue(new Error('smtp is down'));
  await expect(sendVerificationCode(7)).resolves.toEqual({ ok: true });
  await new Promise((r) => setTimeout(r, 10));
});
