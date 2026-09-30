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
