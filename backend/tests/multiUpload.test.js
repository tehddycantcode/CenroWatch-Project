// Multiple photos per report, and uploads that are now mandatory.
//
// WHY THIS SUITE EXISTS. Two things changed at once on 2026-10-12 and each one
// can break a client that is already in someone's hands:
//
//   1. THE FIELD NAME. Reports used to arrive as a single multipart field
//      (`photo` / `document`) read off req.file. They now arrive as up to five
//      under a PLURAL name, read off req.files. Every installed APK and every
//      cached web bundle still sends the singular name, so BOTH must work - and
//      a break here would 422 the person AFTER they had filled in the entire
//      form, which is the failure shape CLAUDE.md records for the register
//      token and for the walk-in location rule. The back-compat tests below are
//      the point of this file; delete them and the next refactor silently cuts
//      off every phone that has not taken the update.
//
//   2. THE UPLOAD BECAME REQUIRED on wildlife turnovers, on service requests
//      and on ANONYMOUS complaints. The anonymous one was a deliberate
//      exemption - a whistleblower may have no safe way to photograph anything
//      - and it was overruled on the user's instruction. A test asserts the
//      refusal so nobody "restores" the exemption by accident while tidying.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-multi-upload';

jest.mock('../src/services/complaint.service', () => ({ createComplaint: jest.fn(async () => ({ reference_id: 'CMP-1' })) }));
jest.mock('../src/services/wildlife.service', () => ({ createTurnover: jest.fn(async () => ({ reference_id: 'WLD-1' })) }));
jest.mock('../src/services/request.service', () => ({ createRequest: jest.fn(async () => ({ reference_id: 'REQ-1' })) }));
jest.mock('../src/services/storage', () => ({
  save: jest.fn(async (dir, f) => `/uploads/${dir}/${f.originalname}`),
  signFiles: jest.fn(async (x) => x),
}));

const complaintService = require('../src/services/complaint.service');
const wildlifeService = require('../src/services/wildlife.service');
const requestService = require('../src/services/request.service');
const storage = require('../src/services/storage');
const { filesFrom, saveAll } = require('../src/utils/uploadFields');

const complaintController = require('../src/controllers/complaint.controller');
const wildlifeController = require('../src/controllers/wildlife.controller');
const requestController = require('../src/controllers/request.controller');

const file = (name) => ({ originalname: name, buffer: Buffer.from('x') });

// upload.fields() sets req.files to an object keyed by field name.
function req(files = {}, body = {}) {
  return { files, body, user: { user_id: 5 }, ip: '10.0.0.1', params: {}, query: {} };
}
// AWAITING THE CONTROLLER IS NOT ENOUGH, and getting this wrong makes the tests
// lie rather than fail: asyncHandler does `Promise.resolve(fn(...)).catch(next)`
// WITHOUT returning that promise, so `await controller(...)` resolves after one
// microtask - before storage.save() has run and before the service is called.
// Written that way first, six of these passed on an empty mock.calls list.
// So resolve on the handler's real completion signal instead: res.json() for a
// success, next(err) for a failure.
function run(controller, request) {
  return new Promise((resolve) => {
    const response = { statusCode: 200, body: null };
    response.status = (c) => { response.statusCode = c; return response; };
    response.json = (b) => { response.body = b; resolve({ response, err: null }); return response; };
    controller(request, response, (err) => resolve({ response, err: err || new Error('next() called with no error') }));
  });
}

beforeEach(() => jest.clearAllMocks());

describe('filesFrom - reading both field names', () => {
  test('merges the singular and plural fields, singular first', () => {
    const r = req({ photo: [file('one.jpg')], photos: [file('two.jpg'), file('three.jpg')] });
    expect(filesFrom(r, 'photo', 'photos').map((f) => f.originalname))
      .toEqual(['one.jpg', 'two.jpg', 'three.jpg']);
  });

  test('works with only the OLD singular field - the installed-client path', () => {
    expect(filesFrom(req({ photo: [file('legacy.jpg')] }), 'photo', 'photos')).toHaveLength(1);
  });

  test('works with only the new plural field', () => {
    expect(filesFrom(req({ photos: [file('a.jpg')] }), 'photo', 'photos')).toHaveLength(1);
  });

  test('returns an empty array when neither is present', () => {
    expect(filesFrom(req({}), 'photo', 'photos')).toEqual([]);
    expect(filesFrom({ body: {} }, 'photo', 'photos')).toEqual([]);
  });

  // upload.single() sets req.files to an ARRAY, not an object. Guarding that
  // shape keeps this helper safe if a route is ever switched back.
  test('does not misread an array-shaped req.files', () => {
    expect(filesFrom({ files: [file('a.jpg')], body: {} }, 'photo', 'photos')).toEqual([]);
  });
});

describe('saveAll', () => {
  test('returns the first path and the full list', async () => {
    const out = await saveAll(storage, 'complaints', [file('a.jpg'), file('b.jpg')]);
    expect(out.first).toBe('/uploads/complaints/a.jpg');
    expect(out.all).toEqual(['/uploads/complaints/a.jpg', '/uploads/complaints/b.jpg']);
  });

  test('is empty rather than throwing when nothing was uploaded', async () => {
    expect(await saveAll(storage, 'complaints', [])).toEqual({ first: null, all: [] });
  });
});

describe('complaints', () => {
  test('accepts a report sent under the OLD singular field name', async () => {
    const { err } = await run(complaintController.create, req({ photo: [file('legacy.jpg')] }));
    expect(err).toBeNull();
    expect(complaintService.createComplaint).toHaveBeenCalled();
    const [, , photoPath, , options] = complaintService.createComplaint.mock.calls[0];
    expect(photoPath).toBe('/uploads/complaints/legacy.jpg');
    expect(options.photoPaths).toEqual(['/uploads/complaints/legacy.jpg']);
  });

  test('stores every photo, with the first one as the primary', async () => {
    await run(complaintController.create, req({ photos: [file('a.jpg'), file('b.jpg'), file('c.jpg')] }));
    const [, , photoPath, , options] = complaintService.createComplaint.mock.calls[0];
    expect(photoPath).toBe('/uploads/complaints/a.jpg');
    expect(options.photoPaths).toHaveLength(3);
  });

  test('still refuses a complaint with no photo', async () => {
    const { err } = await run(complaintController.create, req({}));
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
    expect(storage.save).not.toHaveBeenCalled();
  });

  // The exemption that was removed. If someone restores it, this fails.
  test('an ANONYMOUS complaint now requires a photo too', async () => {
    const { err } = await run(complaintController.createAnonymous, req({}));
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
    expect(complaintService.createComplaint).not.toHaveBeenCalled();
  });

  test('an anonymous complaint with a photo is accepted', async () => {
    const { err, response } = await run(complaintController.createAnonymous, req({ photos: [file('a.jpg')] }));
    expect(err).toBeNull();
    expect(response.statusCode).toBe(201);
  });
});

describe('wildlife turnovers', () => {
  test('a photo is now required', async () => {
    const { err } = await run(wildlifeController.create, req({}));
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
    expect(wildlifeService.createTurnover).not.toHaveBeenCalled();
  });

  test('accepts the OLD singular field name', async () => {
    const { err } = await run(wildlifeController.create, req({ photo: [file('legacy.jpg')] }));
    expect(err).toBeNull();
    const [, , photoPath, ctx] = wildlifeService.createTurnover.mock.calls[0];
    expect(photoPath).toBe('/uploads/wildlife/legacy.jpg');
    expect(ctx.photoPaths).toEqual(['/uploads/wildlife/legacy.jpg']);
  });

  test('stores several photos', async () => {
    await run(wildlifeController.create, req({ photos: [file('a.jpg'), file('b.jpg')] }));
    const [, , , ctx] = wildlifeService.createTurnover.mock.calls[0];
    expect(ctx.photoPaths).toHaveLength(2);
  });
});

describe('service requests', () => {
  test('refuses a request with neither a photo nor a document', async () => {
    const { err } = await run(requestController.create, req({}));
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
    expect(requestService.createRequest).not.toHaveBeenCalled();
  });

  // EITHER kind satisfies the rule: a creek clean-up comes with a photo, a
  // permit request comes with a letter. Demanding one specific kind would
  // refuse half of them for having the wrong sort of evidence.
  test('a photo alone is enough', async () => {
    const { err } = await run(requestController.create, req({ photos: [file('a.jpg')] }));
    expect(err).toBeNull();
    const [, , documentPath, ctx] = requestService.createRequest.mock.calls[0];
    expect(documentPath).toBeNull();
    expect(ctx.photoPath).toBe('/uploads/requests/a.jpg');
  });

  test('a document alone is enough - the OLD singular field name', async () => {
    const { err } = await run(requestController.create, req({ document: [file('letter.pdf')] }));
    expect(err).toBeNull();
    const [, , documentPath, ctx] = requestService.createRequest.mock.calls[0];
    expect(documentPath).toBe('/uploads/requests/letter.pdf');
    expect(ctx.documentPaths).toEqual(['/uploads/requests/letter.pdf']);
    expect(ctx.photoPath).toBeNull();
  });

  test('photos and documents are filed under their own columns', async () => {
    await run(requestController.create, req({
      photos: [file('site.jpg')],
      documents: [file('letter.pdf'), file('permit.pdf')],
    }));
    const [, , documentPath, ctx] = requestService.createRequest.mock.calls[0];
    expect(documentPath).toBe('/uploads/requests/letter.pdf');
    expect(ctx.documentPaths).toHaveLength(2);
    expect(ctx.photoPaths).toEqual(['/uploads/requests/site.jpg']);
  });
});
