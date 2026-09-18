// Which browser origins may call the API.
//
// This suite exists because of a real failure: an automated browser drove the
// app at http://127.0.0.1:5173 while CLIENT_URL said http://localhost:5173.
// Every authenticated request was refused, yet curl kept working (no Origin
// header), so the API looked healthy and only the browser was broken.
//
// Pure module, no mocks, no server.

const { parseOrigins, createOriginChecker } = require('../src/utils/corsOrigin');

const dev = (over = {}) =>
  createOriginChecker({ clientUrl: 'http://localhost:5173', nodeEnv: 'development', ...over });
const prod = (over = {}) =>
  createOriginChecker({ clientUrl: 'https://cenrowatch.gov.ph', nodeEnv: 'production', ...over });

describe('parseOrigins', () => {
  test('splits a comma-separated list and trims whitespace', () => {
    expect(parseOrigins('https://a.gov.ph, https://b.gov.ph')).toEqual([
      'https://a.gov.ph',
      'https://b.gov.ph',
    ]);
  });

  test('strips trailing slashes — an origin has no path', () => {
    expect(parseOrigins('https://a.gov.ph/')).toEqual(['https://a.gov.ph']);
    expect(parseOrigins('https://a.gov.ph///')).toEqual(['https://a.gov.ph']);
  });

  test('empty, undefined and stray commas yield nothing', () => {
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins('')).toEqual([]);
    expect(parseOrigins(' , , ')).toEqual([]);
  });
});

describe('a request with no Origin header', () => {
  // curl, server-to-server, the mobile app, and same-origin GETs. There is no
  // browser to protect, so CORS has nothing to say; authentication governs these.
  test.each([undefined, null, ''])('%p is allowed in development', (origin) => {
    expect(dev().isAllowed(origin)).toBe(true);
  });

  test.each([undefined, null, ''])('%p is allowed in production too', (origin) => {
    expect(prod().isAllowed(origin)).toBe(true);
  });
});

describe('development', () => {
  // THE REGRESSION. These three are the same machine and three different origins.
  test.each([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://[::1]:5173',
  ])('%s is allowed even though CLIENT_URL names only one of them', (origin) => {
    expect(dev().isAllowed(origin)).toBe(true);
  });

  test('loopback is allowed on any port, because dev servers move', () => {
    expect(dev().isAllowed('http://localhost:5174')).toBe(true);
    expect(dev().isAllowed('http://127.0.0.1:19006')).toBe(true);
    expect(dev().isAllowed('http://localhost')).toBe(true);
  });

  test('a non-loopback origin is still refused', () => {
    expect(dev().isAllowed('https://evil.example.com')).toBe(false);
    // Lookalikes that merely contain the word are not loopback.
    expect(dev().isAllowed('http://localhost.evil.com')).toBe(false);
    expect(dev().isAllowed('http://127.0.0.1.evil.com')).toBe(false);
  });
});

describe('production', () => {
  test('the configured origin is allowed', () => {
    expect(prod().isAllowed('https://cenrowatch.gov.ph')).toBe(true);
  });

  test('a trailing slash on the caller or in config still matches', () => {
    expect(prod().isAllowed('https://cenrowatch.gov.ph/')).toBe(true);
    expect(prod({ clientUrl: 'https://cenrowatch.gov.ph/' }).isAllowed('https://cenrowatch.gov.ph')).toBe(true);
  });

  test('loopback is NOT allowed — the allowlist is the whole point', () => {
    expect(prod().isAllowed('http://localhost:5173')).toBe(false);
    expect(prod().isAllowed('http://127.0.0.1:5173')).toBe(false);
  });

  test('scheme, host and port each change the identity', () => {
    expect(prod().isAllowed('http://cenrowatch.gov.ph')).toBe(false); // http vs https
    expect(prod().isAllowed('https://www.cenrowatch.gov.ph')).toBe(false); // www is a different host
    expect(prod().isAllowed('https://cenrowatch.gov.ph:8443')).toBe(false); // explicit port
  });

  test('several deployed origins can be configured at once', () => {
    const c = prod({ clientUrl: 'https://cenrowatch.gov.ph, https://www.cenrowatch.gov.ph' });
    expect(c.isAllowed('https://cenrowatch.gov.ph')).toBe(true);
    expect(c.isAllowed('https://www.cenrowatch.gov.ph')).toBe(true);
    expect(c.isAllowed('https://other.gov.ph')).toBe(false);
  });

  test('MOBILE_URL is honoured alongside CLIENT_URL, including a non-http scheme', () => {
    const c = prod({ mobileUrl: 'exp://127.0.0.1:19000' });
    expect(c.isAllowed('exp://127.0.0.1:19000')).toBe(true);
    // ...and that exp:// entry must not smuggle in http loopback in production.
    expect(c.isAllowed('http://127.0.0.1:19000')).toBe(false);
  });

  test('no configured origin refuses every browser origin', () => {
    const c = createOriginChecker({ nodeEnv: 'production' });
    expect(c.allowed).toEqual([]);
    expect(c.isAllowed('https://cenrowatch.gov.ph')).toBe(false);
    // But non-browser callers are unaffected, which is exactly why this
    // misconfiguration presents as "only the website is broken".
    expect(c.isAllowed(undefined)).toBe(true);
  });
});
