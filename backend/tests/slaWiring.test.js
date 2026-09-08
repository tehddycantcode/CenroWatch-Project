// Where the SLA clock starts, and - more importantly - where it must NOT restart.
//
// The workingTime suite proves the arithmetic. This one proves the wiring: that
// the clock is stamped exactly once, on the first approval, and that no later
// status change moves it. There is no state machine in this system, so any staff
// member can walk a complaint backwards; without the stamp-once guard the
// fastest way to erase a breach would be Approved -> Pending -> Approved.

jest.mock('../src/utils/prisma', () => ({
  complaint: { findFirst: jest.fn(), update: jest.fn() },
  complaintStatusHistory: { create: jest.fn() },
  systemSetting: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyReportStatus: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({ notifyStatusChange: jest.fn() }));

const prisma = require('../src/utils/prisma');
const { notifyReportStatus } = require('../src/utils/notify');
const { updateComplaintStatus } = require('../src/services/staff.complaint.service');

const ph = (s) => new Date(`${s}+08:00`);
const APPROVED_AT = ph('2026-09-07T09:00'); // a Monday

// The row as it stands BEFORE the update, plus the detail read that
// updateComplaintStatus performs at the end by calling getComplaint.
function givenComplaint(row) {
  prisma.complaint.findFirst
    .mockResolvedValueOnce({
      complaint_id: 1,
      tracking_id: 'CMP-2026-00001',
      status: 'Pending',
      resolved_at: null,
      sla_started_at: null,
      sla_deadline: null,
      user_id: 7,
      archived_at: null,
      user: { email: 'juan@example.com', first_name: 'Juan' },
      ...row,
    })
    .mockResolvedValueOnce({ complaint_id: 1 }); // the trailing getComplaint
}

// What was written to the complaint row.
const written = () => prisma.complaint.update.mock.calls[0][0].data;

beforeEach(() => {
  jest.clearAllMocks();
  prisma.systemSetting.findUnique.mockResolvedValue({ setting_value: '3365' });
  prisma.complaint.update.mockResolvedValue({});
  prisma.complaintStatusHistory.create.mockResolvedValue({});
  // The service passes a callback; run it against the same mock client.
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
});

describe('the clock starts on approval', () => {
  test('Pending -> Approved stamps both the anchor and the deadline', async () => {
    givenComplaint({ status: 'Pending' });

    await updateComplaintStatus(9, 1, { status: 'Approved' });

    const data = written();
    expect(data.sla_started_at).toBeInstanceOf(Date);
    expect(data.sla_deadline).toBeInstanceOf(Date);
    expect(data.exceeded_sla).toBe(false); // just approved, cannot be late yet
  });

  test('Pending -> Under_Review does NOT start the clock', async () => {
    // Under_Review is triage, not acceptance. This is the whole point of the
    // gate: looking at a complaint is not the same as committing to a deadline.
    givenComplaint({ status: 'Pending' });

    await updateComplaintStatus(9, 1, { status: 'Under_Review' });

    expect(written().sla_started_at).toBeNull();
    expect(written().sla_deadline).toBeNull();
  });

  test('Pending -> Rejected leaves no deadline and is not a breach', async () => {
    givenComplaint({ status: 'Pending' });

    await updateComplaintStatus(9, 1, { status: 'Rejected' });

    expect(written().sla_deadline).toBeNull();
    expect(written().exceeded_sla).toBe(false);
  });

  test('the resident is told the due date on approval, and only then', async () => {
    givenComplaint({ status: 'Pending' });
    await updateComplaintStatus(9, 1, { status: 'Approved' });
    expect(notifyReportStatus.mock.calls[0][0].dueDate).toBeInstanceOf(Date);

    jest.clearAllMocks();
    prisma.systemSetting.findUnique.mockResolvedValue({ setting_value: '3365' });
    prisma.complaint.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    givenComplaint({ status: 'Pending' });
    await updateComplaintStatus(9, 1, { status: 'Under_Review' });
    expect(notifyReportStatus.mock.calls[0][0].dueDate).toBeNull();
  });
});

describe('the clock never restarts', () => {
  const alreadyRunning = {
    status: 'Approved',
    sla_started_at: APPROVED_AT,
    sla_deadline: ph('2026-09-09T17:05'),
  };

  test('Approved -> In_Progress leaves the anchor and deadline untouched', async () => {
    givenComplaint(alreadyRunning);

    await updateComplaintStatus(9, 1, { status: 'In_Progress' });

    expect(written().sla_started_at).toEqual(APPROVED_AT);
    expect(written().sla_deadline).toEqual(ph('2026-09-09T17:05'));
  });

  // The adversarial one. Without `existing.sla_started_at ||` in the service,
  // this round trip silently re-anchors the clock to today and a breach vanishes.
  test('Approved -> Pending -> Approved keeps the ORIGINAL anchor', async () => {
    givenComplaint(alreadyRunning);
    await updateComplaintStatus(9, 1, { status: 'Pending' });
    expect(written().sla_started_at).toEqual(APPROVED_AT);

    jest.clearAllMocks();
    prisma.systemSetting.findUnique.mockResolvedValue({ setting_value: '3365' });
    prisma.complaint.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation((fn) => fn(prisma));

    // Re-approving a complaint that already carries an anchor must not move it.
    givenComplaint({ ...alreadyRunning, status: 'Pending' });
    await updateComplaintStatus(9, 1, { status: 'Approved' });

    expect(written().sla_started_at).toEqual(APPROVED_AT);
    expect(written().sla_deadline).toEqual(ph('2026-09-09T17:05'));
  });

  test('a deadline already passed is reported as breached on completion', async () => {
    givenComplaint({
      status: 'In_Progress',
      sla_started_at: ph('2026-01-05T09:00'),
      sla_deadline: ph('2026-01-07T17:05'), // long past
    });

    await updateComplaintStatus(9, 1, { status: 'Resolved' });

    expect(written().exceeded_sla).toBe(true);
  });
});
