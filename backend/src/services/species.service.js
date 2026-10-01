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

// Only what this file uses. `prisma` reads and writes the catalogue;
// `HttpError` reports the one failure mode below that is this service's own
// (a missing catalogue row), rather than a validation failure a controller
// should be reporting instead.
const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');

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
// a plain Set; tests/speciesEnumDrift.test.js reads schema.prisma directly and
// fails if this list and the enum ever disagree.
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
      // The row wins. A client-sent category is only consulted for a row whose
      // own category is null - the seeded Other sentinel is the only such row
      // today, but an Admin may create others.
      category: row.category || usablePick,
      is_endangered: row.is_endangered,
      hazard: row.hazard,
      unlisted: null,
    };
  }

  const other = await prisma.species.findUnique({ where: { name: OTHER_SPECIES }, select });
  if (!other) {
    // Retiring the row cannot reach this branch - retiring only sets
    // is_active = false, and this lookup does not filter on is_active, so a
    // retired Other row is still found here. Reachable only by renaming the
    // row or deleting it outright, both directly in SQL; the failure would
    // otherwise surface later as a foreign-key error on an unrelated insert.
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

const BIOME_VALUES = ['Forest', 'Freshwater', 'Lakeshore_Wetland', 'Agricultural', 'Urban', 'Cave'];
const INDICATOR_VALUES = ['Common', 'Native', 'Endemic', 'Near_Threatened', 'Vulnerable', 'Endangered', 'Critically_Endangered'];
const HAZARD_VALUES = ['None', 'Venomous', 'Aggressive', 'Disease_Risk', 'Powerful_Bite_Or_Talons'];

// A species NAME is displayed verbatim (it is a real common name, not an
// enum-shaped value like Illegal_Dumping), so it allows spaces and hyphens -
// unlike category.service's NAME_RE. It still cannot be blank or absurd.
function cleanName(value) {
  const name = String(value || '').trim();
  if (!name) throw new HttpError(422, 'A species name is required.');
  if (name.length > 200) throw new HttpError(422, 'Species name is too long.');
  return name;
}

function enumOrThrow(value, allowed, label) {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value).trim();
  if (!allowed.includes(v)) {
    throw new HttpError(422, `${label} must be one of: ${allowed.join(', ')}.`);
  }
  return v;
}

const text = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

async function createSpecies(adminId, input, ctx = {}) {
  const name = cleanName(input.name);

  const clash = await prisma.species.findUnique({ where: { name } });
  if (clash) throw new HttpError(409, 'A species with that name already exists.');

  const row = await prisma.species.create({
    data: {
      name,
      scientific_name: text(input.scientific_name),
      local_name: text(input.local_name),
      category: enumOrThrow(input.category, CATEGORY_VALUES, 'Category'),
      biome: enumOrThrow(input.biome, BIOME_VALUES, 'Biome'),
      indicator: enumOrThrow(input.indicator, INDICATOR_VALUES, 'Indicator'),
      hazard: enumOrThrow(input.hazard, HAZARD_VALUES, 'Hazard') || 'None',
      is_endangered: Boolean(input.is_endangered),
      body_description: text(input.body_description),
      handling_note: text(input.handling_note),
      sort_order: Number.isInteger(input.sort_order) ? input.sort_order : 0,
    },
  });

  await writeAuditLog({
    performedBy: adminId,
    action: 'SPECIES_CREATE',
    targetTable: 'Species',
    targetId: row.species_id,
    data: { name: row.name, category: row.category, is_endangered: row.is_endangered },
    ipAddress: ctx.ipAddress || null,
  });

  return row;
}

async function updateSpecies(adminId, id, input, ctx = {}) {
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) throw new HttpError(404, 'Species not found.');

  const existing = await prisma.species.findUnique({ where: { species_id: targetId } });
  if (!existing) throw new HttpError(404, 'Species not found.');

  const isSentinel = existing.name === OTHER_SPECIES;

  const data = {};
  // The name is deliberately NOT editable. It is the foreign key every report
  // stores; ON UPDATE CASCADE would rewrite those, but the name also appears in
  // exported PDFs and audit-log payloads that cannot be rewritten, so a rename
  // would silently split one species' history in two. Retire it and add a
  // replacement instead - that keeps both halves legible.
  if (input.scientific_name !== undefined) data.scientific_name = text(input.scientific_name);
  if (input.local_name !== undefined) data.local_name = text(input.local_name);
  if (input.category !== undefined) data.category = enumOrThrow(input.category, CATEGORY_VALUES, 'Category');
  if (input.biome !== undefined) data.biome = enumOrThrow(input.biome, BIOME_VALUES, 'Biome');
  if (input.indicator !== undefined) data.indicator = enumOrThrow(input.indicator, INDICATOR_VALUES, 'Indicator');
  if (input.hazard !== undefined) data.hazard = enumOrThrow(input.hazard, HAZARD_VALUES, 'Hazard') || 'None';
  if (input.is_endangered !== undefined) data.is_endangered = Boolean(input.is_endangered);
  if (input.body_description !== undefined) data.body_description = text(input.body_description);
  if (input.handling_note !== undefined) data.handling_note = text(input.handling_note);
  if (input.sort_order !== undefined) data.sort_order = Number(input.sort_order) || 0;
  if (input.is_active !== undefined) data.is_active = Boolean(input.is_active);

  if (Object.keys(data).length === 0) throw new HttpError(422, 'Nothing to change.');

  // THE SENTINEL'S TWO LOAD-BEARING PROPERTIES. Its name is what the specify box
  // and resolveSpecies()'s fallback key off, and its is_endangered = true is the
  // fail-safe for every unidentified animal. Both are refused explicitly, with a
  // message that says why, because nothing about the Admin's action would
  // otherwise explain the breakage that follows.
  if (isSentinel && data.is_active === false) {
    throw new HttpError(422, 'The "Other" entry cannot be retired. Residents need it to report an animal that is not in the catalogue.');
  }
  // THE SINGLE MOST LOAD-BEARING GUARD IN THIS FILE. The whole fail-safe for an
  // unidentified animal is this one row's boolean, and RE-SEEDING CANNOT REPAIR
  // IT: the species upsert is create-only by design, so a flipped flag survives
  // every deploy. Recovery is this screen or raw SQL - which is exactly why the
  // flag must not be flippable from here in the first place.
  if (isSentinel && data.is_endangered === false) {
    throw new HttpError(422, 'The "Other" entry must stay marked endangered. It is what hides the location of an animal nobody has identified yet.');
  }

  // Retiring the last active species would leave the wildlife form with no
  // options and no way for a resident to file anything - refused rather than
  // discovered by a resident staring at an empty dropdown.
  if (data.is_active === false && existing.is_active) {
    const remaining = await prisma.species.count({ where: { is_active: true } });
    if (remaining <= 1) {
      throw new HttpError(422, 'This is the last active species. Add another one before retiring it.');
    }
  }

  const row = await prisma.species.update({ where: { species_id: targetId }, data });

  await writeAuditLog({
    performedBy: adminId,
    action: 'SPECIES_UPDATE',
    targetTable: 'Species',
    targetId: row.species_id,
    data: { name: row.name, changed: Object.keys(data) },
    ipAddress: ctx.ipAddress || null,
  });

  return row;
}

module.exports = {
  OTHER_SPECIES, PUBLIC_FIELDS, CATEGORY_VALUES, BIOME_VALUES, INDICATOR_VALUES, HAZARD_VALUES,
  listActive, listAll, resolveSpecies, createSpecies, updateSpecies,
};
