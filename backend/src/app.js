// CENROWATCH — Express application setup.
// Builds and configures the app (security, CORS, logging, rate limiting,
// health check, API v1 router, 404 + error handlers) and exports it.
// The HTTP listener lives in server.js.

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const apiV1 = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { apiLimiter } = require('./middlewares/rateLimiters');
const { createOriginChecker } = require('./utils/corsOrigin');

const app = express();

// ── Trust proxy (correct client IP for rate limiting) ──────
// In production the app sits behind a reverse proxy / load balancer (nginx,
// Cloud Run, etc.). Without this, req.ip is the proxy's IP, so every client
// shares one rate-limit bucket. Set TRUST_PROXY to the number of proxy hops
// (e.g. 1). Off by default for direct/local runs. NEVER hard-code `true`:
// that trusts a client-supplied X-Forwarded-For and lets attackers spoof their
// IP to bypass the per-IP limits below.
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp);
}

// ── Security headers ───────────────────────────────────────
// crossOriginResourcePolicy 'cross-origin' lets the web/mobile clients embed
// images served from /uploads (a different origin than the frontends).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ── CORS (only known frontends) ────────────────────────────
// The rules live in utils/corsOrigin.js so they can be unit-tested without a
// server: a browser's "origin" is scheme + host + port as ONE identity, so
// http://localhost:5173 and http://127.0.0.1:5173 are different origins despite
// being one machine. CLIENT_URL and MOBILE_URL each accept a comma-separated
// list; loopback is additionally allowed outside production.
const corsOrigin = createOriginChecker({
  clientUrl: process.env.CLIENT_URL,
  mobileUrl: process.env.MOBILE_URL,
  nodeEnv: process.env.NODE_ENV,
});

// A production deployment with no configured origin cannot serve the web app at
// all: every browser call fails CORS while curl and the mobile app (which send
// no Origin) keep working, so it looks like "only the website is broken".
if (process.env.NODE_ENV === 'production' && corsOrigin.allowed.length === 0) {
  console.warn('[cors] CLIENT_URL is not set — every browser request from the web app will be refused.');
}

app.use(
  cors({
    origin(origin, callback) {
      if (corsOrigin.isAllowed(origin)) return callback(null, true);
      // 403, not 500. Without an explicit status the error handler falls through
      // to `|| 500`, so a browser hitting the API from an origin that is merely
      // missing from CLIENT_URL gets "Internal Server Error" - which reads as a
      // crashed server and sends whoever is debugging to the database and the
      // logs. It is a client-side mismatch, and the status should say so.
      const err = new Error(`CORS: origin not allowed: ${origin}`);
      err.status = 403;
      return callback(err);
    },
    // Required, not optional: the web session is an HttpOnly cookie, so the
    // browser only attaches it when the response says credentials are allowed.
    // With credentials the reply must name one concrete origin - `*` is refused
    // by the browser - which is why the callback above reflects the caller's
    // origin rather than allowing everything.
    credentials: true,
    // Cache the preflight so a burst of writes does not send an OPTIONS before
    // each one. cors() answers OPTIONS itself and stops, so preflights never
    // reach the rate limiter mounted further down.
    maxAge: 600,
  })
);

// ── Request logging ────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Body parsing ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Cookies ────────────────────────────────────────────────
// Populates req.cookies so authenticate.js can read the web app's HttpOnly
// session cookie. Unsigned on purpose: the value is a JWT, which already
// carries its own signature — a cookie signature would only duplicate it.
app.use(cookieParser());

// ── Health check (no DB dependency) ────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: process.env.APP_NAME || 'CENROWATCH',
    office: process.env.OFFICE || 'CENRO Cabuyao',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ── Rate limiting (DDoS / abuse mitigation) ────────────────
// The generous global cap covers the whole API. The strict credential and
// password-reset caps are applied route by route in auth.routes.js rather than
// blanket on /auth — see the header of middlewares/rateLimiters.js for why
// that distinction is the thing that keeps shared-IP residents out of a 429.
app.use('/api/v1', apiLimiter);

// ── Uploaded files ─────────────────────────────────────────
// Served locally only under the local driver; under the GCS driver the files
// live in a private bucket and are reached via V4 signed URLs instead.
//
// This was `express.static(UPLOAD_ROOT)` until Phase 4. That served every
// complaint photo, wildlife photo, chain-of-custody photo and request document
// to anybody who had the path - and since the local driver's fileUrl() was a
// pass-through, the path stored in the database WAS that public URL. No
// session, no expiry, no rate limit; the only obstacle was guessing 48 bits of
// filename. The route below requires a signed, expiring token for the exact
// file, which is the same contract the GCS driver already enforced.
if ((process.env.STORAGE_DRIVER || 'local').toLowerCase() === 'local') {
  app.use('/uploads', require('./routes/uploads.routes'));
}

// ── API v1 ─────────────────────────────────────────────────
app.use('/api/v1', apiV1);

// ── 404 + error handling (must be last) ────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
