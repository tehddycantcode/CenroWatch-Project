// Session cookie — the web client's copy of the JWT.
//
// WHY A COOKIE AND NOT localStorage: anything stored in localStorage is
// readable by any JavaScript running on the page, so a single XSS anywhere in
// the web app can read a signed-in staff or Admin token and replay it. An
// HttpOnly cookie is not exposed to JavaScript at all, so the same XSS cannot
// exfiltrate the session.
//
// The mobile app does NOT use this. Expo stores its token in the OS keychain
// (expo-secure-store) and sends `Authorization: Bearer ...`, which
// middlewares/authenticate.js still accepts. That is why login/register keep
// returning `token` in the JSON body as well as setting this cookie.

const NAME = 'cenrowatch_token';

// Lifetime of the cookie must track the JWT's own lifetime, or the browser
// keeps sending a token the server will only reject. Parses the same
// JWT_EXPIRES_IN the token is signed with ("7d", "12h", "30m", "3600").
const MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
function maxAgeMs() {
  const raw = String(process.env.JWT_EXPIRES_IN || '7d').trim();
  const m = /^(\d+)\s*([smhd])?$/i.exec(raw);
  if (!m) return 7 * MS.d;
  return Number(m[1]) * (m[2] ? MS[m[2].toLowerCase()] : MS.s);
}

// SameSite=Lax is the CSRF defence: the browser will not attach this cookie to
// a cross-site POST/PATCH/DELETE, so another site cannot make a state-changing
// call with the resident's session. Lax is enough because the web app and the
// API are the same site (localhost in dev; sibling hosts under one domain in
// deployment). Deploying them on genuinely different registrable domains needs
// SESSION_COOKIE_SAMESITE=none, which REQUIRES https (Secure) and gives up that
// CSRF protection — hence the explicit opt-in rather than a silent default.
function options({ remember = true } = {}) {
  const sameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
  const base = {
    httpOnly: true,                                    // unreadable from JavaScript
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    path: '/',
  };
  // No maxAge at all when "remember me" was declined. A cookie with no expiry
  // is a SESSION cookie: the browser drops it when the window closes, which is
  // the behaviour someone signing in on a shared machine is asking for. Setting
  // maxAge: 0 would not do this - it would delete the cookie immediately.
  //
  // This half only covers the browser. The token is separately signed with a
  // short life (see utils/jwt.js), because a token copied off that machine
  // outlives the cookie jar it came from.
  return remember ? { ...base, maxAge: maxAgeMs() } : base;
}

function setSessionCookie(res, token, remember = true) {
  res.cookie(NAME, token, options({ remember: remember !== false }));
}

// Same attributes minus maxAge — a browser only drops a cookie when the
// clearing one matches on name, path, domain, secure and sameSite.
function clearSessionCookie(res) {
  const { maxAge, ...rest } = options();
  res.clearCookie(NAME, rest);
}

module.exports = { SESSION_COOKIE_NAME: NAME, setSessionCookie, clearSessionCookie };
