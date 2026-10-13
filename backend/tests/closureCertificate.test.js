// The signed closure document: upload, removal, and who may see it.
//
// WHY THIS SUITE EXISTS. This is the first upload in the system that a RESIDENT
// can read, so three things have to hold and none of them is enforced by the
// type system:
//
//   1. IT IS NOT THE WORK PROOF. resolution_proof_path / completion_proof_path
//      are CENRO's own evidence, they are REQUIRED to close a case, and they
//      stay internal. This column is the counter-signed paperwork handed back,
//      and it is OPTIONAL. A test asserts the upload does not touch `status`,
//      so nobody "tidies" it into the closing transition - which would mean a
//      case could not be closed until another office returned the signature.
//
//   2. IT ACCEPTS A PDF. proofUpload defaults to IMAGE_MIME, so before this
//      existed staff literally could not file a scanned signed form. The route
//      uses a separate DOC_MIME uploader; widening proofUpload instead would
//      have let a PDF stand in for a photograph of completed work.
//
//   3. IT IS REFUSED ON AN OPEN CASE, for the same reason the PDF withholds its
//      signature lines there: certifying work that has not finished is a false
//      document.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-closure-certificate';

const mockPrisma = {
  complaint: { findFirst: jest.fn(), update: jest.fn() },
  wildlifeTurnover: { findFirst: jest.fn(), update: jest.fn() },
  environmentalRequest: { findFirst: jest.fn(), update: jest.fn() },
};

jest.mock('../src/utils/prisma', () => mockPrisma);
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn(async () => ({})) }));
jest.mock('../src/services/storage', () => ({
  save: jest.fn(async (dir, f) => `/uploads/${dir}/${f.originalname}`),
  remove: jest.fn(async () => {}),
  signFiles: jest.fn(async (x) => x),
}));
jest.mock('../src/services/staff.complaint.service', () => ({ getComplaint: jest.fn(async () => ({ tracking_id: 'CMP-1' })) }));
jest.mock('../src/services/staff.wildlife.service', () => ({ getTurnover: jest.fn(async () => ({ reference_id: 'WLD-1' })) }));
jest.mock('../src/services/staff.request.service', () => ({ getRequest: jest.fn(async () => ({ tracking_id: 'REQ-1' })) }));

const { writeAuditLog } = require('../src/utils/audit');
const storage = require('../src/services/storage');
const service = require('../src/services/closureCertificate.service');
const controller = require('../src/controllers/closureCertificate.controller');
const { DOC_MIME, IMAGE_MIME } = require('../src/middlewares/upload');

// AWAITING THE CONTROLLER IS NOT ENOUGH: asyncHandler does
// Promise.resolve(fn(...)).catch(next) WITHOUT returning that promise, so
// `await controller(...)` resolves after one microtask - before storage.save()
// has run. Resolve on the handler's real completion signal instead.
function run(handler, request) {
  return new Promise((resolve) => {
    const response = { statusCode: 200, body: null };
    response.status = (c) => { response.statusCode = c; return response; };
    response.json = (b) => { response.body = b; resolve({ response, err: null }); return response; };
    handler(request, response, (err) => resolve({ response, err: err || new Error('next() with no error') }));
  });
}

const req = (over = {}) => ({
  params: { id: '7' }, body: {}, user: { user_id: 3 }, ip: '10.0.0.1', ...over,
});
const pdf = { originalname: 'signed.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-') };

function stubComplaint(over = {}) {
  mockPrisma.complaint.findFirst.mockResolvedValue({
    complaint_id: 7, tracking_id: 'CMP-2026-00042', status: 'Resolved',
    archived_at: null, closure_certificate_path: null, ...over,
  });
  mockPrisma.complaint.update.mockResolvedValue({});
}
function stubWildlife(over = {}) {
  mockPrisma.wildlifeTurnover.findFirst.mockResolvedValue({
    turnover_id: 7, reference_id: 'WLD-2026-00014', status: 'Transferred',
    archived_at: null, closure_certificate_path: null, ...over,
  });
  mockPrisma.wildlifeTurnover.update.mockResolvedValue({});
}
function stubRequest(over = {}) {
  mockPrisma.environmentalRequest.findFirst.mockResolvedValue({
    request_id: 7, tracking_id: 'REQ-2026-00008', status: 'Completed',
    archived_at: null, closure_certificate_path: null, ...over,
  });
  mockPrisma.environmentalRequest.update.mockResolvedValue({});
}

beforeEach(() => jest.clearAllMocks());

describe('the upload filter accepts a scanned signed form', () => {
  test('DOC_MIME takes a PDF; IMAGE_MIME does not', () => {
    // The reason the route needs its own uploader: proofUpload defaults to
    // IMAGE_MIME, so a scanned certification off an office scanner was refused.
    expect(DOC_MIME.test('application/pdf')).toBe(true);
    expect(IMAGE_MIME.test('application/pdf')).toBe(false);
  });

  test('DOC_MIME still takes the phone-camera formats', () => {
    for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect(DOC_MIME.test(m)).toBe(true);
    }
  });

  test('and refuses anything else', () => {
    for (const m of ['application/x-msdownload', 'text/html', 'image/svg+xml', 'application/zip']) {
      expect(DOC_MIME.test(m)).toBe(false);
    }
  });
});

describe('attaching a certificate', () => {
  test('stores the path, audits it, and reloads the record', async () => {
    stubComplaint();
    const record = await service.setCertificate('complaint', 3, '7', '/uploads/certificates/x.pdf', { ipAddress: '1.2.3.4' });

    expect(mockPrisma.complaint.update).toHaveBeenCalledWith({
      where: { complaint_id: 7 },
      data: { closure_certificate_path: '/uploads/certificates/x.pdf' },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      performedBy: 3,
      action: 'CLOSURE_CERTIFICATE_UPLOADED',
      targetTable: 'Complaint',
      targetId: 7,
      ipAddress: '1.2.3.4',
    }));
    expect(record).toEqual({ tracking_id: 'CMP-1' });
  });

  test('DOES NOT TOUCH status - it is not part of closing the case', async () => {
    stubComplaint();
    await service.setCertificate('complaint', 3, '7', '/uploads/certificates/x.pdf');
    const [[{ data }]] = mockPrisma.complaint.update.mock.calls;
    expect(Object.keys(data)).toEqual(['closure_certificate_path']);
  });

  test('works for all three kinds, against the right table', async () => {
    stubWildlife();
    await service.setCertificate('wildlife', 3, '7', '/uploads/certificates/w.pdf');
    expect(mockPrisma.wildlifeTurnover.update).toHaveBeenCalledWith({
      where: { turnover_id: 7 }, data: { closure_certificate_path: '/uploads/certificates/w.pdf' },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ targetTable: 'WildlifeTurnover' }));

    jest.clearAllMocks();
    stubRequest();
    await service.setCertificate('request', 3, '7', '/uploads/certificates/r.pdf');
    expect(mockPrisma.environmentalRequest.update).toHaveBeenCalledWith({
      where: { request_id: 7 }, data: { closure_certificate_path: '/uploads/certificates/r.pdf' },
    });
  });

  test('looks a record up by reference as well as by numeric id', async () => {
    stubComplaint();
    await service.setCertificate('complaint', 3, 'CMP-2026-00042', '/uploads/certificates/x.pdf');
    expect(mockPrisma.complaint.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tracking_id: 'CMP-2026-00042' },
    }));
  });

  test('replacing one deletes the superseded scan, and says so in the audit row', async () => {
    stubComplaint({ closure_certificate_path: '/uploads/certificates/old.pdf' });
    await service.setCertificate('complaint', 3, '7', '/uploads/certificates/new.pdf');
    expect(storage.remove).toHaveBeenCalledWith('/uploads/certificates/old.pdf');
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ replaced: true }),
    }));
  });

  test('the first upload deletes nothing', async () => {
    stubComplaint();
    await service.setCertificate('complaint', 3, '7', '/uploads/certificates/new.pdf');
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe('refusals', () => {
  test.each([
    ['Pending'], ['Under_Review'], ['Approved'], ['In_Progress'], ['Rejected'],
  ])('an open complaint (%s) is refused with 409', async (status) => {
    stubComplaint({ status });
    await expect(service.setCertificate('complaint', 3, '7', '/uploads/x.pdf'))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.complaint.update).not.toHaveBeenCalled();
  });

  test.each([['Pending_Review'], ['Priority_Review'], ['Under_Care'], ['Deceased']])(
    'an open turnover (%s) is refused',
    async (status) => {
      stubWildlife({ status });
      await expect(service.setCertificate('wildlife', 3, '7', '/uploads/x.pdf'))
        .rejects.toMatchObject({ statusCode: 409 });
    },
  );

  test('the refusal names the state the case is actually in', async () => {
    stubComplaint({ status: 'In_Progress' });
    await expect(service.setCertificate('complaint', 3, '7', '/uploads/x.pdf'))
      .rejects.toThrow(/currently In Progress/);
  });

  test('a missing record is 404, not a silent no-op', async () => {
    mockPrisma.complaint.findFirst.mockResolvedValue(null);
    await expect(service.setCertificate('complaint', 3, '999', '/uploads/x.pdf'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('an archived record is refused', async () => {
    stubComplaint({ archived_at: new Date() });
    await expect(service.setCertificate('complaint', 3, '7', '/uploads/x.pdf'))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('no path at all is 422 and never reaches the database', async () => {
    stubComplaint();
    await expect(service.setCertificate('complaint', 3, '7', null))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(mockPrisma.complaint.findFirst).not.toHaveBeenCalled();
  });

  test('an unknown kind throws rather than guessing a table', () => {
    expect(() => service.KINDS.nonsense).not.toThrow();
    return expect(service.setCertificate('nonsense', 3, '7', '/uploads/x.pdf'))
      .rejects.toThrow(/Unknown report kind/);
  });
});

describe('removing a certificate', () => {
  test('nulls the column, deletes the file, and audits the removal', async () => {
    stubComplaint({ closure_certificate_path: '/uploads/certificates/wrong.pdf' });
    await service.clearCertificate('complaint', 3, '7', { ipAddress: '1.2.3.4' });

    expect(mockPrisma.complaint.update).toHaveBeenCalledWith({
      where: { complaint_id: 7 }, data: { closure_certificate_path: null },
    });
    expect(storage.remove).toHaveBeenCalledWith('/uploads/certificates/wrong.pdf');
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CLOSURE_CERTIFICATE_REMOVED', targetTable: 'Complaint', targetId: 7,
    }));
  });

  test('removing one that is not there is 404, not a no-op success', async () => {
    stubComplaint({ closure_certificate_path: null });
    await expect(service.clearCertificate('complaint', 3, '7'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.complaint.update).not.toHaveBeenCalled();
  });
});

describe('the controller', () => {
  test('mints the stored path from the uploaded file, never from the body', async () => {
    // Otherwise a caller could post any string and point the record at an
    // arbitrary path - the same rule the proof upload already follows.
    stubComplaint();
    const { response, err } = await run(controller.uploadComplaint, req({
      file: pdf,
      body: { closure_certificate_path: '/uploads/somebody/elses/file.pdf' },
    }));
    expect(err).toBeNull();
    expect(storage.save).toHaveBeenCalledWith('certificates', pdf);
    const [[{ data }]] = mockPrisma.complaint.update.mock.calls;
    expect(data.closure_certificate_path).toBe('/uploads/certificates/signed.pdf');
    expect(response.statusCode).toBe(201);
  });

  test('no file is 422 and nothing is saved', async () => {
    stubComplaint();
    const { err } = await run(controller.uploadComplaint, req({ file: undefined }));
    expect(err).toMatchObject({ statusCode: 422 });
    expect(storage.save).not.toHaveBeenCalled();
    expect(mockPrisma.complaint.update).not.toHaveBeenCalled();
  });

  test('returns each kind under the key its existing endpoints already use', async () => {
    stubComplaint();
    const c = await run(controller.uploadComplaint, req({ file: pdf }));
    expect(Object.keys(c.response.body.data)).toEqual(['complaint']);

    jest.clearAllMocks();
    stubWildlife();
    const w = await run(controller.uploadWildlife, req({ file: pdf }));
    expect(Object.keys(w.response.body.data)).toEqual(['turnover']);

    jest.clearAllMocks();
    stubRequest();
    const r = await run(controller.uploadRequest, req({ file: pdf }));
    expect(Object.keys(r.response.body.data)).toEqual(['request']);
  });

  test('the response is signed, so the client gets a servable URL', async () => {
    stubComplaint();
    await run(controller.uploadComplaint, req({ file: pdf }));
    expect(storage.signFiles).toHaveBeenCalled();
  });

  test('a refusal reaches next(), not a 2xx', async () => {
    stubComplaint({ status: 'Pending' });
    const { err } = await run(controller.uploadComplaint, req({ file: pdf }));
    expect(err).toMatchObject({ statusCode: 409 });
  });
});

describe('the column is signed on its way out', () => {
  test('closure_certificate_path is in storage FILE_FIELDS', () => {
    // signFiles matches on KEY NAME against an explicit allowlist. A column
    // missing from it returns a bare path that 403s at /uploads - which is how
    // this would fail: silently, and only for the resident trying to open it.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'src', 'services', 'storage', 'index.js'), 'utf8',
    );
    const block = src.match(/const FILE_FIELDS = new Set\(\[([\s\S]*?)\]\)/)[1];
    expect(block).toContain("'closure_certificate_path'");
  });

  test('every service that reads a case selects the column', () => {
    // Six selects - three staff, three resident. A missing one means the
    // certificate is invisible on that surface with no error anywhere.
    const fs = require('fs');
    const path = require('path');
    for (const f of [
      'staff.complaint.service.js', 'staff.wildlife.service.js', 'staff.request.service.js',
      'complaint.service.js', 'wildlife.service.js', 'request.service.js',
    ]) {
      const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', f), 'utf8');
      expect(src).toContain('closure_certificate_path: true');
    }
  });
});
