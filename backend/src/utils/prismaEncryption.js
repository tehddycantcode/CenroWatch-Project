// Transparent field encryption, wired into the Prisma client as an extension.
//
// WHY AN EXTENSION AND NOT encrypt() CALLS IN EACH SERVICE
// These four fields are written in 7 places and read in 15, and the two
// directions fail very differently. A missed READ is loud and harmless - a
// staff member sees "enc:v1:AAAA..." where a phone number should be. A missed
// WRITE is silent and permanent: the row is stored in plaintext, nothing
// errors, and nobody finds out. Scattering the calls means the silent failure
// is one forgotten line away, forever, including in code nobody has written
// yet. Doing it here means a new query cannot forget.
//
// WHICH FIELDS, AND WHY ONLY THESE
// Encrypting a column costs you every operation the database could do with it:
// no WHERE, no ORDER BY, no @unique, no GROUP BY, no index (a fresh random IV
// per write means the same value never produces the same ciphertext twice).
// So the boundary is drawn by one question - is this field ever queried? -
// and it was checked field by field against the actual code, not assumed:
//
//   ENCRYPTED (written and displayed, never queried)
//     User.contact_number             never appears in a where clause
//     Complaint.reporter_name         walk-in intake; write + PDF only
//     Complaint.reporter_contact      walk-in intake; write + PDF only
//     Complaint.address_details       write + detail view + PDF only
//     WildlifeTurnover.address_details    same field, same use
//
//   NOT ENCRYPTED (and this is not an oversight)
//     User.email          findUnique on every login, and @unique - a random-IV
//                         ciphertext breaks both
//     User.first/last_name  admin user search uses `contains`
//                           (admin.user.service.js)
//     Complaint.description staff queue search uses `contains`
//                           (staff.complaint.service.js)
//
// Encrypting that second group would break search and login. If encrypted
// names ever have to be searchable, that needs a blind index - a deliberate
// piece of design work, not a line added here.
//
// THE GUARD BELOW IS THE POINT
// Someone will eventually add `where: { contact_number: ... }`. Against an
// encrypted column that returns zero rows, forever, with no error - a search
// box that silently finds nothing. So a where/orderBy/groupBy touching an
// encrypted field throws instead.

const { encrypt, decrypt } = require('./crypto.util');

// Field NAMES, not model.field pairs. Reads arrive nested - a complaint detail
// carries `user.contact_number` inside a Complaint result - so matching by name
// anywhere in the tree is what covers relations without listing every include.
// Safe here because each name belongs to exactly one column family: no
// unencrypted column anywhere in schema.prisma shares one of these names.
const ENCRYPTED_FIELDS = new Set([
  'contact_number',
  'reporter_name',
  'reporter_contact',
  'address_details',
]);

// Filter/sort clauses. `where` nests through AND/OR/NOT and through relations.
const FILTER_KEYS = new Set(['where', 'orderBy', 'cursor', 'distinct', 'by']);

function isPlainObject(node) {
  return node !== null && typeof node === 'object' && !Array.isArray(node)
    && Object.getPrototypeOf(node) === Object.prototype;
}

// Walks a result and decrypts every encrypted field it finds, at any depth.
// Only plain objects and arrays are descended: Date, Prisma.Decimal and other
// class instances pass through untouched (iterating a Date's own keys would
// destroy it - the same rule storage/index.js signFiles follows).
function decryptResult(node) {
  if (Array.isArray(node)) return node.map(decryptResult);
  if (!isPlainObject(node)) return node;

  for (const [key, value] of Object.entries(node)) {
    if (ENCRYPTED_FIELDS.has(key)) {
      node[key] = decrypt(value);
    } else {
      decryptResult(value);
    }
  }
  return node;
}

// Encrypts the write payload. Handles the shapes Prisma actually accepts:
//   { contact_number: '0917...' }          plain scalar
//   { contact_number: { set: '0917...' } } update syntax
//   [ { ... }, { ... } ]                   createMany
// and descends into nested create/update blocks so a relation write is covered
// too.
function encryptData(node) {
  if (Array.isArray(node)) return node.map(encryptData);
  if (!isPlainObject(node)) return node;

  for (const [key, value] of Object.entries(node)) {
    if (ENCRYPTED_FIELDS.has(key)) {
      if (isPlainObject(value) && 'set' in value) node[key] = { ...value, set: encrypt(value.set) };
      else node[key] = encrypt(value);
    } else {
      encryptData(value);
    }
  }
  return node;
}

// Throws if a filter or sort clause references an encrypted field. See the
// header: the alternative is a query that silently matches nothing.
function assertNotFiltered(model, operation, node, path = 'where') {
  if (Array.isArray(node)) {
    node.forEach((n) => assertNotFiltered(model, operation, n, path));
    return;
  }
  if (typeof node === 'string') {
    // `by: ['contact_number']` and `distinct: 'contact_number'` are bare strings
    if (ENCRYPTED_FIELDS.has(node)) throwFiltered(model, operation, `${path}.${node}`);
    return;
  }
  if (!isPlainObject(node)) return;

  for (const [key, value] of Object.entries(node)) {
    if (ENCRYPTED_FIELDS.has(key)) throwFiltered(model, operation, `${path}.${key}`);
    assertNotFiltered(model, operation, value, `${path}.${key}`);
  }
}

function throwFiltered(model, operation, path) {
  const err = new Error(
    `${model}.${operation} tried to filter or sort on ${path}, which is stored encrypted. ` +
      'Encryption uses a random IV per value, so the ciphertext for the same input differs every ' +
      'time - this query would match nothing rather than fail. Query an unencrypted column instead, ' +
      'or add a blind index if the field genuinely has to be searchable. ' +
      'See src/utils/prismaEncryption.js.'
  );
  err.statusCode = 500;
  throw err;
}

// Prisma passes `args` by reference to the extension, so these walkers mutate
// in place and hand the same object to query(). Mutating a caller's object
// would be rude if the caller reused it - services here build a fresh literal
// per call, and the values written back are the encrypted form of what was
// already there, so a reused object stays correct (encrypt() is idempotent).
function applyEncryption(prisma) {
  return prisma.$extends({
    name: 'cenrowatch-field-encryption',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (args && typeof args === 'object') {
            for (const key of FILTER_KEYS) {
              if (args[key] !== undefined) assertNotFiltered(model, operation, args[key], key);
            }
            // upsert carries two payloads; every other write carries one.
            if (args.data !== undefined) encryptData(args.data);
            if (args.create !== undefined) encryptData(args.create);
            if (args.update !== undefined) encryptData(args.update);
          }
          return decryptResult(await query(args));
        },
      },
    },
  });
}

module.exports = { applyEncryption, decryptResult, encryptData, assertNotFiltered, ENCRYPTED_FIELDS };
