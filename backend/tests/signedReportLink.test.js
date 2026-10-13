// Short-lived signed links to a resident's own report PDF.
//
// WHY THIS SUITE EXISTS. This is a SECOND way to authenticate a request, which
// is the most dangerous kind of thing to add to a system - a weakness here is
// an authorisation bypass, not a cosmetic bug. Three properties have to hold
// and none is enforced by the type system:
//
//   1. IT IS ADDITIVE. A request with no signature must take exactly the path
//      it took before this existed, i.e. straight into `authenticate`. If that
//      stops being true, the web app breaks or - far worse - the endpoint
//      quietly becomes public.
//   2. A LINK OPENS ONE REPORT, FOR ONE PERSON. The signature covers the kind,
//      the reference, the user and the expiry TOGETHER. Editing any one of them
//      must invalidate it; signing them separately would let a link for one
//      report be pasted onto another, or `e=` be pushed into the far future.
//   3. IT DOES NOT REPLACE THE OWNERSHIP CHECK. The signature decides WHO is
//      asking. What they may have is still decided by the service, which 403s
//      on a report that is not theirs.
//
// The key is derived through its own domain string, so a token minted for
// /uploads cannot be replayed as a report link. That is asserted here too,
// because both ultimately derive from JWT_SECRET and it would be easy to
// "simplify" them into one.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-signed-report-links';

const mockPrisma = { user: { findUnique: jest.fn() } };
jest.mock('../src/utils/prisma', () => mockPrisma);

const mockAuthenticate = jest.fn((req, res, next) => {
  req.authenticateWasCalled = true;
  next();
});
jest.mock('../src/middlewares/authenticate', () => mockAuthenticate);

const { signReport, verifyReport, resetKeyCache } = require('../src/utils/reportToken');
const { signPath } = require('../src/utils/fileToken');
const signedReportLink = require('../src/middlewares/signedReportLink');

// Turn "e=1&u=2&s=x" into { e: '1', u: '2', s: 'x' }, the shape Express gives.
const parse = (qs) => Object.fromEntries(new URLSearchParams(qs));

const ACTIVE_USER = {
  user_id: 7, email: 'juan@example.com', first_name: 'Juan', last_name: 'Dela Cruz',
  role: 'Resident', is_active: true,
};

function run(mw, req) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; resolve({ res, nexted: false, err: null }); return res; };
    mw(req, res, (err) => resolve({ res, nexted: true, err: err || null }));
  });
}

const request = (query, params = { trackingId: 'CMP-2026-00042' }) => ({ query, params });

beforeEach(() => {
  jest.clearAllMocks();
  resetKeyCache();
  mockPrisma.user.findUnique.mockResolvedValue(ACTIVE_USER);
});

describe('signReport / verifyReport', () => {
  test('a freshly minted token verifies, and reports the user it was minted for', () => {
    const qs = signReport('complaint', 'CMP-2026-00042', 7);
    expect(verifyReport('complaint', 'CMP-2026-00042', parse(qs))).toEqual({ userId: 7 });
  });

  test('a token for one report does NOT open another', () => {
    const qs = signReport('complaint', 'CMP-2026-00042', 7);
    expect(verifyReport('complaint', 'CMP-2026-00099', parse(qs)).reason).toMatch(/invalid/i);
  });

  test('a token for one KIND does not open another kind with the same reference', () => {
    const qs = signReport('complaint', 'REF-1', 7);
    expect(verifyReport('request', 'REF-1', parse(qs)).reason).toMatch(/invalid/i);
  });

  test('swapping the user id invalidates it', () => {
    const q = parse(signReport('complaint', 'CMP-1', 7));
    expect(verifyReport('complaint', 'CMP-1', { ...q, u: '8' }).reason).toMatch(/invalid/i);
  });

  test('pushing the expiry into the future invalidates it', () => {
    // The whole reason expiry is signed WITH the payload rather than beside it.
    const q = parse(signReport('complaint', 'CMP-1', 7));
    const forged = { ...q, e: String(Date.now() + 99 * 24 * 3600 * 1000) };
    expect(verifyReport('complaint', 'CMP-1', forged).reason).toMatch(/invalid/i);
  });

  test('an expired token is refused, and says so in words a person can act on', () => {
    const past = Date.now() - 60 * 60 * 1000;
    const q = parse(signReport('complaint', 'CMP-1', 7, past));
    const out = verifyReport('complaint', 'CMP-1', q);
    expect(out.userId).toBeUndefined();
    expect(out.reason).toMatch(/expired/i);
    expect(out.reason).toMatch(/open the report again/i);
  });

  test('missing, malformed and nonsense parameters are all refused', () => {
    for (const q of [
      {}, { e: '1' }, { s: 'x' }, { e: 'abc', u: '7', s: 'x' },
      { e: String(Date.now() + 1000), u: '0', s: 'x' },
      { e: String(Date.now() + 1000), u: '-3', s: 'x' },
      { e: String(Date.now() + 1000), u: 'nope', s: 'x' },
    ]) {
      expect(verifyReport('complaint', 'CMP-1', q).userId).toBeUndefined();
    }
  });

  test('an /uploads file token cannot be replayed as a report link', () => {
    // Both keys derive from JWT_SECRET; only the domain string separates them.
    const fileQs = signPath('complaints/x.jpg').split('?')[1];
    const q = parse(fileQs);
    expect(verifyReport('complaint', 'complaints/x.jpg', { ...q, u: '7' }).userId).toBeUndefined();
  });

  test('the default lifetime is minutes, not hours - it is opened once, now', () => {
    const { DEFAULT_TTL_MINUTES } = require('../src/utils/reportToken');
    expect(DEFAULT_TTL_MINUTES).toBeLessThanOrEqual(15);
  });
});

describe('the middleware is additive', () => {
  test('NO signature hands the request straight to authenticate', async () => {
    const mw = signedReportLink('complaint', 'trackingId');
    const req = request({});
    const { nexted } = await run(mw, req);
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(req.authenticateWasCalled).toBe(true);
    expect(nexted).toBe(true);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('an absent query object does not throw - it still falls through', async () => {
    const mw = signedReportLink('complaint', 'trackingId');
    const { nexted } = await run(mw, { params: { trackingId: 'X' } });
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(nexted).toBe(true);
  });

  test('a BAD signature is refused 401 and never reaches authenticate', async () => {
    // It must not fall back to session auth: that would turn a forged link into
    // a silent no-op rather than a refusal, and hide the attempt.
    const mw = signedReportLink('complaint', 'trackingId');
    const { res } = await run(mw, request({ e: String(Date.now() + 1000), u: '7', s: 'forged' }));
    expect(res.statusCode).toBe(401);
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });
});

describe('a valid signature', () => {
  test('populates req.user and marks the request as link-opened', async () => {
    const mw = signedReportLink('complaint', 'trackingId');
    const req = request(parse(signReport('complaint', 'CMP-2026-00042', 7)));
    const { nexted, err } = await run(mw, req);

    expect(err).toBeNull();
    expect(nexted).toBe(true);
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 7 } }),
    );
    expect(req.user).toEqual(ACTIVE_USER);
    expect(req.viaSignedLink).toBe(true);
  });

  test('does not hand out a fuller session than opening one PDF needs', async () => {
    const mw = signedReportLink('complaint', 'trackingId');
    const req = request(parse(signReport('complaint', 'CMP-2026-00042', 7)));
    await run(mw, req);
    const [[{ select }]] = mockPrisma.user.findUnique.mock.calls;
    // Narrow on purpose. barangay_id and email_verified_at are not here because
    // nothing on this path reads them.
    expect(Object.keys(select).sort()).toEqual(
      ['email', 'first_name', 'is_active', 'last_name', 'role', 'user_id'],
    );
  });

  test('a deactivated account\'s outstanding links stop working', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...ACTIVE_USER, is_active: false });
    const mw = signedReportLink('complaint', 'trackingId');
    const { res } = await run(mw, request(parse(signReport('complaint', 'CMP-2026-00042', 7))));
    expect(res.statusCode).toBe(401);
  });

  test('a deleted account is refused rather than throwing', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const mw = signedReportLink('complaint', 'trackingId');
    const { res } = await run(mw, request(parse(signReport('complaint', 'CMP-2026-00042', 7))));
    expect(res.statusCode).toBe(401);
  });

  test('a database failure reaches the error handler, not a 200', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('db down'));
    const mw = signedReportLink('complaint', 'trackingId');
    const { err } = await run(mw, request(parse(signReport('complaint', 'CMP-2026-00042', 7))));
    expect(err).toBeInstanceOf(Error);
  });

  test('works for the wildlife route, whose parameter is named differently', async () => {
    const mw = signedReportLink('wildlife', 'referenceId');
    const req = { query: parse(signReport('wildlife', 'WLD-2026-00014', 7)), params: { referenceId: 'WLD-2026-00014' } };
    const { nexted } = await run(mw, req);
    expect(nexted).toBe(true);
    expect(req.user).toEqual(ACTIVE_USER);
  });
});

describe('the key', () => {
  test('an explicit REPORT_URL_SECRET overrides the derived key', () => {
    const qs = signReport('complaint', 'CMP-1', 7);
    process.env.REPORT_URL_SECRET = 'a-different-secret-entirely';
    resetKeyCache();
    // Minted under the derived key, checked under the explicit one.
    expect(verifyReport('complaint', 'CMP-1', parse(qs)).userId).toBeUndefined();
    delete process.env.REPORT_URL_SECRET;
    resetKeyCache();
  });
});
