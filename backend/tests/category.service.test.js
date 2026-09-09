// Admin-managed report categories.
//
// The guards here are the ones that turn "an Admin can edit a list" into
// something safe to hand over: a category name that would render badly, a
// duplicate, and - the important one - retiring the last active category, which
// would leave residents staring at an empty dropdown with no way to file
// anything at all.

jest.mock('../src/utils/prisma', () => ({
  complaintType: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  requestType: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));

const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const svc = require('../src/services/category.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.complaintType.findUnique.mockResolvedValue(null);
  prisma.requestType.findUnique.mockResolvedValue(null);
  prisma.complaintType.create.mockImplementation(({ data }) => Promise.resolve({ complaint_type_id: 1, ...data }));
  prisma.complaintType.update.mockImplementation(({ data }) => Promise.resolve({ complaint_type_id: 1, ...data }));
  prisma.complaintType.count.mockResolvedValue(5);
});

describe('isSelectable', () => {
  test('an active category may be chosen', async () => {
    prisma.complaintType.findUnique.mockResolvedValue({ is_active: true });
    expect(await svc.isSelectable('complaint', 'Illegal_Dumping')).toBe(true);
  });

  // A retired category stays valid on the reports that already reference it -
  // the FK still holds - but must not be offered for a NEW one.
  test('a retired category may not be chosen', async () => {
    prisma.complaintType.findUnique.mockResolvedValue({ is_active: false });
    expect(await svc.isSelectable('complaint', 'Old_Category')).toBe(false);
  });

  test('an unknown name is refused', async () => {
    expect(await svc.isSelectable('complaint', 'Never_Existed')).toBe(false);
  });

  test('an empty value is refused without querying', async () => {
    expect(await svc.isSelectable('complaint', '')).toBe(false);
    expect(prisma.complaintType.findUnique).not.toHaveBeenCalled();
  });
});

describe('slaForRequestType', () => {
  test('returns the budget for a type that has one', async () => {
    prisma.requestType.findUnique.mockResolvedValue({ sla_setting_key: 'request_seedling_sla_minutes', sla_fallback_minutes: 25 });
    expect(await svc.slaForRequestType('Seedling_Distribution')).toEqual({ key: 'request_seedling_sla_minutes', fallback: 25 });
  });

  // Hauling, cleaning and Other_Service have no Citizens Charter commitment and
  // must never be given a deadline. This is the behaviour the old hardcoded map
  // had by omission; now it is explicit on the row.
  test('returns null when the type has no charter SLA', async () => {
    prisma.requestType.findUnique.mockResolvedValue({ sla_setting_key: null, sla_fallback_minutes: null });
    expect(await svc.slaForRequestType('Garbage_Hauling')).toBeNull();
  });

  // The failure mode that motivated moving this onto the row: an Admin-created
  // type was simply absent from the old map, so the lookup returned undefined
  // and the request silently got no deadline.
  test('returns null - not undefined - for an unknown type', async () => {
    expect(await svc.slaForRequestType('Type_An_Admin_Just_Added')).toBeNull();
  });
});

describe('createType', () => {
  test('accepts a well-formed name and audits it', async () => {
    await svc.createType('complaint', 9, { name: 'Water_Pollution_2' });
    expect(prisma.complaintType.create).toHaveBeenCalled();
    expect(writeAuditLog.mock.calls[0][0].action).toBe('CATEGORY_CREATE');
  });

  // The name is written onto every report and rendered by humanize(), which only
  // replaces underscores. Anything else renders badly and cannot round-trip.
  test.each([
    ['a space', 'Illegal Dumping'],
    ['punctuation', 'Illegal-Dumping!'],
    ['a leading digit', '1_Dumping'],
    ['empty', ''],
  ])('rejects %s', async (_label, name) => {
    await expect(svc.createType('complaint', 9, { name })).rejects.toMatchObject({ statusCode: 422 });
    expect(prisma.complaintType.create).not.toHaveBeenCalled();
  });

  test('rejects a duplicate name with 409', async () => {
    prisma.complaintType.findUnique.mockResolvedValue({ complaint_type_id: 3 });
    await expect(svc.createType('complaint', 9, { name: 'Illegal_Dumping' })).rejects.toMatchObject({ statusCode: 409 });
  });

  test('rejects an unknown category kind', async () => {
    await expect(svc.createType('nonsense', 9, { name: 'Whatever' })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateType', () => {
  test('retiring a category is allowed while others remain active', async () => {
    prisma.complaintType.findUnique.mockResolvedValue({ complaint_type_id: 1, name: 'Other', is_active: true });
    prisma.complaintType.count.mockResolvedValue(5);

    await svc.updateType('complaint', 9, 1, { is_active: false });

    expect(prisma.complaintType.update.mock.calls[0][0].data.is_active).toBe(false);
  });

  // Without this an Admin can empty the report form entirely: no categories
  // means no selectable option, and every submission fails its foreign key.
  test('refuses to retire the LAST active category', async () => {
    prisma.complaintType.findUnique.mockResolvedValue({ complaint_type_id: 1, name: 'Other', is_active: true });
    prisma.complaintType.count.mockResolvedValue(1);

    await expect(svc.updateType('complaint', 9, 1, { is_active: false })).rejects.toMatchObject({ statusCode: 422 });
    expect(prisma.complaintType.update).not.toHaveBeenCalled();
  });

  // Renaming is deliberately not offered. ON UPDATE CASCADE would rewrite the
  // reports, but the old name also sits in exported PDFs and audit payloads that
  // cannot be rewritten, so a rename splits one category's history in two.
  test('ignores an attempt to change the name', async () => {
    prisma.complaintType.findUnique.mockResolvedValue({ complaint_type_id: 1, name: 'Other', is_active: true });

    await svc.updateType('complaint', 9, 1, { name: 'Renamed', label: 'Something else' });

    const data = prisma.complaintType.update.mock.calls[0][0].data;
    expect(data.name).toBeUndefined();
    expect(data.label).toBe('Something else');
  });

  test('404s an unknown id without writing an audit entry', async () => {
    await expect(svc.updateType('complaint', 9, 999, { label: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  test('refuses an update that would change nothing', async () => {
    prisma.complaintType.findUnique.mockResolvedValue({ complaint_type_id: 1, name: 'Other', is_active: true });
    await expect(svc.updateType('complaint', 9, 1, {})).rejects.toMatchObject({ statusCode: 422 });
  });
});
