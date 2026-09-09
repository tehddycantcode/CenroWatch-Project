// Field-level encryption at rest (AES-256-GCM).
//
// WHAT THIS IS FOR, AND WHAT IT IS NOT FOR
// This protects personal data in the DATABASE - a stolen dump, a backup file
// left on a laptop, a hosting provider's snapshot. It does nothing against an
// attacker who already has the running app and the key, and it is NOT a
// replacement for access control. R.A. 10173 asks for reasonable safeguards on
// personal information; this is the at-rest half of that answer.
//
// WHY AES-256-GCM AND NOT A HASH
// These values have to come BACK - staff ring the reporter's number, the PDF
// prints the address. That is encryption's job, not hashing's. Passwords are
// the opposite case and stay with bcrypt: see utils/password.js and
// docs/SECURITY.md for why that is deliberate rather than an oversight.
//
// GCM, not CBC, because it is authenticated: the 16-byte tag means a modified
// ciphertext FAILS to decrypt instead of quietly producing different plaintext.
// Someone with write access to the database cannot flip a digit in a phone
// number and have the system serve it as truth.
//
// THE COST, STATED PLAINLY: a fresh random IV per call means encrypting the
// same phone number twice produces two different ciphertexts. That is required
// for security (a deterministic scheme leaks which rows share a value), and it
// is exactly why an encrypted column can never be searched, sorted, joined or
// made @unique. Only fields that are written and displayed - never queried -
// may be encrypted here. utils/prismaEncryption.js enforces that.

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96 bits - the size GCM is specified and optimised for
const KEY_BYTES = 32; // AES-256
const PREFIX = 'enc:v1:';

// Envelope: enc:v1:<iv>:<tag>:<ciphertext>, all base64.
// The version segment is what makes a future key rotation or algorithm change
// possible: a v2 reader can still decrypt v1 rows instead of the whole column
// becoming unreadable on the day the format changes.
const SEPARATOR = ':';

let cachedKey;
let warnedMissing = false;

// Reads FIELD_ENCRYPTION_KEY as 64 hex characters (32 bytes).
//
// Returns null when unset rather than throwing, so a teammate who pulls this
// branch without updating their .env gets a working app and a loud warning
// instead of a server that will not boot. In production that trade flips - an
// unset key there is a silent privacy failure, so boot fails instead.
function getKey() {
  if (cachedKey !== undefined) return cachedKey;

  const raw = (process.env.FIELD_ENCRYPTION_KEY || '').trim();

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FIELD_ENCRYPTION_KEY is required in production. Generate one with:\n' +
          '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    if (!warnedMissing && process.env.NODE_ENV !== 'test') {
      warnedMissing = true;
      console.warn(
        '[crypto] FIELD_ENCRYPTION_KEY is not set - contact numbers, reporter details\n' +
          '         and addresses are being stored in PLAINTEXT. Set it in backend/.env.'
      );
    }
    cachedKey = null;
    return cachedKey;
  }

  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    // A truncated or quoted key is the failure that would otherwise show up as
    // "Invalid key length" from deep inside node:crypto on the first report
    // someone files, so name the actual problem here.
    throw new Error(
      `FIELD_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes); got ${raw.length}. ` +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  cachedKey = Buffer.from(raw, 'hex');
  if (cachedKey.length !== KEY_BYTES) throw new Error('FIELD_ENCRYPTION_KEY did not decode to 32 bytes.');
  return cachedKey;
}

// Test seam. The key is cached because getKey() runs on every field of every
// row; without this, a test that sets a different key would keep the first one.
function resetKeyCache() {
  cachedKey = undefined;
  warnedMissing = false;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

// Encrypt one string. null/undefined/'' pass through unchanged so a nullable
// column stays nullable - encrypting "no value recorded" into 100 bytes of
// ciphertext would make every empty field look populated.
//
// An already-encrypted value passes through too. That is what makes the whole
// scheme idempotent: re-saving a row that was read from the database cannot
// double-encrypt it, and the backfill script can be run twice.
function encrypt(value) {
  if (value === null || value === undefined || value === '') return value;
  if (typeof value !== 'string') return value;
  if (isEncrypted(value)) return value;

  const key = getKey();
  if (!key) return value; // dev without a key: stored as plaintext, warned above

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + [iv, tag, ciphertext].map((b) => b.toString('base64')).join(SEPARATOR);
}

// Decrypt one value. Anything without the envelope is returned as-is, which is
// what lets encrypted and not-yet-encrypted rows coexist in the same column
// during (and after) the backfill.
//
// A value that IS enveloped but fails to decrypt THROWS, deliberately. The two
// causes are a wrong key and a tampered row, and both are emergencies: silently
// returning the ciphertext would put "enc:v1:AAAA..." in front of a staff member
// as if it were a phone number, and silently returning null would look like the
// resident never gave one.
function decrypt(value) {
  if (!isEncrypted(value)) return value;

  const key = getKey();
  if (!key) {
    throw new Error(
      'Encrypted data found but FIELD_ENCRYPTION_KEY is not set. ' +
        'The value cannot be read without the key it was written with.'
    );
  }

  const parts = value.slice(PREFIX.length).split(SEPARATOR);
  if (parts.length !== 3) throw new Error('Encrypted value is malformed (expected iv:tag:ciphertext).');

  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // node:crypto's own message here is "Unsupported state or unable to
    // authenticate data", which names neither cause.
    throw new Error(
      'Could not decrypt a stored value: the authentication tag did not verify. ' +
        'Either FIELD_ENCRYPTION_KEY is not the key this row was written with, or the row was modified.'
    );
  }
}

function isConfigured() {
  return Boolean(getKey());
}

module.exports = { encrypt, decrypt, isEncrypted, isConfigured, resetKeyCache, PREFIX };
