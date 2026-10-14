// Resident feedback on a closed case.
//
// WHY THIS SUITE EXISTS. Three rules carry the feature, and each fails quietly
// if it breaks:
//
//   1. THE OWNER ONLY. The case is looked up WITH the owner in the WHERE clause,
//      not fetched and checked afterwards, so there is no window where somebody
//      else's report is read first. A test pins the shape of that query, because
//      a refactor that "simplifies" it into findUnique + an if would pass every
//      behavioural test while introducing exactly that window.
//   2. ONLY WHEN CLOSED. Rating speed halfway through measures nothing.
//   3. ONCE PER CASE - including when two taps race, which no amount of
//      checking-first prevents. That one is the database's job, and the service
//      has to translate its error rather than let a 500 out.
//
// And one privacy rule: the resident's free-text comment must NOT be copied
// into the audit log, which every Admin can page through.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-feedback';

const mockPrisma = {
  complaint: { findFirst: jest.fn() },
  wildlifeTurnover: { findFirst: jest.fn() },
  environmentalRequest: { findFirst: jest.fn() },
  feedback: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
};

jest.mock('../src/utils/prisma', () => mockPrisma);
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn(async () => ({})) }));

const { writeAuditLog } = require('../src/utils/audit');
const svc = require('../src/services/feedback.service');

const GOOD = { rating_overall: 5, rating_speed: 4, rating_staff: 5, comment: 'Mabilis po, salamat.' };

function stubComplaint(over = {}) {
  mockPrisma.complaint.findFirst.mockResolvedValue({
    complaint_id: 7, tracking_id: 'CMP-2026-00042', status: 'Resolved', feedback: null, ...over,
  });
  mockPrisma.feedback.create.mockResolvedValue({ feedback_id: 1 });
}

beforeEach(() => jest.clearAllMocks());

describe('the owner rule', () => {
  test('the case is looked up WITH the owner, not checked afterwards', async () => {
    stubComplaint();
    await svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD);
    const [[arg]] = mockPrisma.complaint.findFirst.mock.calls;
    expect(arg.where).toEqual({ tracking_id: 'CMP-2026-00042', user_id: 9 });
  });

  test('a turnover is scoped by reported_by, which is named differently', async () => {
    mockPrisma.wildlifeTurnover.findFirst.mockResolvedValue({
      turnover_id: 3, reference_id: 'WLD-1', status: 'Transferred', feedback: null,
    });
    mockPrisma.feedback.create.mockResolvedValue({ feedback_id: 2 });
    await svc.submitFeedback('wildlife', 9, 'WLD-1', GOOD);
    const [[arg]] = mockPrisma.wildlifeTurnover.findFirst.mock.calls;
    expect(arg.where).toEqual({ reference_id: 'WLD-1', reported_by: 9 });
  });

  test("somebody else's reference is 404, not 403 - existence is itself a disclosure", async () => {
    mockPrisma.complaint.findFirst.mockResolvedValue(null);
    await expect(svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mockPrisma.feedback.create).not.toHaveBeenCalled();
  });
});

describe('the closed rule', () => {
  test.each(['Pending', 'Under_Review', 'Approved', 'In_Progress', 'Rejected'])(
    'an open complaint (%s) is refused with 409',
    async (status) => {
      stubComplaint({ status });
      await expect(svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD))
        .rejects.toMatchObject({ statusCode: 409 });
      expect(mockPrisma.feedback.create).not.toHaveBeenCalled();
    },
  );

  test('the refusal names the state the case is actually in', async () => {
    stubComplaint({ status: 'In_Progress' });
    await expect(svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD))
      .rejects.toThrow(/currently In Progress/);
  });

  test('Resolved, Released, Transferred and Completed are the states that allow it', () => {
    expect([...svc.KINDS.complaint.terminal]).toEqual(['Resolved']);
    expect([...svc.KINDS.wildlife.terminal].sort()).toEqual(['Released', 'Transferred']);
    expect([...svc.KINDS.request.terminal]).toEqual(['Completed']);
  });

  test('every terminal state is a real value of its enum', () => {
    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
    const values = (name) => schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`))[1]
      .split('\n').map((s) => s.trim()).filter(Boolean);
    for (const s of svc.KINDS.complaint.terminal) expect(values('ComplaintStatus')).toContain(s);
    for (const s of svc.KINDS.wildlife.terminal) expect(values('WildlifeStatus')).toContain(s);
    for (const s of svc.KINDS.request.terminal) expect(values('RequestStatus')).toContain(s);
  });
});

describe('once per case', () => {
  test('a second submission is refused before it reaches the database', async () => {
    stubComplaint({ feedback: { feedback_id: 1 } });
    await expect(svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(mockPrisma.feedback.create).not.toHaveBeenCalled();
  });

  test('and a RACE is caught by the unique index, not left as a 500', async () => {
    // Two taps, or two tabs. Checking first cannot prevent this; translating
    // the constraint error is what stops a person seeing a server error for
    // something they did correctly.
    stubComplaint();
    const dup = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    mockPrisma.feedback.create.mockRejectedValue(dup);
    await expect(svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('an unrelated database error is NOT swallowed', async () => {
    stubComplaint();
    mockPrisma.feedback.create.mockRejectedValue(new Error('connection lost'));
    await expect(svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD))
      .rejects.toThrow(/connection lost/);
  });
});

describe('the scores', () => {
  test('all three are written, against the right foreign key', async () => {
    stubComplaint();
    await svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD);
    expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
      data: {
        user_id: 9,
        complaint_id: 7,
        rating_overall: 5,
        rating_speed: 4,
        rating_staff: 5,
        comment: 'Mabilis po, salamat.',
      },
    });
  });

  test.each([0, 6, -1, 2.5, 'five', null, undefined, NaN])('%p is refused with 422', async (bad) => {
    stubComplaint();
    await expect(svc.submitFeedback('complaint', 9, 'CMP-2026-00042', { ...GOOD, rating_speed: bad }))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('a missing comment is stored as null, not an empty string', async () => {
    stubComplaint();
    await svc.submitFeedback('complaint', 9, 'CMP-2026-00042', { ...GOOD, comment: '   ' });
    expect(mockPrisma.feedback.create.mock.calls[0][0].data.comment).toBeNull();
  });

  test('an over-long comment is refused rather than silently truncated', async () => {
    stubComplaint();
    await expect(svc.submitFeedback('complaint', 9, 'CMP-2026-00042', { ...GOOD, comment: 'x'.repeat(svc.COMMENT_MAX + 1) }))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('the audit row', () => {
  test('records the scores and WHO, against the right table', async () => {
    stubComplaint();
    await svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD, { ipAddress: '1.2.3.4' });
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      performedBy: 9,
      action: 'FEEDBACK_SUBMITTED',
      targetTable: 'Complaint',
      targetId: 7,
      ipAddress: '1.2.3.4',
    }));
  });

  test('does NOT copy the resident\'s comment into the audit log', async () => {
    // Every Admin can page through the audit log. The comment is free text a
    // resident wrote about the service, and the Feedback row is where it lives.
    stubComplaint();
    await svc.submitFeedback('complaint', 9, 'CMP-2026-00042', GOOD);
    const [[entry]] = writeAuditLog.mock.calls;
    expect(JSON.stringify(entry.data)).not.toContain('Mabilis');
    expect(entry.data.has_comment).toBe(true);
  });
});

describe('can this person rate it yet', () => {
  test('a closed case with no feedback says yes', async () => {
    stubComplaint();
    expect(await svc.getOwnFeedback('complaint', 9, 'CMP-2026-00042'))
      .toMatchObject({ can_submit: true, submitted: false });
  });

  test('an open case says no', async () => {
    stubComplaint({ status: 'In_Progress' });
    expect(await svc.getOwnFeedback('complaint', 9, 'CMP-2026-00042'))
      .toMatchObject({ can_submit: false, submitted: false });
  });

  test('an already-rated case says no, and returns what they said', async () => {
    stubComplaint({ feedback: { feedback_id: 4 } });
    mockPrisma.feedback.findUnique.mockResolvedValue({ feedback_id: 4, rating_overall: 5 });
    const out = await svc.getOwnFeedback('complaint', 9, 'CMP-2026-00042');
    expect(out).toMatchObject({ can_submit: false, submitted: true });
    expect(out.feedback.rating_overall).toBe(5);
  });
});

describe('the admin view', () => {
  beforeEach(() => {
    mockPrisma.feedback.count.mockResolvedValue(42);
    mockPrisma.feedback.aggregate.mockResolvedValue({
      _avg: { rating_overall: 4.333333, rating_speed: 3.5, rating_staff: 4.0 },
    });
    mockPrisma.feedback.groupBy.mockResolvedValue([{ rating_overall: 5, _count: { rating_overall: 20 } }]);
    mockPrisma.feedback.findMany.mockResolvedValue([
      {
        feedback_id: 1, complaint_id: 7, turnover_id: null, request_id: null,
        rating_overall: 5, comment: 'Thanks',
        complaint: { tracking_id: 'CMP-2026-00042', complaint_type: 'Open_Burning' },
        turnover: null, request: null, user: { first_name: 'Juan', last_name: 'Dela Cruz' },
      },
    ]);
  });

  test('averages come from the WHOLE table, not the page being shown', async () => {
    const out = await svc.listFeedback({ page: 2, limit: 10 });
    // aggregate() is called with no where and no skip/take - a mean of ten rows
    // labelled as the service average would be wrong on page two.
    const [[arg]] = mockPrisma.feedback.aggregate.mock.calls;
    expect(arg.where).toBeUndefined();
    expect(arg.skip).toBeUndefined();
    expect(out.total).toBe(42);
  });

  test('averages are rounded once, here, so every client quotes the same number', async () => {
    const out = await svc.listFeedback({});
    expect(out.averages).toEqual({ rating_overall: 4.3, rating_speed: 3.5, rating_staff: 4 });
  });

  test('an empty table reports null averages rather than NaN or 0', async () => {
    mockPrisma.feedback.aggregate.mockResolvedValue({
      _avg: { rating_overall: null, rating_speed: null, rating_staff: null },
    });
    const out = await svc.listFeedback({});
    expect(out.averages).toEqual({ rating_overall: null, rating_speed: null, rating_staff: null });
  });

  test('each row is labelled with its kind, reference and subject', async () => {
    const out = await svc.listFeedback({});
    expect(out.items[0]).toMatchObject({
      kind: 'complaint', reference: 'CMP-2026-00042', subject: 'Open_Burning',
    });
  });

  test('the page size is clamped, so ?limit=100000 cannot pull the table', async () => {
    await svc.listFeedback({ limit: 100000 });
    expect(mockPrisma.feedback.findMany.mock.calls[0][0].take).toBe(100);
  });

  test('a nonsense page falls back to the first one rather than a negative skip', async () => {
    await svc.listFeedback({ page: -5 });
    expect(mockPrisma.feedback.findMany.mock.calls[0][0].skip).toBe(0);
  });
});

test('an unknown kind throws rather than guessing a table', () => {
  expect(() => svc.KINDS.nonsense).not.toThrow();
  return expect(svc.submitFeedback('nonsense', 9, 'X', GOOD)).rejects.toThrow(/Unknown report kind/);
});
