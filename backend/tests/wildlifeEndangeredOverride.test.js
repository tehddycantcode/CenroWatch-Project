// Staff correcting a wildlife report's endangered flag.
//
// WHY THIS EXISTS. An animal nobody could identify is filed against the "Other"
// species, which is marked endangered so its location is obfuscated on the
// public map - the fail-safe. Most of those turn out to be common animals, so
// without a downgrade the public map would slowly fill with fuzzed points for
// pigeons.
//
// It gets its OWN audit action rather than riding along in WILDLIFE_UPDATE,
// because this flag is a privacy control: "who un-hid this rescue site, and
// when" has to be answerable from the log without reading a diff of note fields.

jest.mock('../src/utils/prisma', () => ({
  wildlifeTurnover: { findFirst: jest.fn(), update: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));

const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const svc = require('../src/services/staff.wildlife.service');

const ROW = {
  turnover_id: 4, reference_id: 'WLD-2026-00004', is_endangered: true,
  archived_at: null, status: 'Priority_Review',
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.wildlifeTurnover.findFirst.mockResolvedValue(ROW);
  prisma.wildlifeTurnover.update.mockImplementation(({ data }) => Promise.resolve({ ...ROW, ...data }));
});

test('a staff member can clear the flag', async () => {
  const out = await svc.updateTurnover(9, 'WLD-2026-00004', { is_endangered: false }, {});
  expect(out.is_endangered).toBe(false);
});

test('WRITES ITS OWN AUDIT ACTION, naming the direction of the change', async () => {
  await svc.updateTurnover(9, 'WLD-2026-00004', { is_endangered: false }, { ipAddress: '1.2.3.4' });
  expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action: 'WILDLIFE_ENDANGERED_OVERRIDE',
    performedBy: 9,
    data: expect.objectContaining({ from: true, to: false }),
  }));
});

test('does NOT write the override action when the flag was not touched', async () => {
  await svc.updateTurnover(9, 'WLD-2026-00004', { staff_notes: 'Called the reporter.' }, {});
  const actions = writeAuditLog.mock.calls.map((c) => c[0].action);
  expect(actions).not.toContain('WILDLIFE_ENDANGERED_OVERRIDE');
});

test('does NOT write it when the value is unchanged', async () => {
  await svc.updateTurnover(9, 'WLD-2026-00004', { is_endangered: true }, {});
  const actions = writeAuditLog.mock.calls.map((c) => c[0].action);
  expect(actions).not.toContain('WILDLIFE_ENDANGERED_OVERRIDE');
});

test('keeps is_priority_review in step with the flag', async () => {
  // They are set together at intake, so letting them drift apart would leave a
  // report in the priority queue with nothing explaining why.
  await svc.updateTurnover(9, 'WLD-2026-00004', { is_endangered: false }, {});
  expect(prisma.wildlifeTurnover.update.mock.calls[0][0].data.is_priority_review).toBe(false);
});
