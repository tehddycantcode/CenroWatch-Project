// Authentication middleware. Verifies the Bearer JWT, loads the user from the
// DB (so deactivated accounts are rejected immediately), and attaches a safe
// user object to req.user — never the password hash.

const prisma = require('../utils/prisma');
const { verifyToken } = require('../utils/jwt');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Missing or malformed Authorization header.',
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
