// CENROWATCH — Express application setup.
// Builds and configures the app (security, CORS, logging, rate limiting,
// health check, API v1 router, 404 + error handlers) and exports it.
// The HTTP listener lives in server.js.

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const apiV1 = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { UPLOAD_ROOT } = require('./middlewares/upload');

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
// Two layers, both keyed per client IP:
//   1. A generous GLOBAL cap across the whole API — the first line of defence
//      against request floods hammering the database.
//   2. A strict cap on /auth (login, register, password reset) to blunt
//      credential stuffing / brute force. Auth requests hit both limiters.
// Limits are tunable via env so production can adjust without a code change.
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

app.use('/api/v1', apiLimiter);
app.use('/api/v1/auth', authLimiter);

// ── Uploaded files: served locally only under the local driver. Under the GCS
//    driver, files live in the bucket and are reached via signed URLs instead.
if ((process.env.STORAGE_DRIVER || 'local').toLowerCase() === 'local') {
  app.use('/uploads', express.static(UPLOAD_ROOT));
}

// ── API v1 ─────────────────────────────────────────────────
app.use('/api/v1', apiV1);

// ── 404 + error handling (must be last) ────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
