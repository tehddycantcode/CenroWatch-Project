// "Remember me" — session lifetime chosen at login.
//
// Unchecked gives the browser a SESSION cookie that dies when the browser
// closes, and signs the JWT with a short life. Both halves are needed: killing
// the cookie alone protects nothing, because a token copied off a shared
// machine stays valid for the rest of its own lifetime regardless of what the
// browser did with its cookie jar.
//
// THE CASE THAT IS EASY TO MISS is changePassword. Three places issue a token -
// register, login, and changePassword, which re-issues one so the person
// changing their own password is not signed out by their own action. If that
// re-issue does not know what was chosen at login, someone who deliberately
// declined "remember me" on a shared computer gets silently upgraded to a
// week-long persistent session by changing their password. The choice rides in
// the token as a `rem` claim so every re-issue can preserve it.
//
// COMPATIBILITY IS ASSERTED, NOT ASSUMED. An absent `remember` field and an
// absent `rem` claim both mean "remembered". The installed mobile build does
// not send the field and every session that exists today has no claim; a
// default of false would sign all of them out.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-remember-me';
process.env.JWT_EXPIRES_IN = '7d';
process.env.JWT_SHORT_EXPIRES_IN = '12h';

jest.mock('../src/utils/prisma', () => ({
  user: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  passwordResetToken: { deleteMany: jest.fn() },
  auditLog: { create: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/password', () => ({
  verifyPassword: jest.fn().mockResolvedValue(true),
  hashPassword: jest.fn().mockResolvedValue('$2a$12$hashed'),
}));

const jwt = require('jsonwebtoken');
const prisma = require('../src/utils/prisma');
const { setSessionCookie } = require('../src/utils/sessionCookie');
const authService = require('../src/services/auth.service');

const HOUR = 3600;
const DAY = 24 * HOUR;

const USER = {
  user_id: 7,
  email: 'juan@example.com',
  role: 'Resident',
  is_active: true,
  password_hash: '$2a$12$hashed',
  password_changed_at: null,
};

const decode = (token) => jwt.verify(token, process.env.JWT_SECRET);
const lifetimeOf = (token) => {
  const p = decode(token);
  return p.exp - p.iat;
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ ...USER });
  prisma.user.update.mockResolvedValue({ ...USER });
  prisma.user.create.mockResolvedValue({ ...USER });
  prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe('token lifetime follows the choice made at login', () => {
  test('remembered sessions get the full lifetime', async () => {
    const { token } = await authService.login({ email: USER.email, password: 'x', remember: true });
    expect(lifetimeOf(token)).toBe(7 * DAY);
  });

  test('declined sessions get the short lifetime', async () => {
    const { token } = await authService.login({ email: USER.email, password: 'x', remember: false });
    expect(lifetimeOf(token)).toBe(12 * HOUR);
  });

  test('the short lifetime is genuinely shorter, not merely different', async () => {
    const long = await authService.login({ email: USER.email, password: 'x', remember: true });
    const short = await authService.login({ email: USER.email, password: 'x', remember: false });
    expect(lifetimeOf(short.token)).toBeLessThan(lifetimeOf(long.token));
  });
});

describe('the choice rides in the token', () => {
  test('a remembered token carries rem: true', async () => {
    const { token } = await authService.login({ email: USER.email, password: 'x', remember: true });
    expect(decode(token).rem).toBe(true);
  });

  test('a declined token carries rem: false', async () => {
    const { token } = await authService.login({ email: USER.email, password: 'x', remember: false });
    expect(decode(token).rem).toBe(false);
  });
});

describe('deploying this signs nobody out', () => {
  test('an absent remember field is treated as remembered', async () => {
    // The installed mobile build does not send it.
    const { token } = await authService.login({ email: USER.email, password: 'x' });
    expect(lifetimeOf(token)).toBe(7 * DAY);
    expect(decode(token).rem).toBe(true);
  });

  test('register always issues a remembered session', async () => {
    // Someone who just created an account should not be signed out in 12 hours.
    prisma.user.findUnique.mockResolvedValue(null); // email not taken
    prisma.user.create = jest.fn().mockResolvedValue({ ...USER });
    const { token } = await authService.register({
      email: 'new@example.com', password: 'Passw0rd!', first_name: 'New', last_name: 'User',
    });
    expect(decode(token).rem).toBe(true);
    expect(lifetimeOf(token)).toBe(7 * DAY);
  });
});

describe('changePassword preserves the original choice', () => {
  // The adversarial case: declining "remember me" on a shared computer must not
  // be quietly undone by changing your password on that same machine.
  test('a declined session stays declined', async () => {
    const { token } = await authService.changePassword(USER.user_id, 'old', 'Passw0rd!', { remember: false });
    expect(decode(token).rem).toBe(false);
    expect(lifetimeOf(token)).toBe(12 * HOUR);
  });

  test('a remembered session stays remembered', async () => {
    const { token } = await authService.changePassword(USER.user_id, 'old', 'Passw0rd!', { remember: true });
    expect(decode(token).rem).toBe(true);
    expect(lifetimeOf(token)).toBe(7 * DAY);
  });

  test('an unknown choice falls back to remembered', async () => {
    // Tokens issued before this feature carry no claim.
    const { token } = await authService.changePassword(USER.user_id, 'old', 'Passw0rd!', {});
    expect(decode(token).rem).toBe(true);
  });
});

describe('the session cookie matches the choice', () => {
  function capture() {
    const res = { cookie: jest.fn() };
    return { res, optionsOf: () => res.cookie.mock.calls[0][2] };
  }

  test('a remembered session gets a persistent cookie', () => {
    const { res, optionsOf } = capture();
    setSessionCookie(res, 'tok', true);
    expect(optionsOf().maxAge).toBe(7 * DAY * 1000);
  });

  test('A DECLINED SESSION GETS NO maxAge, so the browser drops it on close', () => {
    const { res, optionsOf } = capture();
    setSessionCookie(res, 'tok', false);
    expect(optionsOf().maxAge).toBeUndefined();
  });

  test('an omitted argument keeps the persistent cookie', () => {
    const { res, optionsOf } = capture();
    setSessionCookie(res, 'tok');
    expect(optionsOf().maxAge).toBe(7 * DAY * 1000);
  });

  test('both variants stay HttpOnly and SameSite', () => {
    // Shortening the session must not cost the XSS or CSRF protection.
    for (const remember of [true, false]) {
      const { res, optionsOf } = capture();
      setSessionCookie(res, 'tok', remember);
      expect(optionsOf().httpOnly).toBe(true);
      expect(optionsOf().sameSite).toBe('lax');
      expect(optionsOf().path).toBe('/');
    }
  });
});
