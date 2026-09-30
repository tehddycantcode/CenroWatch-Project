// Admin-managed wildlife species catalogue, and the one place a report's
// category and endangered status are decided.
//
// Modelled on category.service.js, which solved the same problem for complaint
// and request types: reference data an Admin can edit without a redeploy, stored
// as rows, referenced by NAME so every groupBy, PDF row and badge keeps reading
// the value it already reads.
//
// Species are RETIRED (is_active = false), never deleted: a species with reports
// against it cannot be removed without making that history unreadable, and the
// FK is RESTRICT so the database refuses it outright.

// Only what this file uses so far. Task 4 adds `HttpError`, Task 5 adds
// `writeAuditLog`, Task 8 adds `storage` - each with the code that needs it.
const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');

// The sentinel row seeded by prisma/seed.js. species_name is a required foreign
// key, so free text a resident types cannot go in it - this is the row that
// stands in for "an animal not in the catalogue", and its is_endangered = true
// is what makes an unidentified animal fail safe without a branch anywhere.
const OTHER_SPECIES = 'Other';

// What a resident, the public education page and both report forms may see.
// An ALLOWLIST rather than a spread: this response is public, so adding a column
// to the model must not silently widen it (R.A. 10173).
const PUBLIC_FIELDS = {
  name: true,
  scientific_name: true,
  local_name: true,
  category: true,
  biome: true,
  indicator: true,
  hazard: true,
  is_endangered: true,
  body_description: true,
  handling_note: true,
  photo_path: true,
  photo_credit: true,
  sort_order: true,
};

/**
 * Active species, for the wildlife form and the public species guide.
 * Zero personal data, so this is safe on a public endpoint (R.A. 10173).
 */
async function listActive() {
  const species = await prisma.species.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    select: PUBLIC_FIELDS,
  });
  return { species };
}

/**
 * Admin view: every species including retired ones, each with the number of
 * reports using it. The count is what tells an Admin whether retiring a species
 * will affect existing records, so it is worth the extra query.
 */
async function listAll() {
  // TWO queries rather than a relation `_count`, because WildlifeTurnover does
  // not carry a `species` relation yet - the foreign key lands in a later task,
  // once every historical species_name has a catalogue row to point at. A
  // groupBy on the plain column needs no relation and is exact. `species_name`
  // is not an encrypted field, so the field-encryption extension in
  // utils/prisma.js does not reject grouping by it.
  const [rows, usage] = await Promise.all([
    prisma.species.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    }),
    prisma.wildlifeTurnover.groupBy({
      by: ['species_name'],
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(usage.map((u) => [u.species_name, u._count._all]));
  return {
    species: rows.map((row) => ({ ...row, in_use: counts.get(row.name) || 0 })),
  };
}

// The three exclusive categories, mirroring the SpeciesCategory enum. Duplicated
// here rather than imported because Prisma does not export enum values usable in
// a plain Set; tests/statusPartitions.test.js reads schema.prisma directly if you
// need the authoritative list.
const CATEGORY_VALUES = ['Bird', 'Mammal', 'Reptile'];

/**
 * Decide a report's species, category, endangered flag and hazard.
 *
 * THE ONLY PLACE those values are decided. They used to come from the client -
 * a free-text category box and a self-declared "I believe this is endangered"
 * checkbox - which made "three exclusive categories" untrue and put a privacy
 * control (public-map obfuscation) in the reporter's hands.
 *
 * NEVER THROWS FOR AN UNRECOGNISED SPECIES. Every installed APK keeps posting
 * free-text names until its owner takes the OTA, and there is no telemetry to
 * say when that has happened. An unknown name is therefore treated exactly as
 * "Other": the report lands, the Other row's is_endangered = true makes it fail
 * safe, and what the resident typed is returned in `unlisted` so the caller can
 * keep it in the description. Refusing would throw away animal-welfare reports
 * for an unbounded window.
 *
 * A RETIRED species is still accepted - deliberately unlike
 * category.service.isSelectable. The row exists, so the foreign key holds, and
 * recording the real species beats degrading it to "Other".
 *
 * @param {string} submittedName
 * @param {string} [submittedCategory] only consulted when the row has no category
 */
async function resolveSpecies(submittedName, submittedCategory) {
  const typed = String(submittedName || '').trim();
  const pick = String(submittedCategory || '').trim();
  const usablePick = CATEGORY_VALUES.includes(pick) ? pick : null;

  const select = { name: true, category: true, is_endangered: true, hazard: true };
  const row = typed
    ? await prisma.species.findUnique({ where: { name: typed }, select })
    : null;

  if (row) {
    return {
      name: row.name,
      // The row wins. A client-sent category is only a fallback for a row that
      // has none, which today means the Other sentinel alone.
      category: row.category || usablePick,
      is_endangered: row.is_endangered,
      hazard: row.hazard,
      unlisted: null,
    };
  }

  const other = await prisma.species.findUnique({ where: { name: OTHER_SPECIES }, select });
  if (!other) {
    // Unreachable through the app: seed.js creates this row and update()/retire()
    // both refuse to touch it. Reachable by deleting it in SQL, and the failure
    // would otherwise be a foreign-key error on an unrelated insert.
    throw new HttpError(500, `The species catalogue is missing its "${OTHER_SPECIES}" entry. Re-run the seed.`);
  }

  return {
    name: other.name,
    category: other.category || usablePick,
    is_endangered: other.is_endangered,
    hazard: other.hazard,
    unlisted: typed || null,
  };
}

module.exports = {
  OTHER_SPECIES, PUBLIC_FIELDS, CATEGORY_VALUES,
  listActive, listAll, resolveSpecies,
};
