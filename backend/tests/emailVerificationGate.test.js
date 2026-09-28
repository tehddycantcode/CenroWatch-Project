// The email-confirmation gate on filing a report.
//
// WHY THIS SUITE EXISTS, AND WHY IT HAS TWO HALVES. The gate is two pieces that
// have to agree: requireVerifiedEmail decides, and authenticate supplies the
// field it decides on. Testing only the decision is exactly the mistake recorded
// in CLAUDE.md about csrfHeader.test.js - that suite passed `fromCookie` in by
// hand, so it proved the RULE while the CALLER that computes the rule's input was
// broken, and 34 tests stayed green through a release in which every mobile write
// failed.
//
// So Group A tests the rule with a hand-made req, and Group B tests that
// authenticate actually puts email_verified_at on req.user. If someone later
// trims that column out of authenticate's `select` to keep req.user lean - a
// reasonable-looking change, and there is already a `delete` a few lines below it
// doing precisely that to another field - the gate would silently start refusing
// EVERY request, because undefined is falsy. Group B is what fails instead.

jest.mock('../src/utils/prisma', () => ({ user: { findUnique: jest.fn() } }));
jest.mock('../src/utils/jwt', () => ({ verifyToken: jest.fn() }));

const prisma = require('../src/utils/prisma');
const { verifyToken } = require('../src/utils/jwt');
const requireVerifiedEmail = require('../src/middlewares/requireVerifiedEmail');
const authenticate = require('../src/middlewares/authenticate');

// Minimal res double: records the status and payload the middleware sent.
function makeRes() {
  return {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.payload = body; return this; },
  };
}

describe('requireVerifiedEmail - the rule', () => {
  test('lets a confirmed address through', () => {
    const req = { user: { user_id: 1, role: 'Resident', email_verified_at: new Date() } };
    const res = makeRes();
    const next = jest.fn();

    requireVerifiedEmail(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test('refuses an unconfirmed address with 403', () => {
    const req = { user: { user_id: 1, role: 'Resident', email_verified_at: null } };
    const res = makeRes();
    const next = jest.fn();

    requireVerifiedEmail(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // 403, not 422. Validation failures are 422 throughout this API; this is an
    // unmet precondition on the credential, which is authorize.js's shape.
    expect(res.statusCode).toBe(403);
    expect(res.payload.success).toBe(false);
  });

  test('the 403 message tells the person what to do, unaided', () => {
    // mobile/src/components/ErrorBanner.js renders `message` verbatim, and an
    // APK built before this change has no UI for the refusal - so the sentence
    // itself has to be the instruction. It must survive being read alone.
    const req = { user: { user_id: 1, role: 'Resident', email_verified_at: null } };
    const res = makeRes();

    requireVerifiedEmail(req, res, jest.fn());

    const msg = res.payload.message;
    expect(msg).toMatch(/confirm/i);
    expect(msg).toMatch(/code/i);
    // Names where to go. VerifyEmailCard already lives on the mobile dashboard,
    // so "Home" is actionable on a build that predates the gate.
    expect(msg).toMatch(/home/i);
  });

  test('refuses with 401 when there is no authenticated user at all', () => {
    // Mirrors authorize.js: a missing req.user means the middleware was mounted
    // without authenticate in front of it, which is a wiring bug, not a refusal.
    const res = makeRes();
    const next = jest.fn();

    requireVerifiedEmail({}, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  test('IS NOT SCOPED BY ROLE - an unverified Admin is refused too', () => {
    // Deliberate, and asserted so that "let us exempt staff" fails the suite
    // rather than quietly landing. The gate asserts a property of the CREDENTIAL
    // (this address has been proven), not of the role. It costs nothing today:
    // every non-Resident is verified by construction - the backfill migration
    // stamped existing rows, and admin-created accounts are born verified - so
    // unconditional is a no-op for them. Scoping it to Resident would instead
    // mean any future non-resident signup path silently bypasses the gate.
    for (const role of ['Admin', 'CENRO_Staff']) {
      const res = makeRes();
      const next = jest.fn();
      requireVerifiedEmail({ user: { user_id: 2, role, email_verified_at: null } }, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    }

    for (const role of ['Admin', 'CENRO_Staff']) {
      const res = makeRes();
      const next = jest.fn();
      requireVerifiedEmail({ user: { user_id: 2, role, email_verified_at: new Date() } }, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });
});

describe('authenticate - the CALLER that supplies the field', () => {
  const VERIFIED_AT = new Date('2026-06-20T10:54:14.403Z');

  beforeEach(() => {
    jest.clearAllMocks();
    verifyToken.mockReturnValue({ sub: 1, role: 'Resident', iat: Math.floor(Date.now() / 1000) });
    prisma.user.findUnique.mockResolvedValue({
      user_id: 1,
      email: 'juan@example.com',
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      role: 'Resident',
      barangay_id: 3,
      is_active: true,
      password_changed_at: null,
      email_verified_at: VERIFIED_AT,
    });
  });

  const reqWithBearer = () => ({
    headers: { authorization: 'Bearer token-value' },
    method: 'POST',
    cookies: {},
  });

  test('SELECTS email_verified_at from the database', async () => {
    // The gate cannot work if this column is not asked for. Asserting the select
    // rather than only the outcome is what makes a later "keep req.user lean"
    // edit fail here instead of in production.
    await authenticate(reqWithBearer(), makeRes(), jest.fn());

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    const { select } = prisma.user.findUnique.mock.calls[0][0];
    expect(select.email_verified_at).toBe(true);
  });

  test('puts email_verified_at on req.user, so the gate can read it', async () => {
    const req = reqWithBearer();
    const next = jest.fn();

    await authenticate(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.email_verified_at).toEqual(VERIFIED_AT);
    // And it must NOT be stripped the way password_changed_at is.
    expect('email_verified_at' in req.user).toBe(true);
  });

  test('carries a NULL through as null rather than dropping the key', async () => {
    prisma.user.findUnique.mockResolvedValue({
      user_id: 1, email: 'x@example.com', first_name: 'X', last_name: 'Y',
      role: 'Resident', barangay_id: 3, is_active: true,
      password_changed_at: null, email_verified_at: null,
    });
    const req = reqWithBearer();

    await authenticate(req, makeRes(), jest.fn());

    expect(req.user.email_verified_at).toBeNull();
  });

  test('authenticate and the gate compose: unverified user -> 403', async () => {
    // The two halves run back to back, which is the thing the route does and
    // neither half proves alone.
    prisma.user.findUnique.mockResolvedValue({
      user_id: 1, email: 'x@example.com', first_name: 'X', last_name: 'Y',
      role: 'Resident', barangay_id: 3, is_active: true,
      password_changed_at: null, email_verified_at: null,
    });
    const req = reqWithBearer();
    const res = makeRes();

    await authenticate(req, res, jest.fn());
    const gateNext = jest.fn();
    requireVerifiedEmail(req, res, gateNext);

    expect(gateNext).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
