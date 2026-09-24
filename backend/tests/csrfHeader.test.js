// CSRF: require a custom header on cookie-authenticated writes.
//
// SameSite=Lax is the primary defence, but it only holds while the web app and
// the API share a registrable domain. Deployed on free platform subdomains
// (*.pages.dev + *.up.railway.app) that is not true, SESSION_COOKIE_SAMESITE
// must become `none`, and the browser will then attach the session cookie to
// cross-site requests.
//
// What that exposes is narrower than "CSRF": every JSON endpoint already sends
// Content-Type: application/json, which is a non-simple request, so the browser
// preflights it and the exact-origin CORS allowlist refuses. The gap is the
// multipart/form-data upload routes - file uploads are SIMPLE requests that skip
// the preflight entirely, so an attacker's page could file reports in a signed-in
// user's name.
//
// Requiring a custom header closes it without a domain: a cross-site caller
// cannot set one on a simple request, and the moment it tries, the request stops
// being simple and CORS blocks it.
//
// The rule is scoped to COOKIE-authenticated writes on purpose. The mobile app
// sends `Authorization: Bearer`, which a browser never attaches by itself, so
// there is no CSRF to defend against there and no reason to break it.

const { isCsrfViolation, CSRF_HEADER } = require('../src/utils/csrf');

const check = (over = {}) =>
  isCsrfViolation({ method: 'POST', headers: {}, fromCookie: true, ...over });

describe('cookie-authenticated writes', () => {
  test('a write with no header is refused', () => {
    expect(check({ method: 'POST' })).toBe(true);
    expect(check({ method: 'PATCH' })).toBe(true);
    expect(check({ method: 'PUT' })).toBe(true);
    expect(check({ method: 'DELETE' })).toBe(true);
  });

  test('a write carrying the header is allowed', () => {
    expect(check({ headers: { [CSRF_HEADER]: 'XMLHttpRequest' } })).toBe(false);
  });

  test('the header name is matched case-insensitively', () => {
    expect(check({ headers: { 'X-Requested-With': 'XMLHttpRequest' } })).toBe(false);
    expect(check({ headers: { 'x-requested-with': 'fetch' } })).toBe(false);
  });

  // An empty value is not a header a deliberate client sends.
  test('an empty header value does not count', () => {
    expect(check({ headers: { [CSRF_HEADER]: '' } })).toBe(true);
    expect(check({ headers: { [CSRF_HEADER]: '   ' } })).toBe(true);
  });
});

describe('what must keep working', () => {
  // Reads are not the attack. A cross-site GET cannot be read back thanks to
  // CORS, and requiring a header on reads would break every <img> and link.
  test('reads are never refused', () => {
    expect(check({ method: 'GET' })).toBe(false);
    expect(check({ method: 'HEAD' })).toBe(false);
    expect(check({ method: 'OPTIONS' })).toBe(false);
  });

  // The mobile app. A browser will not attach an Authorization header to a
  // cross-site request on its own, so a Bearer-authenticated write cannot be
  // forged this way - and requiring the header would break every installed APK,
  // which cannot be fixed by an over-the-air update in the same afternoon.
  test('Bearer-authenticated writes are untouched', () => {
    expect(check({ fromCookie: false, method: 'POST' })).toBe(false);
    expect(check({ fromCookie: false, method: 'DELETE' })).toBe(false);
  });

  test('a lowercase method name is still a write', () => {
    expect(check({ method: 'post' })).toBe(true);
  });

  test('missing headers object does not throw', () => {
    expect(check({ headers: undefined })).toBe(true);
  });

  // Fail closed. A real Express request always carries a method; if one somehow
  // does not, the safe reading is "this might be a write", not "let it through".
  test('an absent or unrecognised method is treated as a write', () => {
    expect(check({ method: undefined })).toBe(true);
    expect(check({ method: 'PROPFIND' })).toBe(true);
  });
});

// Everything above tests the RULE. This tests who the rule is applied to, which
// is where it actually went wrong in production.
//
// The claim "mobile is exempt because it sends Bearer" only holds if a Bearer
// request is CREDITED to Bearer. React Native's networking layer on Android is
// OkHttp, which keeps a cookie jar of its own: the phone stores the
// `Set-Cookie` the login response carries and replays it on every later
// request. So the mobile app sends BOTH a cookie and an Authorization header,
// and whichever readToken() prefers decides whether the CSRF rule applies.
// Preferring the cookie made every installed APK fail its writes with
// "Missing x-requested-with header" while the suite above stayed green.
//
// Preferring Bearer costs no protection: CSRF is about credentials the browser
// attaches BY ITSELF, and it never attaches Authorization. An attacker's page
// that sets one makes the request non-simple, which forces a preflight the
// exact-origin CORS allowlist refuses - and it has no valid token to send
// anyway, the web session being HttpOnly.
describe('which transport a request is credited to', () => {
  const { readToken } = require('../src/middlewares/authenticate');
  const { SESSION_COOKIE_NAME } = require('../src/utils/sessionCookie');

  test('an explicit Bearer header wins over a cookie the platform attached', () => {
    const req = {
      cookies: { [SESSION_COOKIE_NAME]: 'cookie-token' },
      headers: { authorization: 'Bearer phone-token' },
    };
    expect(readToken(req)).toEqual({ token: 'phone-token', fromCookie: false });
  });

  test('a mobile write carrying both is not a CSRF violation', () => {
    const req = {
      method: 'POST',
      cookies: { [SESSION_COOKIE_NAME]: 'cookie-token' },
      headers: { authorization: 'Bearer phone-token' },
    };
    const { fromCookie } = readToken(req);
    expect(isCsrfViolation({ method: req.method, headers: req.headers, fromCookie })).toBe(false);
  });

  test('a cookie alone is still credited to the cookie, and still needs the header', () => {
    const req = { method: 'POST', cookies: { [SESSION_COOKIE_NAME]: 'web-token' }, headers: {} };
    const { token, fromCookie } = readToken(req);
    expect({ token, fromCookie }).toEqual({ token: 'web-token', fromCookie: true });
    expect(isCsrfViolation({ method: req.method, headers: req.headers, fromCookie })).toBe(true);
  });

  test('a malformed Authorization header falls back to the cookie', () => {
    const req = {
      cookies: { [SESSION_COOKIE_NAME]: 'web-token' },
      headers: { authorization: 'Basic abc123' },
    };
    expect(readToken(req)).toEqual({ token: 'web-token', fromCookie: true });
  });

  test('no credential at all is neither', () => {
    expect(readToken({ cookies: {}, headers: {} })).toEqual({ token: null, fromCookie: false });
  });
});
