// A service request can say where it is.
//
// EnvironmentalRequest was the one report model with no location at all - no
// coordinates, no address - which is why web/src/components/staff/detail.jsx
// carried the line "requests never have coordinates" and the staff map excluded
// them. A resident asking for seedlings or a creek cleaned is asking for it
// SOMEWHERE, and barangay-level was as precise as the record could get.

jest.mock('../src/utils/prisma', () => ({
  barangay: { findUnique: jest.fn() },
  // createRequest looks the reporter up to email a receipt; null skips the email.
  user: { findUnique: jest.fn().mockResolvedValue(null) },
  environmentalRequest: { create: jest.fn() },
}));
// requestTypeRule hits the categories table; the rules only need it to resolve.
jest.mock('../src/services/category.service', () => ({ isSelectable: jest.fn(async () => true) }));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyReportSubmitted: jest.fn() }));
jest.mock('../src/utils/createSequential', () => ({
  createSequential: jest.fn(async ({ data }) => ({ request_id: 1, tracking_id: 'REQ-2026-00001', ...data })),
}));

const prisma = require('../src/utils/prisma');
const { createSequential } = require('../src/utils/createSequential');
const svc = require('../src/services/request.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.barangay.findUnique.mockResolvedValue({ barangay_id: 1, name: 'Pulo' });
});

const input = (over = {}) => ({
  barangay_id: 1,
  request_type: 'Seedling_Request',
  description: 'Requesting seedlings for the barangay tree-planting drive.',
  ...over,
});

test('persists coordinates and the address together', async () => {
  await svc.createRequest(7, input({
    latitude: 14.2726, longitude: 121.1256, address_details: 'Beside the covered court.',
  }), null, {});
  expect(createSequential.mock.calls[0][0].data).toEqual(expect.objectContaining({
    latitude: 14.2726, longitude: 121.1256, address_details: 'Beside the covered court.',
  }));
});

test('stores NULL, not undefined, when a request has no location fields', async () => {
  // Prisma rejects `undefined` differently from `null`, and the two existing
  // report models both normalise to null. Matching them keeps the three
  // services readable side by side.
  await svc.createRequest(7, input(), null, {});
  expect(createSequential.mock.calls[0][0].data).toEqual(expect.objectContaining({
    latitude: null, longitude: null, address_details: null,
  }));
});

test('an address with no coordinates is stored as given', async () => {
  // The case the whole change exists for: a resident who will not use the map.
  await svc.createRequest(7, input({ address_details: 'Purok 3, near the chapel.' }), null, {});
  const data = createSequential.mock.calls[0][0].data;
  expect(data.address_details).toBe('Purok 3, near the chapel.');
  expect(data.latitude).toBeNull();
  expect(data.longitude).toBeNull();
});

test('DETAIL_SELECT returns the location fields, or the resident cannot see what they filed', async () => {
  // The tracker renders from this select. A field persisted but not selected is
  // invisible to the person who typed it, which reads as data loss.
  expect(svc.DETAIL_SELECT).toEqual(expect.objectContaining({
    latitude: true, longitude: true, address_details: true,
  }));
});

test('latitude 0 is stored, not turned into null - this is what ?? protects', async () => {
  // `||` would discard it, because 0 is falsy. 0,0 is not in Cabuyao, but the
  // bug is the falsiness, not the geography.
  await svc.createRequest(7, input({ latitude: 0, longitude: 0 }), null, {});
  const data = createSequential.mock.calls[0][0].data;
  expect(data.latitude).toBe(0);
  expect(data.longitude).toBe(0);
});

test('the STAFF detail select returns them too, or staff cannot see a location the resident gave', async () => {
  const staffSvc = require('../src/services/staff.request.service');
  expect(staffSvc.DETAIL_SELECT).toEqual(expect.objectContaining({
    latitude: true, longitude: true, address_details: true,
  }));
});

describe('the request route actually wires the shared rule in', () => {
  // The tests above exercise the SERVICE. None of them would notice
  // `...locationRules` being deleted from createRequestRules - the suite would
  // stay green while a request with no location at all returned 201. Task 1's
  // suite proves the rules work; this proves this route uses them.
  const { validationResult } = require('express-validator');
  const { createRequestRules } = require('../src/validators/request.validators');

  async function runRules(body) {
    const req = { body, params: {}, query: {}, cookies: {}, headers: {} };
    for (const rule of createRequestRules) await rule.run(req);
    return validationResult(req).array().map((e) => e.path);
  }

  const base = {
    barangay_id: '1',
    request_type: 'Seedling_Request',
    description: 'Requesting seedlings for the barangay tree-planting drive.',
  };

  test('refuses a request with neither a pin nor an address', async () => {
    expect(await runRules({ ...base })).toContain('location');
  });

  test('accepts one with an address and no pin', async () => {
    expect(await runRules({ ...base, address_details: 'Purok 3, near the chapel.' })).toEqual([]);
  });

  test('accepts one with a pin and no address', async () => {
    expect(await runRules({ ...base, latitude: '14.2726', longitude: '121.1256' })).toEqual([]);
  });
});
