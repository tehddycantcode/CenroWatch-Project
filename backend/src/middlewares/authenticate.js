// Authentication middleware. Verifies the JWT, loads the user from the DB (so
// deactivated accounts are rejected immediately), and attaches a safe user
// object to req.user — never the password hash.
//
// TWO CLIENTS, TWO TRANSPORTS. The web app is authenticated by the HttpOnly
// `cenrowatch_token` cookie, which JavaScript cannot read and therefore cannot
// leak to an XSS. The mobile app has no cookie jar to rely on: it keeps its
// token in the OS keychain and sends `Authorization: Bearer ...`. Both are the
// same signed JWT, so the cookie is simply preferred when present.

const prisma = require('../utils/prisma');
const { verifyToken } = require('../utils/jwt');
const { SESSION_COOKIE_NAME } = require('../utils/sessionCookie');

function readToken(req) {
  const fromCookie = req.cookies?.[SESSION_COOKIE_NAME];
  if (fromCookie) return fromCookie;
  const [scheme, bearer] = (req.headers.authorization || '').split(' ');
  return scheme === 'Bearer' && bearer ? bearer : null;
}

async function authenticate(req, res, next) {
  try {
    const token = readToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not signed in.',
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
