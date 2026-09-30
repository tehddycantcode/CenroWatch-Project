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
});

describe('a catalogue with no Other row', () => {
  test('fails loudly rather than writing a broken foreign key', async () => {
    // Only reachable if someone deletes the seeded row directly in SQL.
    catalogue([]);
    await expect(resolveSpecies('Sea turtle')).rejects.toThrow(/catalogue/i);
  });
});
