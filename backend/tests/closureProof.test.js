// Closing a ticket requires evidence that the work happened.
//
// WHICH transitions: the SUCCESSFUL closures only - complaint Resolved, request
// Completed, wildlife Released or Transferred. `Rejected` and `Deceased` are
// deliberately EXEMPT: there is often nothing to photograph, and requiring it
// would leave staff holding a report they cannot close at all.
//
// Wildlife has no proof column. It reuses chain_of_custody_photos, which
// already exists and already has its own upload endpoint - so its gate reads
// STORED ROW STATE rather than the request body, which is why the check lives
// in the service and not in a validator.
//
// Fixtures mirror the REAL `existing` select of each service (including the
// nested user / resident relation), and the mocks cover $transaction and the
// notify modules the services actually import.

jest.mock('../src/utils/prisma', () => ({
  complaint: { findFirst: jest.fn(), update: jest.fn() },
  environmentalRequest: { findFirst: jest.fn(), update: jest.fn() },
  wildlifeTurnover: { findFirst: jest.fn(), update: jest.fn() },
  complaintStatusHistory: { create: jest.fn() },
  requestStatusHistory: { create: jest.fn() },
  wildlifeStatusHistory: { create: jest.fn() },
  systemSetting: { findUnique: jest.fn(async () => null) },
  requestType: { findUnique: jest.fn(async () => null) },
  $transaction: jest.fn(),
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyReportStatus: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({ notifyStatusChange: jest.fn() }));

const prisma = require('../src/utils/prisma');

// First findFirst is the service's `existing` load; the second is the trailing
// getX() detail read, which echoes whatever status the update wrote.
function stubRow(model, existing) {
  model.findFirst
    .mockReset()
    .mockResolvedValueOnce(existing)
    .mockImplementation(() => Promise.resolve({
      status: model.update.mock.calls.length
        ? model.update.mock.calls[0][0].data.status
        : existing.status,
    }));
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
  prisma.complaint.update.mockResolvedValue({});
  prisma.environmentalRequest.update.mockResolvedValue({});
  prisma.wildlifeTurnover.update.mockResolvedValue({});
});

describe('a complaint cannot be Resolved without proof', () => {
  const svc = require('../src/services/staff.complaint.service');

  const row = (over = {}) => ({
    complaint_id: 1, tracking_id: 'CMP-2026-00001', status: 'In_Progress',
    resolved_at: null, sla_started_at: null, sla_deadline: null,
    user_id: 7, archived_at: null,
    user: { email: 'juan@example.com', first_name: 'Juan' },
    resolution_proof_path: null, ...over,
  });

  test('REFUSED with no proof', async () => {
    stubRow(prisma.complaint, row());
    await expect(svc.updateComplaintStatus(9, '1', { status: 'Resolved' }, {}))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/proof|photo|evidence/i) });
    expect(prisma.complaint.update).not.toHaveBeenCalled();
  });

  test('accepted when a proof path is supplied with the transition', async () => {
    stubRow(prisma.complaint, row());
    const out = await svc.updateComplaintStatus(9, '1', { status: 'Resolved', resolution_proof_path: '/uploads/proof/a.jpg' }, {});
    expect(out.status).toBe('Resolved');
    expect(prisma.complaint.update.mock.calls[0][0].data.resolution_proof_path).toBe('/uploads/proof/a.jpg');
  });

  test('accepted when the row ALREADY carries proof from an earlier upload', async () => {
    // Staff may upload the photo, then change the status in a second request.
    stubRow(prisma.complaint, row({ resolution_proof_path: '/uploads/proof/earlier.jpg' }));
    const out = await svc.updateComplaintStatus(9, '1', { status: 'Resolved' }, {});
    expect(out.status).toBe('Resolved');
  });

  test('REJECTED IS EXEMPT - the opposite polarity, so the rule cannot be written as "any terminal status"', async () => {
    stubRow(prisma.complaint, row());
    const out = await svc.updateComplaintStatus(9, '1', { status: 'Rejected' }, {});
    expect(out.status).toBe('Rejected');
  });

  test('a non-terminal transition is unaffected', async () => {
    stubRow(prisma.complaint, row());
    const out = await svc.updateComplaintStatus(9, '1', { status: 'In_Progress' }, {});
    expect(out.status).toBe('In_Progress');
  });
});

describe('a request cannot be Completed without proof', () => {
  const svc = require('../src/services/staff.request.service');

  const row = (over = {}) => ({
    request_id: 1, tracking_id: 'REQ-2026-00001', status: 'Scheduled',
    request_type: 'Garbage_Hauling',
    sla_started_at: null, sla_deadline: null,
    scheduled_date: null, completion_date: null, approval_date: null,
    user_id: 7, archived_at: null,
    user: { email: 'juan@example.com', first_name: 'Juan' },
    completion_proof_path: null, ...over,
  });

  test('REFUSED with no proof', async () => {
    stubRow(prisma.environmentalRequest, row());
    await expect(svc.updateRequestStatus(9, '1', { status: 'Completed' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(prisma.environmentalRequest.update).not.toHaveBeenCalled();
  });

  test('accepted with proof', async () => {
    stubRow(prisma.environmentalRequest, row());
    const out = await svc.updateRequestStatus(9, '1', { status: 'Completed', completion_proof_path: '/uploads/proof/b.jpg' }, {});
    expect(out.status).toBe('Completed');
    expect(prisma.environmentalRequest.update.mock.calls[0][0].data.completion_proof_path).toBe('/uploads/proof/b.jpg');
  });

  test('accepted when the row ALREADY carries proof', async () => {
    stubRow(prisma.environmentalRequest, row({ completion_proof_path: '/uploads/proof/earlier.jpg' }));
    const out = await svc.updateRequestStatus(9, '1', { status: 'Completed' }, {});
    expect(out.status).toBe('Completed');
  });

  test('Rejected is exempt', async () => {
    stubRow(prisma.environmentalRequest, row());
    const out = await svc.updateRequestStatus(9, '1', { status: 'Rejected' }, {});
    expect(out.status).toBe('Rejected');
  });
});

describe('a wildlife turnover cannot be Released without a custody photo', () => {
  const svc = require('../src/services/staff.wildlife.service');

  const row = (over = {}) => ({
    turnover_id: 1, reference_id: 'WLD-2026-00001', status: 'Under_Care',
    sla_deadline: null, intake_date: null, release_date: null,
    reported_by: 7, archived_at: null,
    resident: { email: 'juan@example.com', first_name: 'Juan' },
    chain_of_custody_photos: [], ...over,
  });

  test('REFUSED with an empty custody array - the gate reads STORED state, not the body', async () => {
    stubRow(prisma.wildlifeTurnover, row());
    await expect(svc.updateTurnoverStatus(9, '1', { status: 'Released' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(prisma.wildlifeTurnover.update).not.toHaveBeenCalled();
  });

  test('accepted with one custody photo', async () => {
    stubRow(prisma.wildlifeTurnover, row({ chain_of_custody_photos: ['/uploads/custody/a.jpg'] }));
    const out = await svc.updateTurnoverStatus(9, '1', { status: 'Released' }, {});
    expect(out.status).toBe('Released');
  });

  test('Transferred needs one too', async () => {
    stubRow(prisma.wildlifeTurnover, row());
    await expect(svc.updateTurnoverStatus(9, '1', { status: 'Transferred' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('DECEASED IS EXEMPT - there may be nothing to photograph, and the report must still close', async () => {
    stubRow(prisma.wildlifeTurnover, row());
    const out = await svc.updateTurnoverStatus(9, '1', { status: 'Deceased' }, {});
    expect(out.status).toBe('Deceased');
  });

  test('a null custody column is treated as empty, not as a crash', async () => {
    // The column is Json? and is null on every row filed before custody photos
    // existed. Array.isArray(null) is false, so the count must come from a
    // guarded read.
    stubRow(prisma.wildlifeTurnover, row({ chain_of_custody_photos: null }));
    await expect(svc.updateTurnoverStatus(9, '1', { status: 'Released' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});
