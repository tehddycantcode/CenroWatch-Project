// Complaint creation, and specifically ANONYMITY.
//
// WHY THIS SUITE EXISTS. Complaint creation had no unit coverage at all - the
// nearest thing was slaWiring.test.js, which is about the approval clock rather
// than about filing. That gap mattered much less while anonymity was reachable
// only through POST /complaints/anonymous, where the caller is unauthenticated
// and there is no identity to leak in the first place.
//
// It matters now, because a SIGNED-IN resident can tick "file anonymously". The
// server therefore knows exactly who they are at the moment it is asked to
// forget them, and every assertion below is about that one hinge:
//
//   1. user_id is NULL even though a real user id was passed in. If this
//      regresses, the report is filed under the resident's name while the UI
//      tells them it was not. Nothing would error and nothing would look wrong
//      in any queue - the row would simply be attributed.
//   2. The audit row carries no performed_by AND no ip_address. The IP is the
//      subtle one: an anonymous complaint's IP matches the USER_LOGIN row from
//      the same resident's session minutes earlier, in the same table an Admin
//      can already page through at /admin/audit-logs. One join would undo the
//      whole feature, so "we stored no IP" is a tested property, not a comment.
//   3. No submission receipt is emailed. The receipt is addressed by looking up
//      the user id, so sending one is both a leak of the link and a message to
//      someone who was promised silence.
//
// Prisma, audit, mail and the tracking-id helper are mocked: the branch is the
// risk here, and mocking keeps the suite runnable without a database.

jest.mock('../src/utils/prisma', () => ({
  barangay: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/createSequential', () => ({ createSequential: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyReportSubmitted: jest.fn() }));

const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const { createSequential } = require('../src/utils/createSequential');
const { notifyReportSubmitted } = require('../src/utils/notify');
const { createComplaint } = require('../src/services/complaint.service');

const REPORTER_ID = 7;
const CTX = { ipAddress: '203.0.113.45' };

const INPUT = {
  barangay_id: 3,
  complaint_type: 'Illegal Dumping',
  description: 'Someone is dumping construction debris into the creek at night.',
};

// What createSequential hands back. The service reads several of these while
// building the audit row and the receipt email.
const CREATED_ROW = {
  complaint_id: 101,
  tracking_id: 'CMP-2026-00101',
  complaint_type: 'Illegal Dumping',
  submitted_at: new Date('2026-09-28T10:00:00Z'),
  sla_deadline: null,
  barangay: { name: 'Marinig' },
};

// The row the service tried to write, pulled out of the createSequential call.
const writtenData = () => createSequential.mock.calls[0][0].data;

beforeEach(() => {
  jest.clearAllMocks();
  prisma.barangay.findUnique.mockResolvedValue({ barangay_id: 3, name: 'Marinig' });
  prisma.user.findUnique.mockResolvedValue({ email: 'juan@example.com', first_name: 'Juan' });
  createSequential.mockResolvedValue(CREATED_ROW);
});

describe('createComplaint - a signed-in resident filing NORMALLY', () => {
  test('attributes the report to them and keeps the audit trail intact', async () => {
    await createComplaint(REPORTER_ID, INPUT, 'complaints/x.jpg', CTX);

    expect(writtenData()).toMatchObject({ user_id: REPORTER_ID, is_anonymous: false });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPLAINT_CREATE',
        performedBy: REPORTER_ID,
        ipAddress: CTX.ipAddress,
        data: expect.objectContaining({ anonymous: false }),
      })
    );
  });

  test('emails them a submission receipt', async () => {
    await createComplaint(REPORTER_ID, INPUT, 'complaints/x.jpg', CTX);

    expect(notifyReportSubmitted).toHaveBeenCalledTimes(1);
    expect(notifyReportSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'juan@example.com', trackingId: 'CMP-2026-00101' })
    );
  });
});

describe('createComplaint - a signed-in resident filing ANONYMOUSLY', () => {
  test('stores NO user_id, even though one was passed in', async () => {
    // The assertion the whole feature rests on. The caller is authenticated and
    // REPORTER_ID is a real id; options.anonymous is what must win.
    await createComplaint(REPORTER_ID, INPUT, 'complaints/x.jpg', CTX, { anonymous: true });

    expect(writtenData().user_id).toBeNull();
    expect(writtenData().is_anonymous).toBe(true);
  });

  test('stores no reporter identity columns either', async () => {
    await createComplaint(REPORTER_ID, INPUT, 'complaints/x.jpg', CTX, { anonymous: true });

    // The resident path never sets these (they exist for staff-logged walk-ins),
    // so they must be absent or null rather than quietly populated from req.user.
    expect(writtenData().reporter_name ?? null).toBeNull();
    expect(writtenData().reporter_contact ?? null).toBeNull();
  });

  test('writes a distinct audit action with no performer', async () => {
    await createComplaint(REPORTER_ID, INPUT, 'complaints/x.jpg', CTX, { anonymous: true });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPLAINT_CREATE_ANONYMOUS',
        performedBy: null,
        data: expect.objectContaining({ anonymous: true }),
      })
    );
  });

  test('stores NO ip_address on the audit row', async () => {
    // DO NOT "restore" the IP here. See point 2 in the header: this resident's
    // USER_LOGIN audit row carries the same IP and is visible to an Admin in
    // the same log viewer, so persisting it turns anonymity into a one-join
    // lookup. Per-IP rate limiting is in-memory and does not read this column.
    await createComplaint(REPORTER_ID, INPUT, 'complaints/x.jpg', CTX, { anonymous: true });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPLAINT_CREATE_ANONYMOUS', ipAddress: null })
    );
  });

  test('sends NO submission receipt and never looks the reporter up', async () => {
    await createComplaint(REPORTER_ID, INPUT, 'complaints/x.jpg', CTX, { anonymous: true });

    expect(notifyReportSubmitted).not.toHaveBeenCalled();
    // Not merely "no mail sent": the address is never even read, so there is no
    // window in which the identity is in scope for something else to log.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('createComplaint - the public whistleblower route', () => {
  test('is anonymous from a null userId alone, with no options', async () => {
    // POST /complaints/anonymous passes userId = null. Both halves of the
    // isAnonymous test must keep working independently.
    await createComplaint(null, INPUT, null, CTX);

    expect(writtenData().user_id).toBeNull();
    expect(writtenData().is_anonymous).toBe(true);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPLAINT_CREATE_ANONYMOUS',
        performedBy: null,
        ipAddress: null,
      })
    );
    expect(notifyReportSubmitted).not.toHaveBeenCalled();
  });
});

describe('createComplaint - behaviour that does not depend on anonymity', () => {
  test('rejects a barangay that does not exist', async () => {
    prisma.barangay.findUnique.mockResolvedValue(null);

    // 422, not 400 - this API answers validation failures with 422 throughout.
    // The property is `statusCode`, which is what errorHandler reads; `status`
    // is undefined on HttpError and an assertion on it passes vacuously.
    await expect(createComplaint(REPORTER_ID, INPUT, 'x.jpg', CTX)).rejects.toMatchObject({ statusCode: 422 });
    expect(createSequential).not.toHaveBeenCalled();
  });

  test('never stamps an SLA deadline at filing time', async () => {
    // The clock starts when staff approve (see staff.complaint.service). A
    // deadline set here would show the resident a promise and then move it.
    await createComplaint(REPORTER_ID, INPUT, 'x.jpg', CTX);

    expect(writtenData().sla_started_at).toBeNull();
    expect(writtenData().sla_deadline).toBeNull();
  });
});
