// The Prisma encryption extension's three walkers, tested as pure functions.
//
// The extension itself is exercised against the real database (that is what the
// verification pass before the backfill was for); what is worth locking down
// here is the walking, because that is where the silent failures live: a
// nested relation that never gets decrypted, a Date destroyed by being iterated
// like a plain object, and a where-clause on an encrypted column that returns
// nothing instead of failing.

const {
  decryptResult,
  encryptData,
  assertNotFiltered,
  ENCRYPTED_FIELDS,
} = require('../src/utils/prismaEncryption');
const { encrypt, resetKeyCache, PREFIX } = require('../src/utils/crypto.util');

beforeAll(() => {
  process.env.FIELD_ENCRYPTION_KEY = 'b'.repeat(64);
  resetKeyCache();
});

afterAll(() => {
  delete process.env.FIELD_ENCRYPTION_KEY;
  resetKeyCache();
});

describe('the field list', () => {
  // If this set ever changes, the migration that widened the columns and the
  // rules in docs/SECURITY.md have to change with it.
  test('is exactly the four fields verified as never queried', () => {
    expect([...ENCRYPTED_FIELDS].sort()).toEqual([
      'address_details',
      'contact_number',
      'reporter_contact',
      'reporter_name',
    ]);
  });

  // Encrypting any of these would break login or a search box that shipped
  // weeks ago. Named here so the breakage is a failing test, not a bug report.
  test.each(['email', 'first_name', 'last_name', 'description'])(
    'does NOT contain %s (it is queried)',
    (field) => {
      expect(ENCRYPTED_FIELDS.has(field)).toBe(false);
    }
  );
});

describe('decryptResult', () => {
  test('decrypts a top-level field', () => {
    const row = { user_id: 1, contact_number: encrypt('09171234567') };
    expect(decryptResult(row).contact_number).toBe('09171234567');
  });

  // The case a model-scoped extension would miss: a Complaint result carrying
  // the reporter's User through a relation select.
  test('decrypts a field nested inside a relation', () => {
    const row = {
      complaint_id: 1,
      address_details: encrypt('12 Mabini St'),
      user: { user_id: 2, contact_number: encrypt('09171234567') },
    };
    const out = decryptResult(row);
    expect(out.address_details).toBe('12 Mabini St');
    expect(out.user.contact_number).toBe('09171234567');
  });

  test('decrypts through arrays of rows', () => {
    const rows = [
      { contact_number: encrypt('0917') },
      { contact_number: encrypt('0918') },
    ];
    expect(decryptResult(rows).map((r) => r.contact_number)).toEqual(['0917', '0918']);
  });

  test('decrypts through an array nested in a row', () => {
    const row = { complaints: [{ reporter_name: encrypt('Juan') }] };
    expect(decryptResult(row).complaints[0].reporter_name).toBe('Juan');
  });

  // Iterating a Date's own keys returns nothing and would replace it with {}.
  // storage/index.js signFiles has the same guard for the same reason.
  test('leaves Date instances intact', () => {
    const submitted = new Date('2026-09-10T01:00:00.000Z');
    const out = decryptResult({ submitted_at: submitted, contact_number: encrypt('0917') });
    expect(out.submitted_at).toBeInstanceOf(Date);
    expect(out.submitted_at.getTime()).toBe(submitted.getTime());
  });

  test('leaves nulls and scalars alone', () => {
    const out = decryptResult({ contact_number: null, priority: false, count: 0 });
    expect(out).toEqual({ contact_number: null, priority: false, count: 0 });
  });

  test('passes a non-object result (a count) straight through', () => {
    expect(decryptResult(9)).toBe(9);
    expect(decryptResult(null)).toBe(null);
  });

  // Plaintext rows written before the backfill must keep rendering.
  test('leaves not-yet-encrypted values as they are', () => {
    expect(decryptResult({ contact_number: '09171234567' }).contact_number).toBe('09171234567');
  });
});

describe('encryptData', () => {
  test('encrypts a scalar write', () => {
    const data = encryptData({ contact_number: '09171234567', first_name: 'Juan' });
    expect(data.contact_number.startsWith(PREFIX)).toBe(true);
    expect(data.first_name).toBe('Juan'); // not encrypted: admin search uses it
  });

  test('encrypts the { set: ... } update form', () => {
    const data = encryptData({ contact_number: { set: '09171234567' } });
    expect(data.contact_number.set.startsWith(PREFIX)).toBe(true);
  });

  test('encrypts every row of a createMany array', () => {
    const data = encryptData([{ reporter_name: 'Juan' }, { reporter_name: 'Maria' }]);
    expect(data.every((r) => r.reporter_name.startsWith(PREFIX))).toBe(true);
  });

  test('encrypts inside a nested create block', () => {
    const data = encryptData({ description: 'x', user: { create: { contact_number: '0917' } } });
    expect(data.user.create.contact_number.startsWith(PREFIX)).toBe(true);
    expect(data.description).toBe('x');
  });

  test('leaves null and empty alone so an optional field stays visibly empty', () => {
    const data = encryptData({ contact_number: null, reporter_name: '' });
    expect(data.contact_number).toBeNull();
    expect(data.reporter_name).toBe('');
  });

  // Re-saving a row that was read from the database must not double-wrap it.
  test('is idempotent on an already-encrypted value', () => {
    const once = encrypt('09171234567');
    expect(encryptData({ contact_number: once }).contact_number).toBe(once);
  });
});

describe('assertNotFiltered — the guard that stops a silent empty result', () => {
  // A random IV per value means the ciphertext for a search term never matches
  // the ciphertext in the column. The query would succeed and find nothing,
  // forever, which is the worst possible failure mode for a search box.
  test('throws on a direct where clause', () => {
    expect(() => assertNotFiltered('User', 'findMany', { contact_number: { contains: '0917' } })).toThrow(
      /stored encrypted/
    );
  });

  test('throws on a clause buried in OR', () => {
    expect(() =>
      assertNotFiltered('User', 'findMany', {
        OR: [{ email: { contains: 'a' } }, { contact_number: { contains: '0917' } }],
      })
    ).toThrow(/stored encrypted/);
  });

  test('throws on a clause reached through a relation', () => {
    expect(() =>
      assertNotFiltered('Complaint', 'findMany', { user: { contact_number: '0917' } })
    ).toThrow(/stored encrypted/);
  });

  // Sorting by ciphertext produces an order with no meaning, and nothing errors.
  test('throws on orderBy', () => {
    expect(() => assertNotFiltered('User', 'findMany', { contact_number: 'asc' }, 'orderBy')).toThrow(
      /stored encrypted/
    );
  });

  // groupBy `by` and `distinct` arrive as bare strings, not objects.
  test('throws on a groupBy field given as a string', () => {
    expect(() => assertNotFiltered('User', 'groupBy', ['role', 'contact_number'], 'by')).toThrow(
      /stored encrypted/
    );
  });

  test('the message says what to do instead', () => {
    expect(() => assertNotFiltered('User', 'findMany', { contact_number: '1' })).toThrow(
      /blind index/
    );
  });

  test.each([
    ['the admin user search', { OR: [{ email: { contains: 'a' } }, { first_name: { contains: 'a' } }] }],
    ['a login lookup', { email: 'juan@example.com' }],
    ['the staff queue search', { description: { contains: 'burning' } }],
    ['a status filter', { status: 'Approved', barangay_id: 3 }],
  ])('allows %s', (_label, where) => {
    expect(() => assertNotFiltered('User', 'findMany', where)).not.toThrow();
  });
});
