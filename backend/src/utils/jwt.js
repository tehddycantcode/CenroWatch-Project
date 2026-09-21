// JWT helpers. The secret + lifetime come from the environment (never hardcoded).

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  // Fail loudly at startup rather than silently issuing unsigned/forgeable tokens.
  throw new Error('JWT_SECRET is not set. Define it in backend/.env');
}

// Read at call time, not at module load: the tests set these per case, and a
// constant captured on require would freeze whatever happened to be in the
// environment when the first file imported this.
const longExpiry = () => process.env.JWT_EXPIRES_IN || '7d';

// The lifetime for a session where the person declined "remember me". Killing
// the cookie is not enough on its own - a token copied off a shared machine
// stays valid for its full lifetime whatever the browser did with its cookie
// jar - so the token itself has to be short-lived.
const shortExpiry = () => process.env.JWT_SHORT_EXPIRES_IN || '12h';

// payload: { sub: user_id, role, email, rem }
function signToken(payload, { remember = true } = {}) {
  return jwt.sign(payload, SECRET, { expiresIn: remember ? longExpiry() : shortExpiry() });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
