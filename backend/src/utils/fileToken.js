// Signed, expiring links for locally stored uploads.
//
// THE HOLE THIS CLOSES
// /uploads used to be `express.static(UPLOAD_ROOT)` - no authenticate, no
// authorize, no rate limit. Because the local driver's fileUrl() is a
// pass-through, the stored photo_path IS the public URL, so every complaint
// photo, wildlife photo, chain-of-custody photo and request document was
// retrievable by anyone who had (or guessed) the path, with no session at all.
// The only thing standing in the way was 48 bits of filename randomness. These
// are photographs of people's houses and neighbours attached to a named
// complaint, so that is a R.A. 10173 problem, not a theoretical one.
//
// WHY A SIGNED URL AND NOT `authenticate` ON THE ROUTE
// The clients render these with <img src=...> and React Native <Image>. Neither
// can attach an Authorization header, so a Bearer-token middleware on /uploads
// would simply break every image in the web and mobile apps. Putting the JWT in
// the query string instead would be worse: it would copy a long-lived session
// credential into browser history, Referer headers and every access log.
//
// So this mints a short-lived credential that grants exactly one thing: read
// this one file, until this timestamp. It cannot be replayed against a
// different file, cannot be extended, and expires on its own. That is precisely
// what the GCS driver already does with V4 signed URLs, so both storage drivers
// now enforce the same rule and switching STORAGE_DRIVER changes nothing about
// who can read what.
//
// The signature covers the path AND the expiry together. Signing only the path
// would let anyone edit `e=` to any future date; signing only the expiry would
// let a token for one file be pasted onto another.

const crypto = require('crypto');

const DEFAULT_TTL_MINUTES = 60; // matches gcs.driver.js SIGNED_URL_TTL_MS
const DOMAIN = 'cenrowatch:file-url:v1';

let cachedKey;

// The signing key is derived from JWT_SECRET rather than being a second secret
// to configure. Deriving it through HMAC gives domain separation: this key
// cannot be used to mint a session token and a session token cannot be used to
// sign a file URL, even though there is one secret in .env. Set FILE_URL_SECRET
// to use an independent one.
function signingKey() {
  if (cachedKey) return cachedKey;

  const explicit = process.env.FILE_URL_SECRET;
  if (explicit) {
    cachedKey = Buffer.from(explicit, 'utf8');
    return cachedKey;
  }

  const base = process.env.JWT_SECRET;
  if (!base) throw new Error('Signed upload URLs need JWT_SECRET (or FILE_URL_SECRET) to be set.');
  cachedKey = crypto.createHmac('sha256', base).update(DOMAIN).digest();
  return cachedKey;
}

function resetKeyCache() {
  cachedKey = undefined;
}

function ttlMs() {
  const minutes = Number(process.env.FILE_URL_TTL_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_TTL_MINUTES) * 60 * 1000;
}

// base64url so the value survives a query string without percent-encoding.
function sign(relPath, expiresAt) {
  return crypto
    .createHmac('sha256', signingKey())
    .update(`${relPath}\n${expiresAt}`)
    .digest('base64url');
}

// Returns "<relPath>?e=<expiry>&s=<signature>" for a path relative to the
// uploads root (e.g. "complaints/1757-ab12.jpg").
function signPath(relPath, now = Date.now()) {
  const expiresAt = now + ttlMs();
  return `${relPath}?e=${expiresAt}&s=${sign(relPath, expiresAt)}`;
}

// Verifies a request's ?e=&s= against the path. Returns a reason string on
// failure and null on success, so the caller decides the status code.
//
// Compared with timingSafeEqual, like the email-confirmation codes. An HMAC
// comparison that short-circuits on the first wrong byte leaks the correct
// signature one byte at a time to anyone willing to measure.
function verifyPath(relPath, { e, s } = {}, now = Date.now()) {
  if (!e || !s) return 'This link is missing its access token.';

  const expiresAt = Number(e);
  if (!Number.isFinite(expiresAt)) return 'This link has a malformed access token.';
  if (expiresAt < now) return 'This link has expired. Reopen the report to get a fresh one.';

  const expected = Buffer.from(sign(relPath, expiresAt), 'utf8');
  const given = Buffer.from(String(s), 'utf8');
  if (expected.length !== given.length) return 'This link has an invalid access token.';
  if (!crypto.timingSafeEqual(expected, given)) return 'This link has an invalid access token.';

  return null;
}

module.exports = { signPath, verifyPath, resetKeyCache, DEFAULT_TTL_MINUTES };
