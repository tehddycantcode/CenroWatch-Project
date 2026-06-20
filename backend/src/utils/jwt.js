// JWT helpers. The secret + lifetime come from the environment (never hardcoded).

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!SECRET) {
  // Fail loudly at startup rather than silently issuing unsigned/forgeable tokens.
  throw new Error('JWT_SECRET is not set. Define it in backend/.env');
}

// payload: { sub: user_id, role, email }
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
