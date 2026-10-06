// Deriving a wildlife report's category and endangered status from the species.
//
// WHY THIS SUITE EXISTS. Both values used to come from the CLIENT: the resident
// typed a category into a free-text box and ticked "I believe this is an
// endangered or protected species". That second checkbox drives THREE things,
// and the third is a privacy control - is_priority_review, the initial status,
// and PUBLIC-MAP COORDINATE OBFUSCATION (gis.service.js). A resident deciding
// whether a rescue site is hidden from a poacher is the wrong author for that
// decision, and a resident deciding the category made "only three exclusive
// categories" untrue in practice.
//
// THE ASSERTION THIS SUITE EXISTS FOR is "a client cannot override either
// value". Everything else here protects the path that must never lose a report.

jest.mock('../src/utils/prisma', () => ({
  species: { findUnique: jest.fn() },
  barangay: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyReportSubmitted: jest.fn() }));
jest.mock('../src/utils/sla', () => ({
  getSlaMinutes: jest.fn(async () => 3218),
  computeSlaDeadline: jest.fn(async () => new Date('2026-10-08T09:00:00Z')),
}));
jest.mock('../src/utils/createSequential', () => ({
  createSequential: jest.fn(async ({ data }) => ({ turnover_id: 1, reference_id: 'WLD-2026-00001', ...data })),
}));

const prisma = require('../src/utils/prisma');
const { resolveSpecies, OTHER_SPECIES } = require('../src/services/species.service');

const COBRA = { name: 'Philippine Cobra', category: 'Reptile', is_endangered: false, hazard: 'Venomous' };
const DUCK = { name: 'Philippine Duck', category: 'Bird', is_endangered: true, hazard: 'None' };
const OTHER = { name: 'Other', category: null, is_endangered: true, hazard: 'None' };

// Answer findUnique from a small table, so each test states only what it cares
// about rather than re-stubbing call order.
function catalogue(rows) {
  prisma.species.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(rows.find((r) => r.name === where.name) || null));
}

beforeEach(() => jest.clearAllMocks());

describe('a catalogued species decides its own category and status', () => {
  test('category comes from the row', async () => {
    catalogue([COBRA]);
    const out = await resolveSpecies('Philippine Cobra');
    expect(out.category).toBe('Reptile');
    expect(out.name).toBe('Philippine Cobra');
    expect(out.unlisted).toBeNull();
  });

  test('A CLIENT CANNOT OVERRIDE THE CATEGORY', async () => {
    // The assertion item 2 rests on. The old form shipped an editable text box
    // for this, so an old bundle still posts a value - it must be ignored, not
    // honoured and not rejected.
    catalogue([COBRA]);
    const out = await resolveSpecies('Philippine Cobra', 'Bird');
    expect(out.category).toBe('Reptile');
  });

  test('A CLIENT CANNOT OVERRIDE THE ENDANGERED FLAG', async () => {
    // The assertion item 3 rests on, and a privacy control: this boolean is what
    // gis.service.js fuzzes coordinates on.
    catalogue([DUCK]);
    const out = await resolveSpecies('Philippine Duck');
    expect(out.is_endangered).toBe(true);
  });

  test('A CATALOGUED COMMON SPECIES IS NOT ENDANGERED', async () => {
    // The other half of the assertion above, and the one that makes the flag
    // provably ROW-DERIVED rather than a constant: with only `toBe(true)`
    // assertions in this file, hardcoding `is_endangered: true` passes the whole
    // suite. COBRA is declared is_endangered: false precisely so this can fail.
    catalogue([COBRA]);
    expect((await resolveSpecies('Philippine Cobra')).is_endangered).toBe(false);
  });

  test('an extra argument cannot introduce an override channel', async () => {
    // The test above is named "A CLIENT CANNOT OVERRIDE THE ENDANGERED FLAG" but
    // passes no override to be ignored. A later task adds a staff-only
    // is_endangered override; if anyone threads it through this signature as
    // `submittedEndangered ?? row.is_endangered`, this is what fails.
    catalogue([COBRA]);
    expect((await resolveSpecies('Philippine Cobra', null, true)).is_endangered).toBe(false);
  });

  test('carries the hazard through, for the safety guidance in Plan B', async () => {
    catalogue([COBRA]);
    expect((await resolveSpecies('Philippine Cobra')).hazard).toBe('Venomous');
  });
});

describe('the Other sentinel', () => {
  test('is endangered, so an unidentified animal fails SAFE', async () => {
    // Not a branch in this function - a property of the seeded row. An unknown
    // animal might be protected, and the cost of guessing wrong the other way is
    // publishing a poaching target.
    catalogue([OTHER]);
    const out = await resolveSpecies('Other', 'Reptile');
    expect(out.is_endangered).toBe(true);
    expect(out.name).toBe(OTHER_SPECIES);
  });

  test('takes its category from the resident, since the row has none', async () => {
    catalogue([OTHER]);
    expect((await resolveSpecies('Other', 'Reptile')).category).toBe('Reptile');
  });

  test('accepts a missing category rather than refusing the report', async () => {
    // species_category is nullable. A resident who cannot say whether it is a
    // bird, mammal or reptile must still be able to file; staff can set it.
    catalogue([OTHER]);
    expect((await resolveSpecies('Other')).category).toBeNull();
  });

  test('ignores a category that is not one of the three', async () => {
    catalogue([OTHER]);
    expect((await resolveSpecies('Other', 'Dinosaur')).category).toBeNull();
  });
});

describe('AN UNKNOWN SPECIES NAME MUST NOT LOSE THE REPORT', () => {
  // Review Focus 1. After this ships, every installed APK keeps posting
  // free-text species names until its owner opens the app and takes the OTA -
  // and there is no telemetry to say when that has happened. A 422 here would
  // throw away animal-welfare reports for as long as that takes, so an
  // uncatalogued name is treated exactly as "Other".
  test('falls back to the Other row instead of throwing', async () => {
    catalogue([OTHER]);
    const out = await resolveSpecies('Sea turtle');
    expect(out.name).toBe('Other');
    expect(out.is_endangered).toBe(true);
  });

  test('PRESERVES what the resident typed, so staff still learn the species', async () => {
    catalogue([OTHER]);
    expect((await resolveSpecies('Sea turtle')).unlisted).toBe('Sea turtle');
  });

  test('an empty name also falls back, with nothing to preserve', async () => {
    catalogue([OTHER]);
    const out = await resolveSpecies('');
    expect(out.name).toBe('Other');
    expect(out.unlisted).toBeNull();
  });

  test('a RETIRED species is still accepted on a new report', async () => {
    // Deliberately unlike category.service.isSelectable, which 422s a retired
    // complaint type. A stale client still offers a species an Admin retired
    // yesterday, the row still exists so the foreign key holds, and staff see
    // the real species name - strictly better than degrading it to "Other".
    catalogue([{ ...DUCK, is_active: false }]);
    const out = await resolveSpecies('Philippine Duck');
    expect(out.name).toBe('Philippine Duck');
    expect(out.unlisted).toBeNull();
  });

  // The coercion at the top of resolveSpecies is load-bearing, not defensive
  // noise: without it, `null.trim()` throws and a client that omits the field
  // gets a 500 instead of a filed report. Prisma also rejects a non-string
  // `where.name` outright, so the coercion is what keeps it from ever seeing one.
  test.each([null, undefined, '   ', 42, {}, []])(
    'falls back to Other for %p instead of throwing',
    async (bad) => {
      catalogue([OTHER]);
      const out = await resolveSpecies(bad);
      expect(out.name).toBe('Other');
      expect(out.is_endangered).toBe(true);
    },
  );
});

describe('a catalogue with no Other row', () => {
  test('fails loudly rather than writing a broken foreign key', async () => {
    // Only reachable if someone deletes the seeded row directly in SQL.
    catalogue([]);
    await expect(resolveSpecies('Sea turtle')).rejects.toThrow(/catalogue/i);
    // The message alone would stay green if this 500 became a 422 - which would
    // report a missing seeded row to a resident as a validation failure on their
    // own submission. statusCode, not status: status would pass vacuously
    // against undefined.
    await expect(resolveSpecies('Sea turtle')).rejects.toMatchObject({ statusCode: 500 });
  });
});

describe('createTurnover uses the catalogue, not the client', () => {
  const { createSequential } = require('../src/utils/createSequential');
  const { createTurnover } = require('../src/services/wildlife.service');

  const base = {
    barangay_id: 1,
    species_name: 'Philippine Cobra',
    animal_condition: 'Healthy',
    description: 'Seen in the rice field behind the barangay hall.',
    latitude: 14.2756,
    longitude: 121.1289,
  };

  beforeEach(() => {
    prisma.barangay.findUnique.mockResolvedValue({ barangay_id: 1, name: 'Pulo' });
    prisma.user.findUnique.mockResolvedValue({ email: 'r@example.com', first_name: 'Ana' });
    catalogue([COBRA, DUCK, OTHER]);
  });

  const written = () => createSequential.mock.calls[0][0].data;

  test('A LOOKUP FAILURE MUST NOT BE SWALLOWED', async () => {
    // Fails CLOSED on purpose. If this call ever gains a catch-with-default, an
    // unresolvable species would be stored as not-endangered and its exact
    // coordinates published on the public map. Better to lose the request and
    // let the resident retry than to file a report with the protection removed.
    prisma.species.findUnique.mockRejectedValue(new Error('db down'));
    await expect(createTurnover(7, base, null, {})).rejects.toThrow();
    expect(createSequential).not.toHaveBeenCalled();
  });

  test('IGNORES a client-sent species_category', async () => {
    // Review Focus 2. The old web bundle posts this field, and it must be
    // ignored rather than rejected - a 422 here would break the live site for
    // the window between the API deploy and the web deploy.
    await createTurnover(7, { ...base, species_category: 'Bird' }, null, {});
    expect(written().species_category).toBe('Reptile');
  });

  test('IGNORES a client-sent is_endangered', async () => {
    // Same window, and this one is a privacy control: a resident must not be
    // able to decide whether a rescue site is hidden from a poacher.
    await createTurnover(7, { ...base, is_endangered: true }, null, {});
    expect(written().is_endangered).toBe(false);
    expect(written().is_priority_review).toBe(false);
    expect(written().status).toBe('Pending_Review');
  });

  test('a catalogued endangered species is promoted to priority review', async () => {
    await createTurnover(7, { ...base, species_name: 'Philippine Duck' }, null, {});
    expect(written().is_endangered).toBe(true);
    expect(written().is_priority_review).toBe(true);
    expect(written().status).toBe('Priority_Review');
    // The Duck is the only fixture here whose category and name differ from the
    // Other-fallback values, so these two are what stop a hardcoded
    // `species_category: 'Reptile'` or `species_name: 'Other'` passing the whole
    // suite. Every other assertion in this block happens to agree with the
    // fallback.
    expect(written().species_category).toBe('Bird');
    expect(written().species_name).toBe('Philippine Duck');
  });

  test('an uncatalogued species lands as Other, at priority review', async () => {
    await createTurnover(7, { ...base, species_name: 'Sea turtle' }, null, {});
    expect(written().species_name).toBe('Other');
    expect(written().status).toBe('Priority_Review');
  });

  test('KEEPS the typed species name, as the first line of the description', async () => {
    // Mirrors withOtherDetail() in otherCategory.js. Without this the species a
    // resident actually saw is lost, and the report reads as "Other" with no
    // indication of what was reported.
    await createTurnover(7, { ...base, species_name: 'Sea turtle' }, null, {});
    expect(written().description).toBe(`Other: Sea turtle\n\n${base.description}`);
  });

  test('does not double-prefix when the client already folded it in', async () => {
    // Exercises the path a catalogue-aware client uses once it posts
    // species_name: 'Other' and folds the typed detail in itself, the way the
    // complaint and request forms already do for their own "Other" type. The
    // row IS found, so nothing is added here.
    const desc = 'Other: Sea turtle\n\nSeen near the lakeshore.';
    await createTurnover(7, { ...base, species_name: 'Other', description: desc }, null, {});
    expect(written().description).toBe(desc);
  });

  test('never exceeds the 5000-character description limit, and keeps the species name', async () => {
    // The folded line has to fit inside the same cap the validator enforces.
    // NOT a column limit - description is @db.Text - so what this protects is
    // that the stored value stays inside the range the API itself accepts.
    //
    // The truncation is SILENT: a resident whose 4,990-character description was
    // accepted loses up to 209 characters off the end with no marker.
    //
    // Asserting the exact length AND the prefix is deliberate. A cap applied to
    // `unlisted` instead of the tail, or a slice taken from the wrong end, would
    // satisfy a bare `toBeLessThanOrEqual` while destroying the folded
    // `Other: ...` line - which is the only reason this function exists.
    await createTurnover(7, { ...base, species_name: 'S'.repeat(200), description: 'd'.repeat(4990) }, null, {});
    expect(written().description.length).toBe(5000);
    expect(written().description.startsWith(`Other: ${'S'.repeat(200)}\n\n`)).toBe(true);
  });

  test('stores the resident-picked category for an Other report', async () => {
    await createTurnover(7, { ...base, species_name: 'Other', species_category: 'Reptile' }, null, {});
    expect(written().species_category).toBe('Reptile');
  });
});
