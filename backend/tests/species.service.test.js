// Admin-managed wildlife species catalogue.
//
// The guards here are what turn "an Admin can edit a list" into something safe
// to hand over. Two of them protect things a reasonable Admin would not expect
// to be load-bearing: the LAST ACTIVE species (retiring it leaves residents
// staring at an empty dropdown with no way to file anything) and the `Other`
// SENTINEL ROW, whose literal name is what the specify box and
// resolveSpecies()'s fallback both key off.

jest.mock('../src/utils/prisma', () => ({
  species: {
    findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(),
    update: jest.fn(), count: jest.fn(),
  },
  // listAll counts usage with a groupBy on the plain species_name column,
  // because WildlifeTurnover has no `species` relation until a later task.
  wildlifeTurnover: { groupBy: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));

const prisma = require('../src/utils/prisma');
const svc = require('../src/services/species.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.species.findUnique.mockResolvedValue(null);
  prisma.species.findMany.mockResolvedValue([]);
  prisma.species.count.mockResolvedValue(5);
  prisma.wildlifeTurnover.groupBy.mockResolvedValue([]);
});

describe('listActive - what the report forms and the public page read', () => {
  test('returns only active species, ordered for display', async () => {
    prisma.species.findMany.mockResolvedValue([{ name: 'Philippine Duck' }]);
    const out = await svc.listActive();
    expect(out.species).toEqual([{ name: 'Philippine Duck' }]);
    const args = prisma.species.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ is_active: true });
    expect(args.orderBy).toEqual([{ sort_order: 'asc' }, { name: 'asc' }]);
  });

  test('CARRIES NO PERSONAL DATA - this endpoint is public (R.A. 10173)', async () => {
    await svc.listActive();
    const selected = Object.keys(prisma.species.findMany.mock.calls[0][0].select);
    // An allowlist, so adding a column to the model cannot silently widen a
    // public response.
    expect(selected.sort()).toEqual([
      'biome', 'body_description', 'category', 'handling_note', 'hazard',
      'indicator', 'is_endangered', 'local_name', 'name', 'photo_credit',
      'photo_path', 'scientific_name', 'sort_order',
    ]);
  });
});

describe('listAll - the admin view', () => {
  test('reports how many reports use each species', async () => {
    prisma.species.findMany.mockResolvedValue([
      { species_id: 1, name: 'Philippine Duck' },
      { species_id: 2, name: 'Other' },
    ]);
    prisma.wildlifeTurnover.groupBy.mockResolvedValue([
      { species_name: 'Philippine Duck', _count: { _all: 3 } },
    ]);
    const out = await svc.listAll();
    expect(out.species[0].in_use).toBe(3);
    // A species nothing references reports 0, not undefined - the admin screen
    // renders this number directly, and `undefined` would print as blank where
    // an Admin is deciding whether retiring it affects existing records.
    expect(out.species[1].in_use).toBe(0);
  });

  test('includes retired species, which listActive hides', async () => {
    await svc.listAll();
    expect(prisma.species.findMany.mock.calls[0][0].where).toBeUndefined();
  });
});

describe('createSpecies', () => {
  test('creates an active species and writes an audit row', async () => {
    const { writeAuditLog } = require('../src/utils/audit');
    prisma.species.create.mockImplementation(({ data }) => Promise.resolve({ species_id: 7, ...data }));
    const row = await svc.createSpecies(3, { name: 'Luzon Hornbill', category: 'Bird', biome: 'Forest', indicator: 'Endemic' }, { ipAddress: '1.2.3.4' });
    expect(row.name).toBe('Luzon Hornbill');
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPECIES_CREATE', targetTable: 'Species', performedBy: 3,
    }));
  });

  test('refuses a duplicate name with 409, not a database error', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck' });
    await expect(svc.createSpecies(3, { name: 'Philippine Duck' }, {}))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('requires a name', async () => {
    await expect(svc.createSpecies(3, { name: '   ' }, {})).rejects.toMatchObject({ statusCode: 422 });
  });

  test('refuses a category outside the three', async () => {
    await expect(svc.createSpecies(3, { name: 'Frog', category: 'Amphibian' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('updateSpecies', () => {
  beforeEach(() => {
    prisma.species.update.mockImplementation(({ data }) => Promise.resolve({ species_id: 1, ...data }));
  });

  test('updates editable fields', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    const row = await svc.updateSpecies(3, 1, { body_description: 'A duck.' }, {});
    expect(row.body_description).toBe('A duck.');
  });

  test('THE NAME IS NOT EDITABLE', async () => {
    // It is the foreign key every report stores, and it also appears in exported
    // PDFs and audit payloads that cannot be rewritten - a rename would silently
    // split one species' history in two. Retire and replace instead.
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    await svc.updateSpecies(3, 1, { name: 'Anas luzonica', body_description: 'x' }, {});
    expect(prisma.species.update.mock.calls[0][0].data.name).toBeUndefined();
  });

  test('refuses an update with nothing in it', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'X', is_active: true });
    await expect(svc.updateSpecies(3, 1, {}, {})).rejects.toMatchObject({ statusCode: 422 });
  });

  test('404s on a species that does not exist', async () => {
    prisma.species.findUnique.mockResolvedValue(null);
    await expect(svc.updateSpecies(3, 99, { body_description: 'x' }, {}))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('REFUSES TO RETIRE THE LAST ACTIVE SPECIES', async () => {
    // Residents would be left with an empty dropdown and no way to file
    // anything - discovered by a resident, not by the Admin who caused it.
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    prisma.species.count.mockResolvedValue(1);
    await expect(svc.updateSpecies(3, 1, { is_active: false }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('REFUSES TO RETIRE THE "Other" SENTINEL', async () => {
    // Review Focus 3. Retiring it removes the specify box from the form AND
    // resolveSpecies()'s only fallback, so every uncatalogued species would
    // start erroring - with nothing about the Admin's action to explain it.
    prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true });
    prisma.species.count.mockResolvedValue(11);
    await expect(svc.updateSpecies(3, 11, { is_active: false }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('allows harmless edits to the "Other" row', async () => {
    // Its handling_note is real safety copy worth improving; only retiring it
    // and changing its endangered flag are refused.
    prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true });
    const row = await svc.updateSpecies(3, 11, { handling_note: 'Keep back.' }, {});
    expect(row.handling_note).toBe('Keep back.');
  });

  test('REFUSES to make the "Other" row non-endangered', async () => {
    // That flag is the fail-safe for every unidentified animal. Clearing it
    // would start publishing exact locations for exactly the reports we know
    // least about.
    prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true });
    await expect(svc.updateSpecies(3, 11, { is_endangered: false }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});
