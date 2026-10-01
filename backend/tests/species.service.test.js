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
  test('creates an active species and writes an audit row with the row id and caller ip pinned', async () => {
    const { writeAuditLog } = require('../src/utils/audit');
    prisma.species.create.mockImplementation(({ data }) => Promise.resolve({ species_id: 7, ...data }));
    const row = await svc.createSpecies(3, { name: 'Luzon Hornbill', category: 'Bird', biome: 'Forest', indicator: 'Endemic' }, { ipAddress: '1.2.3.4' });
    expect(row.name).toBe('Luzon Hornbill');
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPECIES_CREATE', targetTable: 'Species', performedBy: 3,
      targetId: 7, ipAddress: '1.2.3.4',
      // A species created already-retired (is_active: false) must say so in
      // its own SPECIES_CREATE row - otherwise the log records that
      // something was created, not what was created.
      data: expect.objectContaining({ is_active: true }),
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

  test('passes every validated field through to the create call, not just a subset', async () => {
    // A test that only checks row.name, like the first test above, would stay
    // green even if is_endangered were deleted from the data object entirely -
    // that happened for real in review. Assert the whole payload so a dropped
    // field fails loudly here instead of silently publishing an endangered
    // species' coordinates at full precision.
    prisma.species.create.mockImplementation(({ data }) => Promise.resolve({ species_id: 8, ...data }));
    await svc.createSpecies(3, {
      name: 'Philippine Eagle',
      scientific_name: 'Pithecophaga jefferyi',
      local_name: 'Haribon',
      category: 'Bird',
      biome: 'Forest',
      indicator: 'Critically_Endangered',
      hazard: 'Aggressive',
      is_endangered: true,
      is_active: true,
      body_description: 'Large raptor.',
      handling_note: 'Call CENRO immediately.',
      sort_order: 1,
    }, {});
    expect(prisma.species.create.mock.calls[0][0].data).toEqual({
      name: 'Philippine Eagle',
      scientific_name: 'Pithecophaga jefferyi',
      local_name: 'Haribon',
      category: 'Bird',
      biome: 'Forest',
      indicator: 'Critically_Endangered',
      hazard: 'Aggressive',
      is_endangered: true,
      is_active: true,
      body_description: 'Large raptor.',
      handling_note: 'Call CENRO immediately.',
      sort_order: 1,
    });
  });

  test('is_endangered defaults to false when omitted, not true and not dropped', async () => {
    prisma.species.create.mockImplementation(({ data }) => Promise.resolve({ species_id: 9, ...data }));
    const row = await svc.createSpecies(3, { name: 'Monitor Lizard' }, {});
    expect(prisma.species.create.mock.calls[0][0].data.is_endangered).toBe(false);
    expect(row.is_endangered).toBe(false);
  });

  test('is_active defaults to true when omitted, but can be created already retired', async () => {
    // Not in the original brief: a later task backfills historical species as
    // inactive, and without this it would have to call prisma.species.create
    // directly, bypassing this function's audit trail.
    prisma.species.create.mockImplementation(({ data }) => Promise.resolve({ species_id: 10, ...data }));
    const activeByDefault = await svc.createSpecies(3, { name: 'Default Active' }, {});
    expect(activeByDefault.is_active).toBe(true);

    const createdInactive = await svc.createSpecies(3, { name: 'Backfilled Retired Species', is_active: false }, {});
    expect(createdInactive.is_active).toBe(false);
  });

  test.each([
    [true, true], [false, false],
    ['true', true], ['false', false],
    [1, true], [0, false],
    ['1', true], ['0', false],
  ])('is_endangered %p normalises to %p rather than through JS Boolean()', async (input, expected) => {
    // Boolean('false') === true, so a caller that serialises booleans as
    // strings - the seed, a script, a URL-encoded body - could otherwise send
    // 'false' and get an endangered species that silently is not.
    prisma.species.create.mockImplementation(({ data }) => Promise.resolve({ species_id: 21, ...data }));
    const row = await svc.createSpecies(3, { name: `Flag Test ${String(input)}`, is_endangered: input }, {});
    expect(row.is_endangered).toBe(expected);
  });

  test('rejects an is_endangered value that is not a recognised boolean form', async () => {
    await expect(svc.createSpecies(3, { name: 'Bad Flag Species', is_endangered: 'yes' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('parses a numeric-string sort_order the same way update does', async () => {
    prisma.species.create.mockImplementation(({ data }) => Promise.resolve({ species_id: 22, ...data }));
    const row = await svc.createSpecies(3, { name: 'Tarictic Hornbill', sort_order: '10' }, {});
    expect(row.sort_order).toBe(10);
  });

  test('refuses a garbage sort_order instead of silently defaulting it to 0', async () => {
    await expect(svc.createSpecies(3, { name: 'Garbage Sort Order', sort_order: 'abc' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('caps scientific_name and local_name at 200 characters instead of letting MySQL reject them', async () => {
    const tooLong = 'x'.repeat(201);
    await expect(svc.createSpecies(3, { name: 'Long Fields', scientific_name: tooLong }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
    await expect(svc.createSpecies(3, { name: 'Long Fields 2', local_name: tooLong }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('updateSpecies', () => {
  beforeEach(() => {
    // Keyed off `where.species_id` rather than hardcoded, so tests that
    // target a row other than id 1 (retirement, reactivation, audit-id
    // checks below) get a resolved row whose id actually matches what was
    // requested.
    prisma.species.update.mockImplementation(({ where, data }) => Promise.resolve({ species_id: where.species_id, ...data }));
  });

  test('updates editable fields', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    const row = await svc.updateSpecies(3, 1, { body_description: 'A duck.' }, {});
    expect(row.body_description).toBe('A duck.');
  });

  test('THE NAME IS NOT EDITABLE - refused outright, not silently dropped', async () => {
    // It is the foreign key every report stores, and it also appears in exported
    // PDFs and audit payloads that cannot be rewritten - a rename would silently
    // split one species' history in two. Retire and replace instead. A 200 that
    // quietly discarded the rename told the Admin nothing; this must reject and
    // must never reach the database.
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    await expect(svc.updateSpecies(3, 1, { name: 'Anas luzonica', body_description: 'x' }, {}))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('cannot be changed') });
    expect(prisma.species.update).not.toHaveBeenCalled();
  });

  test('REFUSES a name-only rename with the specific reason, not the generic "nothing to change" message', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    await expect(svc.updateSpecies(3, 1, { name: 'Anas luzonica' }, {}))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('cannot be changed') });
    expect(prisma.species.update).not.toHaveBeenCalled();
  });

  test('resubmitting the current name unchanged, alongside a real edit, is not treated as a rename', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    const row = await svc.updateSpecies(3, 1, { name: 'Philippine Duck', body_description: 'A duck.' }, {});
    expect(row.body_description).toBe('A duck.');
    expect(prisma.species.update.mock.calls[0][0].data.name).toBeUndefined();
  });

  test('refuses an update with nothing in it', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'X', is_active: true });
    await expect(svc.updateSpecies(3, 1, {}, {}))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('Nothing to change') });
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
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('last active species') });
  });

  test('REFUSES TO RETIRE THE "Other" SENTINEL', async () => {
    // Review Focus 3. Retiring it removes the specify box from the form AND
    // resolveSpecies()'s only fallback, so every uncatalogued species would
    // start erroring - with nothing about the Admin's action to explain it.
    prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true });
    prisma.species.count.mockResolvedValue(11);
    await expect(svc.updateSpecies(3, 11, { is_active: false }, {}))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('cannot be retired') });
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
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('must stay marked endangered') });
  });

  test('a refused update writes no audit row', async () => {
    // Holds today because every guard throws before writeAuditLog is called -
    // worth pinning, because moving the log above the guards ("log the
    // attempt") is a plausible-looking change that would keep the suite green
    // while writing audit rows that claim changes which never happened.
    const { writeAuditLog } = require('../src/utils/audit');
    prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true, is_endangered: true });
    await expect(svc.updateSpecies(3, 11, { is_active: false }, {})).rejects.toMatchObject({ statusCode: 422 });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  describe('no representation of "false" can slip past a guard, whichever form it arrives in', () => {
    // The guards read `data.is_endangered`/`data.is_active` - already
    // normalised by toBool() - never `input` directly. Reading
    // `input.is_endangered === false` instead would look like a harmless
    // simplification and would still pass every OTHER test in this file,
    // since they only ever send real booleans; {"is_endangered": 0} would
    // walk straight past a guard written that way. These cover both valid
    // alternate spellings of false (which must still trip the guard, with
    // its own message) and values toBool rejects outright (which must still
    // 422, just earlier, with toBool's generic message).
    test.each([
      ['false', false, 'must stay marked endangered'],
      ['the number 0', 0, 'must stay marked endangered'],
      ['an empty string', '', 'true or false'],
      ['null', null, 'true or false'],
    ])('is_endangered = %s on the "Other" row is refused (%s)', async (_label, value, fragment) => {
      prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true, is_endangered: true });
      await expect(svc.updateSpecies(3, 11, { is_endangered: value }, {}))
        .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining(fragment) });
      expect(prisma.species.update).not.toHaveBeenCalled();
    });

    test.each([
      ['false', false, 'cannot be retired'],
      ['the number 0', 0, 'cannot be retired'],
      ['an empty string', '', 'true or false'],
      ['null', null, 'true or false'],
    ])('is_active = %s on the "Other" row is refused (%s)', async (_label, value, fragment) => {
      prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true });
      prisma.species.count.mockResolvedValue(11);
      await expect(svc.updateSpecies(3, 11, { is_active: value }, {}))
        .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining(fragment) });
      expect(prisma.species.update).not.toHaveBeenCalled();
    });

    test.each([
      ['false', false, 'last active species'],
      ['the number 0', 0, 'last active species'],
      ['an empty string', '', 'true or false'],
      ['null', null, 'true or false'],
    ])('is_active = %s on the last active (non-sentinel) species is refused (%s)', async (_label, value, fragment) => {
      prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
      prisma.species.count.mockResolvedValue(1);
      await expect(svc.updateSpecies(3, 1, { is_active: value }, {}))
        .rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining(fragment) });
      expect(prisma.species.update).not.toHaveBeenCalled();
    });
  });

  test('retiring with the string "false" actually retires, rather than silently reactivating', async () => {
    // Boolean('false') is true, so without toBool() this would have flipped
    // is_active to true instead - a retired species reappearing in every
    // resident's dropdown with an audit row claiming the save succeeded.
    prisma.species.findUnique.mockResolvedValue({ species_id: 2, name: 'Philippine Duck', is_active: true, is_endangered: false });
    prisma.species.count.mockResolvedValue(5);
    const row = await svc.updateSpecies(3, 2, { is_active: 'false' }, {});
    expect(row.is_active).toBe(false);
  });

  test('"false" as a string cannot be used to clear the sentinel endangered flag', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true, is_endangered: true });
    await expect(svc.updateSpecies(3, 11, { is_endangered: 'false' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('rejects an is_active value that is not a recognised boolean form', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    await expect(svc.updateSpecies(3, 1, { is_active: 'retired' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('retiring a species logs SPECIES_RETIRE, not SPECIES_UPDATE, with the before/after recorded', async () => {
    const { writeAuditLog } = require('../src/utils/audit');
    prisma.species.findUnique.mockResolvedValue({ species_id: 2, name: 'Philippine Duck', is_active: true, is_endangered: false });
    prisma.species.count.mockResolvedValue(5);
    await svc.updateSpecies(3, 2, { is_active: false }, { ipAddress: '9.9.9.9' });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPECIES_RETIRE',
      targetTable: 'Species',
      targetId: 2,
      ipAddress: '9.9.9.9',
      data: expect.objectContaining({ is_active: { from: true, to: false } }),
    }));
  });

  test('reactivating a species stays SPECIES_UPDATE, with the direction recorded', async () => {
    const { writeAuditLog } = require('../src/utils/audit');
    prisma.species.findUnique.mockResolvedValue({ species_id: 2, name: 'Philippine Duck', is_active: false, is_endangered: false });
    await svc.updateSpecies(3, 2, { is_active: true }, {});
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPECIES_UPDATE',
      data: expect.objectContaining({ is_active: { from: false, to: true } }),
    }));
  });

  test('changing the endangered flag records which direction it moved', async () => {
    const { writeAuditLog } = require('../src/utils/audit');
    prisma.species.findUnique.mockResolvedValue({ species_id: 3, name: 'Philippine Eagle', is_active: true, is_endangered: false });
    await svc.updateSpecies(3, 3, { is_endangered: true }, {});
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPECIES_UPDATE',
      data: expect.objectContaining({ is_endangered: { from: false, to: true } }),
    }));
  });

  test('audits an update with the row id and caller ip pinned, not left to defaults', async () => {
    const { writeAuditLog } = require('../src/utils/audit');
    prisma.species.findUnique.mockResolvedValue({ species_id: 5, name: 'Philippine Duck', is_active: true, is_endangered: false });
    await svc.updateSpecies(3, 5, { body_description: 'A duck.' }, { ipAddress: '8.8.8.8' });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPECIES_UPDATE', targetTable: 'Species', performedBy: 3,
      targetId: 5, ipAddress: '8.8.8.8',
    }));
  });

  test('parses a numeric-string sort_order the same way create does', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    const row = await svc.updateSpecies(3, 1, { sort_order: '10' }, {});
    expect(row.sort_order).toBe(10);
  });

  test('refuses a garbage sort_order instead of silently defaulting it to 0', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    await expect(svc.updateSpecies(3, 1, { sort_order: 'abc' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('caps scientific_name at 200 characters', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    const tooLong = 'x'.repeat(201);
    await expect(svc.updateSpecies(3, 1, { scientific_name: tooLong }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});
