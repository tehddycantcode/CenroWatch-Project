// CENROWATCH — Express application setup.
// Builds and configures the app (security, CORS, logging, rate limiting,
// health check, API v1 router, 404 + error handlers) and exports it.
// The HTTP listener lives in server.js.

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const apiV1 = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { apiLimiter } = require('./middlewares/rateLimiters');

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
const allowedOrigins = [process.env.CLIENT_URL, process.env.MOBILE_URL].filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      // allow same-origin / non-browser tools (no origin) and known frontends
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    credentials: true,
  })
);

// ── Request logging ────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Body parsing ───────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
