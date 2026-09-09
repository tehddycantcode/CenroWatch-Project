// Rate limiting (DDoS / abuse mitigation). Every limiter is keyed per client
// IP, so read each one as "per IP, per window".
//
//   1. apiLimiter    — a generous GLOBAL cap across the whole API. First line
//                      of defence against request floods hammering the DB.
//   2. authLimiter   — a strict cap on login/register, the two endpoints where
//                      an ANONYMOUS caller can guess a credential.
//   3. resetLimiter  — a tight cap on the password-reset pair, which send mail
//                      and consume single-use tokens.
//   4. fileLimiter   — covers /uploads, which is mounted outside /api/v1 and so
//                      is not reached by apiLimiter at all.
//
// WHY THE AUTH CAP IS NOT MOUNTED BLANKET ON /auth ANYMORE:
// it used to be `app.use('/api/v1/auth', authLimiter)`, which charged the
// strict budget for GET /auth/me as well - a call every page load and every
// app boot makes. Residents sharing one public address (a barangay hall, a
// school, a household, campus Wi-Fi: all NAT to a single IP) drained the
// window just by opening the app, and the 8th person got a 429 on a screen
// they had done nothing wrong on. The rest of /auth sits behind `authenticate`,
// so the caller already holds a valid token and there is no credential left to
// guess; the one guessable secret among them - the six-digit confirmation code
// - is capped per token by MAX_ATTEMPTS in emailVerification.service.js, a
// per-account brake an IP counter cannot replicate anyway. Those routes fall
// under apiLimiter with the rest of the API.

const rateLimit = require('express-rate-limit');

const message = { success: false, message: 'Too many requests, please try again later.' };
const WINDOW_MS = 15 * 60 * 1000;

const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || WINDOW_MS,
  limit: Number(process.env.RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

// Only FAILED attempts count (skipSuccessfulRequests). A brute-forcer burns
// the budget in seconds because every guess is a 401; a hall full of residents
// signing in correctly costs nothing, no matter how many share the IP. That is
// the distinction an IP counter alone cannot draw, and the reason this cap can
// stay low enough to be worth having.
const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

// Counts EVERY request, unlike authLimiter. forgot-password answers 200 for an
// unknown address on purpose (anti-enumeration), so skipping successes here
// would leave it unmetered - and each call sends an email, which makes it a
// mail-bomb vector aimed at whatever address the attacker types.
const resetLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: Number(process.env.RESET_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

// /uploads sits outside /api/v1 because the "/uploads/..." shape is stored in
// photo_path and hard-coded in both clients' fileUrl helpers, so apiLimiter
// never sees it. Without this the file route is the one unmetered endpoint in
// the app. The cap is high because one report detail page can pull several
// photos, and a signed link is already scoped to a single file.
const fileLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: Number(process.env.FILE_RATE_LIMIT_MAX) || 600,
  standardHeaders: true,
  legacyHeaders: false,
  message,
});

module.exports = { apiLimiter, authLimiter, resetLimiter, fileLimiter };
