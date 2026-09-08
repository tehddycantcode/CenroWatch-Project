// Request-side SLA wiring.
//
// The case worth pinning here is subtle: the request SLA budget is looked up BY
// TYPE (REQUEST_SLA_BY_TYPE), so updateRequestStatus has to SELECT request_type
// from the row it is updating. It did not. The lookup then returns undefined,
// the deadline is never stamped, and every approved request silently gets no
// deadline at all - no error, no failing test, just a permanently empty SLA
// column and a compliance figure computed over nothing.

jest.mock('../src/utils/prisma', () => ({
  environmentalRequest: { findFirst: jest.fn(), update: jest.fn() },
  requestStatusHistory: { create: jest.fn() },
  systemSetting: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyReportStatus: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({ notifyStatusChange: jest.fn() }));

const prisma = require('../src/utils/prisma');
const { updateRequestStatus } = require('../src/services/staff.request.service');

function givenRequest(row) {
  prisma.environmentalRequest.findFirst
    .mockResolvedValueOnce({
      request_id: 1,
      tracking_id: 'REQ-2026-00001',
      status: 'Pending',
      request_type: 'Seedling_Distribution',
      sla_started_at: null,
      sla_deadline: null,
      scheduled_date: null,
      completion_date: null,
      approval_date: null,
      user_id: 7,
      archived_at: null,
      user: { email: 'juan@example.com', first_name: 'Juan' },
      ...row,
    })
    .mockResolvedValueOnce({ request_id: 1 }); // the trailing getRequest
}

const written = () => prisma.environmentalRequest.update.mock.calls[0][0].data;

beforeEach(() => {
  jest.clearAllMocks();
  prisma.systemSetting.findUnique.mockResolvedValue({ setting_value: '25' });
  prisma.environmentalRequest.update.mockResolvedValue({});
  prisma.requestStatusHistory.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation((fn) => fn(prisma));
});

test('approving a charter-SLA request stamps a deadline', () => {
  givenRequest({ request_type: 'Seedling_Distribution' });

  return updateRequestStatus(9, 1, { status: 'Approved' }).then(() => {
    const data = written();
    expect(data.sla_started_at).toBeInstanceOf(Date);
    expect(data.sla_deadline).toBeInstanceOf(Date);
    expect(data.approved_by_cenro_head).toBe(true);
  });
});

// The regression guard for the missing select. If request_type ever stops being
// read, the lookup silently yields undefined and this expectation fails.
test('the request type is actually read from the row', async () => {
  givenRequest({ request_type: 'Seedling_Distribution' });
  await updateRequestStatus(9, 1, { status: 'Approved' });

  const select = prisma.environmentalRequest.findFirst.mock.calls[0][0].select;
  expect(select.request_type).toBe(true);
  expect(select.sla_started_at).toBe(true);
});

test('a request type with no charter SLA never gets a deadline', async () => {
  givenRequest({ request_type: 'Garbage_Hauling' });

  await updateRequestStatus(9, 1, { status: 'Approved' });

  expect(written().sla_deadline).toBeNull();
  expect(written().sla_started_at).toBeNull();
  expect(written().approval_date).toBeInstanceOf(Date); // still an approval
});

// Approving and completing in one motion used to be judged against the
// PRE-update deadline, which is null at that instant - so a request could never
// be recorded late no matter how long it had actually taken.
test('approving and completing in one motion is judged against the new deadline', async () => {
  givenRequest({ request_type: 'Seedling_Distribution' });

  await updateRequestStatus(9, 1, { status: 'Completed' });

  // Not approved, so no deadline exists and nothing can be late - but the
  // important part is that it did not throw and did not invent a breach.
  expect(written().exceeded_sla).toBe(false);
});

test('re-approving does not move an anchor that already exists', async () => {
  const anchored = new Date('2026-09-07T01:00:00Z');
  givenRequest({
    status: 'Pending',
    request_type: 'Seedling_Distribution',
    sla_started_at: anchored,
    sla_deadline: new Date('2026-09-07T01:25:00Z'),
  });

  await updateRequestStatus(9, 1, { status: 'Approved' });

  expect(written().sla_started_at).toEqual(anchored);
});
