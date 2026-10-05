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
const storage = require('./storage');

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
// unlike category.service's NAME_RE. It still cannot be blank or absurd, and
// the cap matches the column (VarChar(200)) so this is a clean 422 instead of
// a 500 from MySQL.
function cleanName(value) {
  const name = String(value || '').trim();
  if (!name) throw new HttpError(422, 'A species name is required.');
  if (name.length > 200) throw new HttpError(422, 'Species name must be 200 characters or fewer.');
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

// scientific_name and local_name are VarChar(200); body_description and
// handling_note are Text (no practical cap), so only these two need this.
// Without it a 201-character value reaches MySQL and 500s, where the species
// name itself already 422s cleanly at the same length.
function textCapped(value, maxLength, label) {
  const s = text(value);
  if (s && s.length > maxLength) {
    throw new HttpError(422, `${label} must be ${maxLength} characters or fewer.`);
  }
  return s;
}

// Booleans arrive from more than one kind of caller. An HTTP body a browser's
// fetch() serialised as real JSON is the common case, but the HTTP validator
// is not the only way in - the service is the boundary this invariant
// belongs to, and a backfill or a later script can call createSpecies/
// updateSpecies directly without ever passing through a route. JS Boolean(x)
// treats every non-empty string as true, so Boolean('false') is true: such a
// caller sending the string 'false' would silently REACTIVATE a species it
// meant to retire, or silently fail to clear a flag, while the save reports
// success. Accepted only as real booleans or the string/number forms a form
// body actually produces; anything else is a 422 rather than a guess. This is
// also why the enum validation above is duplicated here instead of trusted to
// an HTTP layer.
function toBool(value, label) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  throw new HttpError(422, `${label} must be true or false.`);
}

// sort_order accepts a real number or the numeric string a form posts. The
// two rules this replaces disagreed with each other - Number.isInteger(x) ? x
// : 0 treated any string, including a perfectly good '10', as non-integer and
// silently zeroed it, while Number(x) || 0 parsed '10' correctly - and both
// silently turned unparseable input into 0, indistinguishable from an Admin
// who typed 0 on purpose. One rule now, and garbage is a 422 instead of a
// silent default.
function toSortOrder(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(422, 'Sort order must be a number.');
  return Math.trunc(n);
}

async function createSpecies(adminId, input, ctx = {}) {
  const name = cleanName(input.name);

  const clash = await prisma.species.findUnique({ where: { name } });
  if (clash) throw new HttpError(409, 'A species with that name already exists.');

  const data = {
    name,
    scientific_name: textCapped(input.scientific_name, 200, 'Scientific name'),
    local_name: textCapped(input.local_name, 200, 'Local name'),
    category: enumOrThrow(input.category, CATEGORY_VALUES, 'Category'),
    biome: enumOrThrow(input.biome, BIOME_VALUES, 'Biome'),
    indicator: enumOrThrow(input.indicator, INDICATOR_VALUES, 'Indicator'),
    hazard: enumOrThrow(input.hazard, HAZARD_VALUES, 'Hazard') || 'None',
    // Default false/true when omitted, matching the column defaults - but a
    // value the caller DOES send still goes through toBool(), so a stray
    // 'false' string cannot flip an endangered species to is_endangered: true
    // (or the reverse) while the create reports success.
    is_endangered: input.is_endangered === undefined ? false : toBool(input.is_endangered, 'is_endangered'),
    // Not in the original brief: without this a species could only ever be
    // created active, and backfilling historical species as retired would
    // have to call prisma.species.create directly and bypass this function's
    // audit trail entirely.
    is_active: input.is_active === undefined ? true : toBool(input.is_active, 'is_active'),
    body_description: text(input.body_description),
    handling_note: text(input.handling_note),
    sort_order: input.sort_order === undefined ? 0 : toSortOrder(input.sort_order),
  };

  const row = await prisma.species.create({ data });

  await writeAuditLog({
    performedBy: adminId,
    action: 'SPECIES_CREATE',
    targetTable: 'Species',
    targetId: row.species_id,
    data: { name: row.name, category: row.category, is_endangered: row.is_endangered, is_active: row.is_active },
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

  // The name is deliberately NOT editable. It is the foreign key every report
  // stores; ON UPDATE CASCADE would rewrite those, but the name also appears in
  // exported PDFs and audit-log payloads that cannot be rewritten, so a rename
  // would silently split one species' history in two. Refused outright rather
  // than silently dropped: a caller sending only { name } used to get a
  // confusing "Nothing to change" (false - they changed exactly one thing),
  // and one bundled with a real edit used to get a 200 with the rename
  // quietly discarded underneath it. Neither told the Admin what happened.
  // Retire this row and add a replacement instead - a resubmit of the
  // CURRENT name (a form that always includes it) is not a rename and is let
  // through untouched.
  if (input.name !== undefined && String(input.name).trim() !== existing.name) {
    throw new HttpError(422, 'A species name cannot be changed, because every report is stored against it. Retire this species and add a replacement instead.');
  }

  const data = {};
  if (input.scientific_name !== undefined) data.scientific_name = textCapped(input.scientific_name, 200, 'Scientific name');
  if (input.local_name !== undefined) data.local_name = textCapped(input.local_name, 200, 'Local name');
  if (input.category !== undefined) data.category = enumOrThrow(input.category, CATEGORY_VALUES, 'Category');
  if (input.biome !== undefined) data.biome = enumOrThrow(input.biome, BIOME_VALUES, 'Biome');
  if (input.indicator !== undefined) data.indicator = enumOrThrow(input.indicator, INDICATOR_VALUES, 'Indicator');
  if (input.hazard !== undefined) data.hazard = enumOrThrow(input.hazard, HAZARD_VALUES, 'Hazard') || 'None';
  if (input.is_endangered !== undefined) data.is_endangered = toBool(input.is_endangered, 'is_endangered');
  if (input.body_description !== undefined) data.body_description = text(input.body_description);
  if (input.handling_note !== undefined) data.handling_note = text(input.handling_note);
  if (input.sort_order !== undefined) data.sort_order = toSortOrder(input.sort_order);
  if (input.is_active !== undefined) data.is_active = toBool(input.is_active, 'is_active');

  if (Object.keys(data).length === 0) throw new HttpError(422, 'Nothing to change.');

  // THE SENTINEL'S TWO LOAD-BEARING PROPERTIES. Its name is what the specify box
  // and resolveSpecies()'s fallback key off, and its is_endangered = true is the
  // fail-safe for every unidentified animal. Both are refused explicitly, with a
  // message that says why, because nothing about the Admin's action would
  // otherwise explain the breakage that follows. Both checks read `data`, which
  // has already been through toBool() above - never `input` directly, because
  // `input.is_endangered === false` would let {"is_endangered": 0} walk
  // straight past this guard.
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

  // A field NAME in the audit row ("is_active changed") cannot answer the
  // question that matters when someone asks about it later: changed from
  // what, to what? For these two flags that is not recoverable any other way
  // - the species seed is create-only, so re-seeding cannot restore a flipped
  // value, and nothing else records the row's prior state.
  const auditData = { name: row.name, changed: Object.keys(data) };
  if (data.is_endangered !== undefined) {
    auditData.is_endangered = { from: existing.is_endangered, to: data.is_endangered };
  }
  if (data.is_active !== undefined) {
    auditData.is_active = { from: existing.is_active, to: data.is_active };
  }

  // A retirement gets its own action so it is filterable in the audit log
  // independent of every other edit. Reactivation stays SPECIES_UPDATE (the
  // from/to above still shows the direction) because only the active ->
  // inactive transition removes a species from residents' options; going the
  // other way does not need the same visibility.
  const action = existing.is_active === true && data.is_active === false ? 'SPECIES_RETIRE' : 'SPECIES_UPDATE';

  await writeAuditLog({
    performedBy: adminId,
    action,
    targetTable: 'Species',
    targetId: row.species_id,
    data: auditData,
    ipAddress: ctx.ipAddress || null,
  });

  return row;
}

/**
 * Replace a species' reference photo.
 *
 * These are the "sample pictures" a resident matches the animal against, so
 * they are admin-uploaded rather than committed to the repo: it keeps a
 * licensing decision out of the codebase, lets CENRO add a species without a
 * redeploy, and means mobile can reach them (it cannot read web/public).
 *
 * Served through the existing signed /uploads route - no new access path.
 */
async function setSpeciesPhoto(adminId, id, file, ctx = {}) {
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) throw new HttpError(404, 'Species not found.');

  const existing = await prisma.species.findUnique({
    where: { species_id: targetId },
    select: { species_id: true, name: true, photo_path: true },
  });
  if (!existing) throw new HttpError(404, 'Species not found.');
  if (!file) throw new HttpError(422, 'Choose an image to upload.');

  const photo_path = await storage.save('species', file);
  const row = await prisma.species.update({
    where: { species_id: targetId },
    data: { photo_path },
  });

  // Best-effort, and AFTER the row points at the new file: if this throws we
  // have an orphaned file, whereas removing first would risk a species with no
  // photo at all. Nothing else cleans this directory up, so replacing a photo
  // ten times must not leave ten files behind.
  if (existing.photo_path) await storage.remove(existing.photo_path);

  await writeAuditLog({
    performedBy: adminId,
    action: 'SPECIES_PHOTO_SET',
    targetTable: 'Species',
    targetId: row.species_id,
    data: { name: row.name, photo_path },
    ipAddress: ctx.ipAddress || null,
  });

  return row;
}

module.exports = {
  OTHER_SPECIES, PUBLIC_FIELDS, CATEGORY_VALUES, BIOME_VALUES, INDICATOR_VALUES, HAZARD_VALUES,
  listActive, listAll, resolveSpecies, createSpecies, updateSpecies, setSpeciesPhoto,
};
