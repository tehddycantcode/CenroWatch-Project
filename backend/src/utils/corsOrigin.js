// Which browser origins may call this API.
//
// Pure and dependency-free on purpose, for the same reason workingTime.js is:
// the rules are fiddly - scheme, host and port each count, a trailing slash does
// not, and development and production deliberately differ - so they are worth
// testing exhaustively with no mocks and no running server.
//
// The trap this exists to stop: http://localhost:5173 and http://127.0.0.1:5173
// are DIFFERENT origins to a browser even though they are the same machine. A
// tool that navigates to one while CLIENT_URL names the other gets every
// authenticated request refused, while curl (which sends no Origin header) keeps
// working - so the API looks healthy and only the browser is broken.

// http(s) loopback on any port. Covers localhost, IPv4 loopback, and the
// bracketed IPv6 form a browser uses in an Origin header.
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

// CLIENT_URL / MOBILE_URL each accept a comma-separated list: a real deployment
// usually has more than one legitimate origin (an apex plus www, or a preview
// domain alongside production).
function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, '')) // a trailing slash is not part of an origin
    .filter(Boolean);
}

/**
 * Build the origin predicate for one environment.
 *
 * @param {object} env
 * @param {string} [env.clientUrl]  CLIENT_URL  (comma-separated list allowed)
 * @param {string} [env.mobileUrl]  MOBILE_URL  (comma-separated list allowed)
 * @param {string} [env.nodeEnv]    NODE_ENV; only 'production' disables loopback
 */
function createOriginChecker({ clientUrl, mobileUrl, nodeEnv } = {}) {
  const allowed = [...parseOrigins(clientUrl), ...parseOrigins(mobileUrl)];
  // Loopback is accepted everywhere EXCEPT production, where the configured
  // allowlist is the entire point of having one.
  const allowLoopback = nodeEnv !== 'production';

  function isAllowed(origin) {
    // No Origin header at all: curl, server-to-server calls, the mobile app, and
    // same-origin GETs. There is no browser to protect, so there is nothing to
    // refuse - these are governed by authentication, not by CORS.
    if (!origin) return true;
    const normalized = String(origin).replace(/\/+$/, '');
    if (allowed.includes(normalized)) return true;
    return allowLoopback && LOOPBACK_ORIGIN.test(normalized);
  }

  return { allowed, allowLoopback, isAllowed };
}

module.exports = { parseOrigins, createOriginChecker, LOOPBACK_ORIGIN };
