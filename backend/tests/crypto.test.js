// Field encryption (AES-256-GCM). Pure - no Prisma, no mocks.
//
// The cases that matter here are the ones that would let encryption LOOK like
// it is working while it is not: a value that silently passes through
// unencrypted, a tampered ciphertext that decrypts to something plausible, and
// a second encryption of an already-encrypted value producing an unreadable
// double envelope.

const crypto = require('crypto');
const {
  encrypt,
  decrypt,
  isEncrypted,
  isConfigured,
  resetKeyCache,
  PREFIX,
} = require('../src/utils/crypto.util');

const KEY_A = 'a'.repeat(64);
const KEY_B = crypto.randomBytes(32).toString('hex');

function withKey(key, fn) {
  const previous = process.env.FIELD_ENCRYPTION_KEY;
  process.env.FIELD_ENCRYPTION_KEY = key;
  resetKeyCache();
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
    else process.env.FIELD_ENCRYPTION_KEY = previous;
    resetKeyCache();
  }
}

beforeEach(() => {
  process.env.FIELD_ENCRYPTION_KEY = KEY_A;
  resetKeyCache();
});

afterAll(() => {
  delete process.env.FIELD_ENCRYPTION_KEY;
  resetKeyCache();
});

describe('round trip', () => {
  test.each([
    ['a phone number', '09171234567'],
    ['a full name', 'Juan Miguel dela Cruz-Santos'],
    ['a street address', '12 Mabini St, Purok 3, near the covered court'],
    ['non-ASCII', 'Peñafrancia Ñuñez — Bañaderos'],
    ['a single character', 'x'],
    ['a long value', 'A'.repeat(255)],
  ])('%s survives encrypt -> decrypt', (_label, value) => {
    expect(decrypt(encrypt(value))).toBe(value);
  });

  test('the ciphertext does not contain the plaintext', () => {
    expect(encrypt('09171234567')).not.toContain('09171234567');
  });

  test('output carries the version envelope', () => {
    const out = encrypt('09171234567');
    expect(out.startsWith(PREFIX)).toBe(true);
    expect(isEncrypted(out)).toBe(true);
    // enc:v1:<iv>:<tag>:<ciphertext>
    expect(out.slice(PREFIX.length).split(':')).toHaveLength(3);
  });
});

describe('non-determinism', () => {
  // This is the property that makes an encrypted column unsearchable and
  // un-@unique-able. If it ever became false, the ciphertext would leak which
  // rows share a value - and someone would inevitably "fix" the search by
  // encrypting the search term.
  test('the same input encrypts differently every time', () => {
    const outputs = new Set(Array.from({ length: 20 }, () => encrypt('09171234567')));
    expect(outputs.size).toBe(20);
  });

  test('but every one of them decrypts back to the same value', () => {
    for (let i = 0; i < 20; i += 1) expect(decrypt(encrypt('09171234567'))).toBe('09171234567');
  });
});

describe('pass-through values', () => {
  // Encrypting "no value recorded" into 100 bytes of ciphertext would make
  // every empty optional field look populated.
  test.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('%s is left alone', (_label, value) => {
    expect(encrypt(value)).toBe(value);
    expect(decrypt(value)).toBe(value);
  });

  test('non-strings are left alone', () => {
    const date = new Date();
    expect(encrypt(42)).toBe(42);
    expect(encrypt(date)).toBe(date);
  });

  // The property that lets encrypted and not-yet-encrypted rows coexist in one
  // column while the backfill runs - and after it, for rows written before.
  test('plaintext read back decrypts to itself', () => {
    expect(decrypt('09171234567')).toBe('09171234567');
  });
});

describe('idempotency', () => {
  // Without this, re-saving a row that was read from the database would wrap it
  // a second time, and the backfill could not safely be run twice.
  test('encrypting an already-encrypted value is a no-op', () => {
    const once = encrypt('09171234567');
    expect(encrypt(once)).toBe(once);
    expect(decrypt(encrypt(once))).toBe('09171234567');
  });
});

describe('tamper detection', () => {
  // The reason for GCM over CBC: someone with write access to the database must
  // not be able to alter a stored value and have the app serve the result as
  // truth. The auth tag turns that into a hard failure.
  test('a modified ciphertext throws instead of decrypting', () => {
    const good = encrypt('09171234567');
    const [prefix, iv, tag, ct] = [PREFIX, ...good.slice(PREFIX.length).split(':')];
    const flipped = Buffer.from(ct, 'base64');
    flipped[0] ^= 0xff;
    const bad = `${prefix}${iv}:${tag}:${flipped.toString('base64')}`;

    expect(() => decrypt(bad)).toThrow(/authentication tag did not verify/);
  });

  test('a modified auth tag throws', () => {
    const good = encrypt('09171234567');
    const [iv, tag, ct] = good.slice(PREFIX.length).split(':');
    const flipped = Buffer.from(tag, 'base64');
    flipped[0] ^= 0xff;

    expect(() => decrypt(`${PREFIX}${iv}:${flipped.toString('base64')}:${ct}`)).toThrow(
      /authentication tag did not verify/
    );
  });

  test('a malformed envelope throws rather than returning garbage', () => {
    expect(() => decrypt(`${PREFIX}onlyonepart`)).toThrow(/malformed/);
  });
});

describe('key handling', () => {
  // The wrong-key case is the one that would otherwise surface as node:crypto's
  // "Unsupported state or unable to authenticate data", which names no cause.
  test('the wrong key cannot read a value', () => {
    const sealed = withKey(KEY_A, () => encrypt('09171234567'));
    expect(() => withKey(KEY_B, () => decrypt(sealed))).toThrow(/FIELD_ENCRYPTION_KEY is not the key/);
  });

  test('a key of the wrong length is rejected by name', () => {
    expect(() => withKey('tooshort', () => encrypt('x'))).toThrow(/exactly 64 hex characters/);
  });

  test('a non-hex key is rejected', () => {
    expect(() => withKey('z'.repeat(64), () => encrypt('x'))).toThrow(/64 hex characters/);
  });

  test('with no key set, encrypt passes through and isConfigured is false', () => {
    withKey('', () => {
      expect(isConfigured()).toBe(false);
      expect(encrypt('09171234567')).toBe('09171234567');
    });
  });

  // Reading an encrypted row without the key must be loud. Returning the
  // ciphertext would put "enc:v1:AAAA..." in front of staff as a phone number;
  // returning null would look like the resident never gave one.
  test('with no key set, decrypting an encrypted value throws', () => {
    const sealed = encrypt('09171234567');
    withKey('', () => {
      expect(() => decrypt(sealed)).toThrow(/cannot be read without the key/);
    });
  });
});

describe('isEncrypted', () => {
  test.each([
    ['plaintext', '09171234567', false],
    ['empty', '', false],
    ['null', null, false],
    ['a number', 42, false],
    ['an enveloped value', `${PREFIX}a:b:c`, true],
  ])('%s -> %s', (_label, value, expected) => {
    expect(isEncrypted(value)).toBe(expected);
  });
});
