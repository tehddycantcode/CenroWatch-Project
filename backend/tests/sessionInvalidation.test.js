// Changing a password must end the sessions on every OTHER device.
//
// A JWT is stateless: nothing in it points back at the password it was issued
// under, so before User.password_changed_at existed a resident could change
// their password on the web and the phone would keep working on its old token
// for the rest of JWT_EXPIRES_IN - up to a week of access for exactly the person
// the change was meant to lock out. authenticate() now refuses any token issued
// before the change.
//
// The delicate part, and the reason this file exists, is the comparison. `iat`
// is a UNIX timestamp in WHOLE SECONDS while password_changed_at keeps
// milliseconds, so a naive `iat * 1000 < changedAt` also rejects the replacement
// token minted microseconds after the change - signing the resident out of the
// device they just used. The boundary cases below pin that down.

process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/utils/prisma', () => ({
  user: { findUnique: jest.fn() },
}));

const prisma = require('../src/utils/prisma');
const jwt = require('jsonwebtoken');
const authenticate = require('../src/middlewares/authenticate');

const USER = {
  user_id: 1,
  email: 'juan@example.com',
  first_name: 'Juan',
  last_name: 'Dela Cruz',
  role: 'Resident',
  barangay_id: 3,
  is_active: true,
  password_changed_at: null,
};

// Anchored to NOW, not a fixed epoch: jsonwebtoken derives `exp` from the `iat`
// in the payload, so a hardcoded past timestamp plus expiresIn '7d' produces a
// token that is already expired and gets rejected by jwt.verify long before the
// password check under test is reached.
const NOW = Math.floor(Date.now() / 1000);

// iat is seconds since the epoch, exactly as jsonwebtoken writes it.
function tokenIssuedAt(seconds) {
  return jwt.sign({ sub: 1, role: 'Resident', email: USER.email, iat: seconds }, 'test-secret', {
    expiresIn: '7d',
  });
}

function reqWith(token) {
  return { cookies: {}, headers: { authorization: `Bearer ${token}` } };
}

function resSpy() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

async function run(token, user) {
  prisma.user.findUnique.mockResolvedValue(user);
  const req = reqWith(token);
  const res = resSpy();
  const next = jest.fn();
  await authenticate(req, res, next);
  return { req, res, next };
}

beforeEach(() => jest.clearAllMocks());

describe('authenticate + password_changed_at', () => {
  test('a token is accepted when the password has never been changed', async () => {
    const { res, next } = await run(tokenIssuedAt((NOW - 3600)), { ...USER, password_changed_at: null });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('a token issued BEFORE the password change is refused with 401', async () => {
    const { res, next } = await run(tokenIssuedAt((NOW - 3600)), {
      ...USER,
      password_changed_at: new Date((NOW - 60) * 1000),
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Your password was changed. Please sign in again.' })
    );
  });

  test('a token issued AFTER the change is accepted', async () => {
    const { next, res } = await run(tokenIssuedAt((NOW + 60)), {
      ...USER,
      password_changed_at: new Date((NOW - 60) * 1000),
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  // THE REGRESSION GUARD. The replacement token is signed immediately after the
  // update, so its iat floors to the same second the change happened in. Compare
  // with millisecond precision and this token looks older than the change and is
  // refused - the resident is signed out by their own password change.
  test('the replacement token minted in the SAME second survives', async () => {
    const { next, res } = await run(tokenIssuedAt((NOW - 60)), {
      ...USER,
      password_changed_at: new Date((NOW - 60) * 1000 + 742), // .742s into that second
    });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('one second earlier is still refused', async () => {
    const { next, res } = await run(tokenIssuedAt((NOW - 61)), {
      ...USER,
      password_changed_at: new Date((NOW - 60) * 1000 + 742),
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('password_changed_at is not leaked onto req.user', async () => {
    const { req } = await run(tokenIssuedAt((NOW + 60)), {
      ...USER,
      password_changed_at: new Date((NOW - 60) * 1000),
    });
    expect(req.user).toBeDefined();
    expect(req.user).not.toHaveProperty('password_changed_at');
    expect(req.user).not.toHaveProperty('password_hash');
  });

  test('a deactivated account is refused before the password check is reached', async () => {
    const { res, next } = await run(tokenIssuedAt((NOW + 60)), {
      ...USER,
      is_active: false,
      password_changed_at: null,
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Account not found or deactivated.' })
    );
  });

  test('the cookie transport is subject to the same rule as Bearer', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...USER,
      password_changed_at: new Date((NOW - 60) * 1000),
    });
    const req = {
      cookies: { cenrowatch_token: tokenIssuedAt((NOW - 3600)) },
      headers: {},
    };
    const res = resSpy();
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
