// Authentication middleware. Verifies the JWT, loads the user from the DB (so
// deactivated accounts are rejected immediately), and attaches a safe user
// object to req.user — never the password hash.
//
// TWO CLIENTS, TWO TRANSPORTS. The web app is authenticated by the HttpOnly
// `cenrowatch_token` cookie, which JavaScript cannot read and therefore cannot
// leak to an XSS. The mobile app keeps its token in the OS keychain and sends
// `Authorization: Bearer ...`. Both are the same signed JWT.
//
// This used to say the mobile app "has no cookie jar to rely on" and preferred
// the cookie whenever one was present. That was wrong, and it broke every
// installed APK's writes. React Native's networking layer on Android is OkHttp,
// which keeps a cookie jar of its own: the phone stores the `Set-Cookie` that
// login returns and replays it forever after. So a mobile request arrives
// carrying BOTH, the cookie won, the request was credited to the cookie, and
// the CSRF rule then demanded an `x-requested-with` header the app has no
// reason to send - answering "Missing x-requested-with header" to every report
// submission and every resend-code.

const prisma = require('../utils/prisma');
const { verifyToken } = require('../utils/jwt');
const { SESSION_COOKIE_NAME } = require('../utils/sessionCookie');
const { isCsrfViolation, CSRF_HEADER } = require('../utils/csrf');

// Returns the token AND where it came from. The source matters: a cookie is
// attached by the browser automatically, which is what makes CSRF possible, and
// a Bearer header never is. See utils/csrf.js.
//
// BEARER IS CHECKED FIRST, on purpose. A client that sets an Authorization
// header did so deliberately, so the request is not riding on ambient
// credentials and CSRF does not apply to it. That costs no protection: a
// browser never attaches Authorization by itself, and a cross-site page that
// sets one makes the request non-simple, which forces a preflight the
// exact-origin CORS allowlist refuses - besides which it has no valid token to
// send, the web session being HttpOnly and unreadable from JavaScript.
// A request carrying only a cookie is still credited to the cookie and still
// has to prove itself with the custom header.
function readToken(req) {
  const [scheme, bearer] = (req.headers?.authorization || '').split(' ');
  if (scheme === 'Bearer' && bearer) return { token: bearer, fromCookie: false };
  const cookie = req.cookies?.[SESSION_COOKIE_NAME];
  return cookie ? { token: cookie, fromCookie: true } : { token: null, fromCookie: false };
}

async function authenticate(req, res, next) {
  try {
    const { token, fromCookie } = readToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not signed in.',
      });
    }

    // Checked before the token is even verified: a forged request should be
    // refused on its shape, not on whose session it managed to ride in on.
    if (isCsrfViolation({ method: req.method, headers: req.headers, fromCookie })) {
      return res.status(403).json({
        success: false,
        message: `Missing ${CSRF_HEADER} header. Browser clients must send it on writes.`,
      });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }

    const user = await prisma.user.findUnique({
      where: { user_id: payload.sub },
      select: {
        user_id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        barangay_id: true,
        is_active: true,
        password_changed_at: true,
      },
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Account not found or deactivated.' });
    }

    // A JWT carries no link to the password it was issued under, so changing a
    // password would otherwise leave every other device signed in for the rest
    // of JWT_EXPIRES_IN - the phone keeps working for up to a week after the
    // owner locks the account down. Refusing tokens older than the change is
    // what turns "change my password" into "sign my other devices out".
    //
    // COMPARE IN WHOLE SECONDS. `iat` is a UNIX timestamp in SECONDS, while
    // password_changed_at keeps milliseconds. Comparing them directly rejects
    // the replacement token too: it is minted microseconds AFTER the change, but
    // its iat truncates down to the start of that second, so it looks older than
    // the change and the user is signed out of the device they just used. Taking
    // the floor of both and rejecting only when the change is in a LATER second
    // leaves a sub-second window in which a token survives, which is the right
    // trade against logging someone out of their own session.
    if (user.password_changed_at) {
      const changedAtSec = Math.floor(user.password_changed_at.getTime() / 1000);
      if (changedAtSec > (payload.iat ?? 0)) {
        return res.status(401).json({
          success: false,
          message: 'Your password was changed. Please sign in again.',
        });
      }
    }

    delete user.password_changed_at; // never needed downstream; keep req.user lean

    req.user = user;
    // Properties of the SESSION rather than the person, kept separate from
    // req.user for that reason. changePassword re-issues a token and needs to
    // know what was chosen at login; a token minted before this claim existed
    // has no `rem`, which reads as remembered so live sessions are unaffected.
    req.session = { remember: payload.rem !== false };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticate;
// Exposed for the CSRF regression test: which transport a request is credited
// to is the thing that broke, and it cannot be asserted through the middleware
// without a database.
module.exports.readToken = readToken;
