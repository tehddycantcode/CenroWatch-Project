// Extra sample photographs per species.
//
// WHY THIS SUITE EXISTS. The gallery is the first place in this codebase where
// an Admin uploads SEVERAL licensed files in one request, and three of its rules
// are the kind that look like polish until the day they are missing:
//
//   1. THE CREDIT IS REQUIRED, exactly as it is for the primary photo. Every
//      curated photo is CC BY or CC BY-SA, which require attribution wherever
//      the image is shown. photo_credit on Species was once readable but
//      UNWRITABLE, so uploads got a path and a permanently NULL credit; this
//      table makes the column NOT NULL and the service refuses without one, so
//      that state is unreachable rather than merely discouraged.
//   2. THE CAP IS ENFORCED ON THE TOTAL, not on the batch. Eight uploads of one
//      file each must hit the same ceiling as one upload of eight, or the limit
//      is decoration and the public species endpoint - the hottest read in the
//      system, called by both the wildlife form and the guide - grows without
//      bound.
//   3. REMOVAL IS SCOPED BY BOTH IDS. A photo id alone would let a request
//      aimed at one species delete another species' photo.

jest.mock('../src/utils/prisma', () => ({
  species: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  speciesPhoto: { create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  wildlifeTurnover: { groupBy: jest.fn() },
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/services/storage', () => ({
  save: jest.fn(async (_dir, f) => `/uploads/species/${f.originalname}`),
  remove: jest.fn(async () => {}),
}));

const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const storage = require('../src/services/storage');
const svc = require('../src/services/species.service');

const ADMIN = 7;
const file = (name) => ({ originalname: name });

// A species with `have` photos already on it.
function speciesWith(have) {
  prisma.species.findUnique.mockResolvedValue({
    species_id: 3, name: 'Reticulated Python', _count: { photos: have },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.speciesPhoto.create.mockImplementation(async ({ data }) => ({
    species_photo_id: Math.floor(Math.random() * 1000),
    photo_path: data.photo_path,
    photo_credit: data.photo_credit,
    caption: data.caption,
  }));
});

describe('addSpeciesPhotos', () => {
  test('stores every file in the batch with the shared credit', async () => {
    speciesWith(0);
    const out = await svc.addSpeciesPhotos(ADMIN, 3, [file('a.jpg'), file('b.jpg')], 'Jane Doe, CC BY 4.0', 'coiled');
    expect(out).toHaveLength(2);
    expect(storage.save).toHaveBeenCalledTimes(2);
    const written = prisma.speciesPhoto.create.mock.calls.map((c) => c[0].data);
    expect(written.map((d) => d.photo_path)).toEqual(['/uploads/species/a.jpg', '/uploads/species/b.jpg']);
    expect(written.every((d) => d.photo_credit === 'Jane Doe, CC BY 4.0')).toBe(true);
    expect(written.every((d) => d.caption === 'coiled')).toBe(true);
    // Appended after what is already there, so an upload never reorders the
    // gallery an Admin has already arranged.
    expect(written.map((d) => d.sort_order)).toEqual([0, 1]);
  });

  test('continues the sort order from the photos already present', async () => {
    speciesWith(3);
    await svc.addSpeciesPhotos(ADMIN, 3, [file('c.jpg')], 'CENRO Cabuyao');
    expect(prisma.speciesPhoto.create.mock.calls[0][0].data.sort_order).toBe(3);
  });

  test('REFUSES an upload with no credit, and writes nothing', async () => {
    speciesWith(0);
    await expect(svc.addSpeciesPhotos(ADMIN, 3, [file('a.jpg')], '   ')).rejects.toMatchObject({ statusCode: 422 });
    expect(storage.save).not.toHaveBeenCalled();
    expect(prisma.speciesPhoto.create).not.toHaveBeenCalled();
  });

  test('refuses an empty upload', async () => {
    speciesWith(0);
    await expect(svc.addSpeciesPhotos(ADMIN, 3, [], 'CENRO Cabuyao')).rejects.toMatchObject({ statusCode: 422 });
  });

  test('404s for a species that does not exist', async () => {
    prisma.species.findUnique.mockResolvedValue(null);
    await expect(svc.addSpeciesPhotos(ADMIN, 99, [file('a.jpg')], 'CENRO Cabuyao')).rejects.toMatchObject({ statusCode: 404 });
  });

  // THE POINT OF (2) ABOVE: the cap counts what is stored, not what is sent.
  test('refuses a batch that would push the species past the cap', async () => {
    speciesWith(svc.MAX_GALLERY_PHOTOS - 1);
    await expect(
      svc.addSpeciesPhotos(ADMIN, 3, [file('a.jpg'), file('b.jpg')], 'CENRO Cabuyao'),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(storage.save).not.toHaveBeenCalled();
  });

  test('refuses outright when the species is already at the cap', async () => {
    speciesWith(svc.MAX_GALLERY_PHOTOS);
    await expect(svc.addSpeciesPhotos(ADMIN, 3, [file('a.jpg')], 'CENRO Cabuyao')).rejects.toMatchObject({ statusCode: 422 });
  });

  test('accepts a batch that exactly fills the remaining room', async () => {
    speciesWith(svc.MAX_GALLERY_PHOTOS - 2);
    const out = await svc.addSpeciesPhotos(ADMIN, 3, [file('a.jpg'), file('b.jpg')], 'CENRO Cabuyao');
    expect(out).toHaveLength(2);
  });

  test('writes an audit entry naming the files and the credit', async () => {
    speciesWith(0);
    await svc.addSpeciesPhotos(ADMIN, 3, [file('a.jpg')], 'Jane Doe, CC BY 4.0');
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      performedBy: ADMIN,
      action: 'SPECIES_PHOTO_ADD',
      targetTable: 'Species',
      targetId: 3,
    }));
    const { data } = writeAuditLog.mock.calls[0][0];
    expect(data.added).toEqual(['/uploads/species/a.jpg']);
    expect(data.credit).toBe('Jane Doe, CC BY 4.0');
  });
});

describe('removeSpeciesPhoto', () => {
  test('deletes the row, then the file, then audits it', async () => {
    prisma.speciesPhoto.findFirst.mockResolvedValue({
      species_photo_id: 11, photo_path: '/uploads/species/a.jpg', species: { name: 'Reticulated Python' },
    });
    await svc.removeSpeciesPhoto(ADMIN, 3, 11);
    expect(prisma.speciesPhoto.delete).toHaveBeenCalledWith({ where: { species_photo_id: 11 } });
    expect(storage.remove).toHaveBeenCalledWith('/uploads/species/a.jpg');
    // The path is in the audit row because storage.remove destroys the only
    // other trace of it.
    expect(writeAuditLog.mock.calls[0][0].data.removed).toBe('/uploads/species/a.jpg');
  });

  // (3) ABOVE. Both ids go into the lookup, so a photo id from another species
  // cannot be deleted through this species' URL.
  test('looks the photo up by species AND photo id', async () => {
    prisma.speciesPhoto.findFirst.mockResolvedValue({
      species_photo_id: 11, photo_path: '/uploads/species/a.jpg', species: { name: 'X' },
    });
    await svc.removeSpeciesPhoto(ADMIN, 3, 11);
    expect(prisma.speciesPhoto.findFirst.mock.calls[0][0].where).toEqual({
      species_photo_id: 11, species_id: 3,
    });
  });

  test('404s when the photo does not belong to that species', async () => {
    prisma.speciesPhoto.findFirst.mockResolvedValue(null);
    await expect(svc.removeSpeciesPhoto(ADMIN, 3, 11)).rejects.toMatchObject({ statusCode: 404 });
    expect(prisma.speciesPhoto.delete).not.toHaveBeenCalled();
  });

  // A storage failure must not cost the audit entry for a deletion that already
  // happened - the same reasoning as setSpeciesPhoto's own try/catch.
  test('still audits when the file cannot be removed', async () => {
    prisma.speciesPhoto.findFirst.mockResolvedValue({
      species_photo_id: 11, photo_path: '/uploads/species/a.jpg', species: { name: 'X' },
    });
    storage.remove.mockRejectedValueOnce(new Error('disk gone'));
    await expect(svc.removeSpeciesPhoto(ADMIN, 3, 11)).resolves.toEqual({ species_photo_id: 11 });
    expect(writeAuditLog).toHaveBeenCalled();
  });
});
