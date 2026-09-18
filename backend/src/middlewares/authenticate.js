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
      },
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Account not found or deactivated.' });
    }

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = authenticate;
