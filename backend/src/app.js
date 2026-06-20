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

// ── Rate limiting on auth routes (10 req / 15 min / IP) ─────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/v1/auth', authLimiter);

// ── Uploaded files (local-disk storage stub) ──────────────
app.use('/uploads', express.static(UPLOAD_ROOT));

// ── API v1 ─────────────────────────────────────────────────
app.use('/api/v1', apiV1);

// ── 404 + error handling (must be last) ────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
