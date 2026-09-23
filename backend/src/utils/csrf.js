// Cross-site request forgery: the second line, behind SameSite.
//
// SameSite=Lax on the session cookie is the primary defence, and while the web
// app and the API sit on one registrable domain it is enough. Deployed on the
// platforms' free subdomains they are different registrable domains, the cookie
// has to be SESSION_COOKIE_SAMESITE=none to work at all, and that protection is
// gone (see DEPLOYMENT.md Part 0).
//
// What is actually exposed then is narrower than "everything". Every JSON
// endpoint sends Content-Type: application/json, which is not a "simple"
// request, so the browser preflights it and the exact-origin CORS allowlist
// refuses the attacker. The gap is multipart/form-data: file uploads ARE simple
// requests, they skip the preflight, and the six upload routes could therefore
// be driven cross-site with a signed-in user's cookie attached - filing reports
// in their name.
//
// Requiring a custom header closes that without needing a domain at all. A
// cross-site page cannot add a header to a simple request; adding one makes the
// request non-simple, which triggers a preflight, which CORS refuses. The header
// needs no secret and no per-session token: its mere presence is the proof,
// because the browser will not let an attacker set it.
//
// Scoped to COOKIE-authenticated writes deliberately. The mobile app sends
// `Authorization: Bearer`, which a browser never attaches on its own, so there
// is no forgery to prevent - and enforcing it there would break every installed
// APK, which an over-the-air update cannot fix quickly.

const CSRF_HEADER = 'x-requested-with';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isCsrfViolation({ method, headers, fromCookie }) {
  if (!fromCookie) return false;
  if (SAFE_METHODS.has(String(method || '').toUpperCase())) return false;

  // Express lowercases incoming header names, but this is called with plain
  // objects in tests and could be called with a raw map elsewhere, so match
  // case-insensitively rather than trusting the caller.
  const bag = headers || {};
  const key = Object.keys(bag).find((k) => k.toLowerCase() === CSRF_HEADER);
  const value = key ? String(bag[key]).trim() : '';
  return value === '';
}

module.exports = { isCsrfViolation, CSRF_HEADER };
