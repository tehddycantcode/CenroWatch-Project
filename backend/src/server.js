// CENROWATCH — HTTP server entry point.
require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 5000;

// NODE_ENV gates a lot more than logging here, and the failure mode worth
// guarding is deploying WITHOUT setting it. Every one of these protections sits
// inside an `if (NODE_ENV === 'production')`, so not one of them can warn about
// its own absence - the server comes up looking perfectly healthy with all of
// them off. This is the only place that can say so.
function warnIfNotProduction() {
  const env = process.env.NODE_ENV;
  if (env === 'production' || env === 'test') return;
  console.warn('');
  console.warn(env ? `NODE_ENV is "${env}", not "production". These are OFF:` : 'NODE_ENV is UNSET, so production protections are OFF:');
  console.warn('  - the session cookie has no Secure flag and will travel over plain HTTP');
  console.warn('  - error responses include stack traces, to any caller');
  console.warn('  - a missing FIELD_ENCRYPTION_KEY only warns; personal fields then store as PLAINTEXT');
  console.warn('  - CORS accepts loopback origins');
  console.warn('  Set NODE_ENV=production before deploying.');
  console.warn('');
}

const server = app.listen(PORT, () => {
  console.log(`CENROWATCH API listening on http://localhost:${PORT}`);
  console.log(`Health check:  http://localhost:${PORT}/api/health`);
  console.log(`API root:      http://localhost:${PORT}/api/v1`);
  warnIfNotProduction();
});

// Graceful shutdown
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(() => process.exit(0));
  });
}

module.exports = server;
