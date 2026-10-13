// Short-lived signed links for a resident's own report PDF.
//
// WHY THIS EXISTS
// The mobile app cannot open the authenticated report endpoint. It keeps its
// session token in expo-secure-store and sends it as a Bearer header, but a PDF
// has to be handed to the PHONE'S BROWSER to be viewed or saved, and that
// browser has neither the header nor the cookie. The alternatives were worse:
// expo-sharing is a native module, so adding it would change the EAS
// fingerprint and silently cut every installed APK off from ALL over-the-air
// updates until a new APK shipped and everyone reinstalled.
//
// So this mints the same kind of credential utils/fileToken.js already mints for
// /uploads: one thing, for a short time, that cannot be replayed as anything
// else. The clients that CAN authenticate normally are untouched - the web app
// still opens the same URL with its cookie, and this is only consulted when a
// signature is actually present.
//
// WHAT THE SIGNATURE COVERS, and why each part is in it:
//   kind + reference  - so a link for one report cannot be edited into a link
//                       for another
//   userId            - so the request still runs through the service's normal
//                       ownership check, and so the PDF and the audit row know
//                       who they were issued to. Without it the signature would
//                       be the only authorisation, with nothing behind it.
//   expiry            - signed TOGETHER with the rest, because signing the
//                       payload alone would let anyone edit `e=` to any future
//                       date.
//
// SEPARATE KEY FROM fileToken.js, derived through a different domain string: a
// file link cannot be replayed as a report link and vice versa, even though
// both ultimately derive from JWT_SECRET.
//
// The link lands in the phone browser's history and in access logs. That is the
// same trade /uploads already makes and the reason the TTL here is SHORTER than
// the one-hour file TTL: this link is opened once, immediately, by the person
// who just tapped the button.

const crypto = require('crypto');

const DEFAULT_TTL_MINUTES = 10;
const DOMAIN = 'cenrowatch:report-url:v1';

let cachedKey;

function signingKey() {
  if (cachedKey) return cachedKey;
  const explicit = process.env.REPORT_URL_SECRET;
  if (explicit) {
    cachedKey = Buffer.from(explicit, 'utf8');
    return cachedKey;
  }
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error('Signed report links need JWT_SECRET (or REPORT_URL_SECRET) to be set.');
  cachedKey = crypto.createHmac('sha256', base).update(DOMAIN).digest();
  return cachedKey;
}

function resetKeyCache() {
  cachedKey = undefined;
}

function ttlMs() {
  const minutes = Number(process.env.REPORT_URL_TTL_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_TTL_MINUTES) * 60 * 1000;
}

function sign(kind, reference, userId, expiresAt) {
  return crypto
    .createHmac('sha256', signingKey())
    .update(`${kind}\n${reference}\n${userId}\n${expiresAt}`)
    .digest('base64url');
}

/**
 * Query string granting one person one report for a few minutes.
 * @returns {string} "e=<expiry>&u=<userId>&s=<signature>"
 */
function signReport(kind, reference, userId, now = Date.now()) {
  const expiresAt = now + ttlMs();
  return `e=${expiresAt}&u=${userId}&s=${sign(kind, reference, userId, expiresAt)}`;
}

/**
 * Verify a request's ?e=&u=&s= against the report it is asking for.
 *
 * Returns { userId } on success and { reason } on failure, so the caller
 * decides the status code and the wording.
 *
 * Compared with timingSafeEqual: an HMAC comparison that short-circuits on the
 * first wrong byte leaks the correct signature one byte at a time to anyone
 * willing to measure. Same rule as fileToken.js and the email codes.
 */
function verifyReport(kind, reference, { e, u, s } = {}, now = Date.now()) {
  if (!e || !u || !s) return { reason: 'This link is missing its access token.' };

  const expiresAt = Number(e);
  const userId = Number(u);
  if (!Number.isFinite(expiresAt) || !Number.isInteger(userId) || userId <= 0) {
    return { reason: 'This link has a malformed access token.' };
  }
  if (expiresAt < now) {
    return { reason: 'This link has expired. Open the report again to get a fresh one.' };
  }

  const expected = Buffer.from(sign(kind, reference, userId, expiresAt), 'utf8');
  const given = Buffer.from(String(s), 'utf8');
  if (expected.length !== given.length) return { reason: 'This link has an invalid access token.' };
  if (!crypto.timingSafeEqual(expected, given)) return { reason: 'This link has an invalid access token.' };

  return { userId };
}

module.exports = { signReport, verifyReport, resetKeyCache, DEFAULT_TTL_MINUTES };
