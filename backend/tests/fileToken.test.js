// Signed upload URLs. Pure - no server, no filesystem.
//
// These tokens are the only thing standing between a complaint photo and the
// open internet now that /uploads is no longer express.static, so the cases
// worth having are the forgeries: a token moved to a different file, an expiry
// edited to a later date, and a signature that is simply guessed.

const { signPath, verifyPath, resetKeyCache, DEFAULT_TTL_MINUTES } = require('../src/utils/fileToken');

const PATH = 'complaints/1757480000000-ab12cd34ef56.jpg';
const OTHER = 'complaints/1757480000000-ffffffffffff.jpg';

// Parses "<path>?e=..&s=.." back into its parts.
function parse(signed) {
  const [path, query] = signed.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  return { path, e: params.e, s: params.s };
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  delete process.env.FILE_URL_SECRET;
  delete process.env.FILE_URL_TTL_MINUTES;
  resetKeyCache();
});

afterAll(() => {
  delete process.env.FILE_URL_SECRET;
  delete process.env.FILE_URL_TTL_MINUTES;
  resetKeyCache();
});

describe('signing', () => {
  test('produces the path with an expiry and a signature', () => {
    const { path, e, s } = parse(signPath(PATH));
    expect(path).toBe(PATH);
    expect(Number(e)).toBeGreaterThan(Date.now());
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: safe in a query string unescaped
  });

  test('a freshly signed path verifies', () => {
    const { path, e, s } = parse(signPath(PATH));
    expect(verifyPath(path, { e, s })).toBeNull();
  });

  test('the default TTL matches the GCS driver', () => {
    const now = 1_757_480_000_000;
    const { e } = parse(signPath(PATH, now));
    expect(Number(e) - now).toBe(DEFAULT_TTL_MINUTES * 60 * 1000);
  });

  test('FILE_URL_TTL_MINUTES overrides it', () => {
    process.env.FILE_URL_TTL_MINUTES = '5';
    const now = 1_757_480_000_000;
    const { e } = parse(signPath(PATH, now));
    expect(Number(e) - now).toBe(5 * 60 * 1000);
  });

  test.each([['zero', '0'], ['negative', '-10'], ['not a number', 'soon']])(
    'an invalid TTL (%s) falls back to the default rather than expiring instantly',
    (_label, value) => {
      process.env.FILE_URL_TTL_MINUTES = value;
      const now = 1_757_480_000_000;
      expect(Number(parse(signPath(PATH, now)).e) - now).toBe(DEFAULT_TTL_MINUTES * 60 * 1000);
    }
  );
});

describe('forgery', () => {
  // Signing only the expiry (and not the path) would make this pass, which is
  // why the HMAC covers both together.
  test('a token minted for one file does not work on another', () => {
    const { e, s } = parse(signPath(PATH));
    expect(verifyPath(OTHER, { e, s })).toMatch(/invalid access token/);
  });

  // Signing only the path would make this pass: anyone could edit `e=` forward
  // and hold a permanent link.
  test('extending the expiry invalidates the signature', () => {
    const { e, s } = parse(signPath(PATH));
    const later = String(Number(e) + 86_400_000);
    expect(verifyPath(PATH, { e: later, s })).toMatch(/invalid access token/);
  });

  test('a guessed signature is refused', () => {
    const { e } = parse(signPath(PATH));
    expect(verifyPath(PATH, { e, s: 'not-a-real-signature' })).toMatch(/invalid access token/);
  });

  test('a signature of the right shape but wrong value is refused', () => {
    const { e, s } = parse(signPath(PATH));
    const tampered = (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(verifyPath(PATH, { e, s: tampered })).toMatch(/invalid access token/);
  });

  test('a token signed under a different secret is refused', () => {
    const { path, e, s } = parse(signPath(PATH));
    process.env.JWT_SECRET = 'a-completely-different-secret-value-here';
    resetKeyCache();
    expect(verifyPath(path, { e, s })).toMatch(/invalid access token/);
  });

  // The file-URL key is derived from JWT_SECRET through HMAC precisely so a
  // session token and a file token cannot be swapped for one another.
  test('FILE_URL_SECRET produces different signatures from the derived key', () => {
    const derived = parse(signPath(PATH)).s;
    process.env.FILE_URL_SECRET = 'an-independent-file-signing-secret';
    resetKeyCache();
    expect(parse(signPath(PATH)).s).not.toBe(derived);
  });
});

describe('expiry', () => {
  test('an expired token is refused, and says so', () => {
    const now = 1_757_480_000_000;
    const { path, e, s } = parse(signPath(PATH, now));
    const afterwards = Number(e) + 1;
    expect(verifyPath(path, { e, s }, afterwards)).toMatch(/expired/);
  });

  test('a token is still valid on the last millisecond', () => {
    const now = 1_757_480_000_000;
    const { path, e, s } = parse(signPath(PATH, now));
    expect(verifyPath(path, { e, s }, Number(e))).toBeNull();
  });
});

describe('missing or malformed tokens', () => {
  test.each([
    ['nothing at all', {}],
    ['only an expiry', { e: String(Date.now() + 1000) }],
    ['only a signature', { s: 'abc' }],
  ])('%s is refused as missing', (_label, query) => {
    expect(verifyPath(PATH, query)).toMatch(/missing its access token/);
  });

  test('a non-numeric expiry is refused as malformed', () => {
    expect(verifyPath(PATH, { e: 'tomorrow', s: 'abc' })).toMatch(/malformed/);
  });
});
