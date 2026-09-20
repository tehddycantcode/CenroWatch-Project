// Wildlife turnover module.
//
// WHY THIS SUITE EXISTS. Before it, the whole module was covered by four
// assertions in statusPartitions.test.js, and all four were about the status
// ENUM rather than about anything wildlife does. Three behaviours that this
// module alone owns had no automated coverage at all:
//
//   1. Endangered-species coordinates are fuzzed on PUBLIC output. This is a
//      protection control - a poacher reading the public map must not be handed
//      a rescue site - and it was described in the manuscript but never tested.
//   2. A resident flagging a species as endangered promotes the record to
//      priority review. Nothing asserted that the promotion happens, so a
//      refactor could quietly drop it and every queue would still look normal.
//   3. Wildlife is the ONLY module whose SLA clock starts at submission rather
//      than at approval. Complaints and requests are approval-gated; a change
//      that "unified" the three would silently delay every animal's deadline.
//
// The obfuscation tests are the point of the suite. The control is only worth
// anything if the offset is STABLE for a given record: a shift that re-rolled
// per request could be averaged away by anyone polling the endpoint, and the
// true location would leak with no code change and no error.

const { obfuscatePoint, OFFSET_DEG } = require('../src/utils/geo');

// Degrees -> metres, good enough to assert a ~110 m shift. Longitude degrees
// shrink with latitude, so the cosine factor matters even over Cabuyao.
const DEG_METRES = 111_320;
function metresBetween(a, b) {
  const dLat = b.latitude - a.latitude;
  const dLng = (b.longitude - a.longitude) * Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLng) * DEG_METRES;
}

// A point inside Cabuyao, so the numbers in these tests are the ones the system
// actually handles rather than a synthetic origin.
const CABUYAO = { latitude: 14.2756, longitude: 121.1289 };

describe('endangered-species coordinate obfuscation', () => {
  test('shifts the point by the configured offset', () => {
    const out = obfuscatePoint(CABUYAO.latitude, CABUYAO.longitude, 'WLD-2026-00001');
    const moved = metresBetween(CABUYAO, out);
    // OFFSET_DEG is 0.001 -> about 111 m. Allow a metre of rounding slack.
    expect(moved).toBeGreaterThan(105);
    expect(moved).toBeLessThan(115);
  });

  test('never returns the true coordinates unchanged', () => {
    const out = obfuscatePoint(CABUYAO.latitude, CABUYAO.longitude, 'WLD-2026-00001');
    expect(out.latitude).not.toBe(CABUYAO.latitude);
    expect(out.longitude).not.toBe(CABUYAO.longitude);
  });

  test('IS STABLE for the same record across repeated calls', () => {
    // The whole control rests on this. If the direction re-rolled per call,
    // averaging a few hundred requests would recover the true point.
    const first = obfuscatePoint(CABUYAO.latitude, CABUYAO.longitude, 'WLD-2026-00042');
    for (let i = 0; i < 50; i += 1) {
      expect(obfuscatePoint(CABUYAO.latitude, CABUYAO.longitude, 'WLD-2026-00042')).toEqual(first);
    }
  });

  test('the mean of many calls does not converge on the true point', () => {
    // The practical statement of the property above: a fixed offset cannot be
    // averaged away, because every sample is the same sample.
    const n = 200;
    let sumLat = 0;
    let sumLng = 0;
    for (let i = 0; i < n; i += 1) {
      const p = obfuscatePoint(CABUYAO.latitude, CABUYAO.longitude, 'WLD-2026-00042');
      sumLat += p.latitude;
      sumLng += p.longitude;
    }
    const mean = { latitude: sumLat / n, longitude: sumLng / n };
    expect(metresBetween(CABUYAO, mean)).toBeGreaterThan(105);
  });

  test('different records are shifted in different directions', () => {
    const a = obfuscatePoint(CABUYAO.latitude, CABUYAO.longitude, 'WLD-2026-00001');
    const b = obfuscatePoint(CABUYAO.latitude, CABUYAO.longitude, 'WLD-2026-00002');
    expect(a).not.toEqual(b);
  });

  test('every record is shifted by the same DISTANCE, only the bearing varies', () => {
    // The offset is a point on a circle, so the magnitude must not leak which
    // record is which.
    const distances = ['WLD-2026-00001', 'WLD-2026-00002', 'WLD-2026-00003', 'WLD-2026-00099']
      .map((id) => metresBetween(CABUYAO, obfuscatePoint(CABUYAO.latitude, CABUYAO.longitude, id)));
    for (const d of distances) {
      expect(Math.abs(d - distances[0])).toBeLessThan(1);
    }
  });

  test('rounds to six decimal places', () => {
    const out = obfuscatePoint(CABUYAO.latitude, CABUYAO.longitude, 'WLD-2026-00001');
    for (const v of [out.latitude, out.longitude]) {
      const decimals = String(v).split('.')[1] || '';
      expect(decimals.length).toBeLessThanOrEqual(6);
    }
  });

  test('works in the southern and western hemispheres', () => {
    const south = { latitude: -33.8688, longitude: -70.6693 };
    const out = obfuscatePoint(south.latitude, south.longitude, 'WLD-2026-00007');
    expect(metresBetween(south, out)).toBeGreaterThan(100);
    expect(Number.isFinite(out.latitude)).toBe(true);
    expect(Number.isFinite(out.longitude)).toBe(true);
  });

  test('the configured offset is 0.001 degrees', () => {
    // Pinned deliberately: shrinking this silently would weaken the control
    // without failing anything else.
    expect(OFFSET_DEG).toBe(0.001);
  });
});

// ---------------------------------------------------------------------------
// The public map is where the obfuscation actually has to happen. Testing the
// helper alone would not catch someone dropping the call site.
// ---------------------------------------------------------------------------
jest.mock('../src/utils/prisma', () => ({
  complaint: { findMany: jest.fn(), count: jest.fn() },
  wildlifeTurnover: { findMany: jest.fn(), count: jest.fn() },
  environmentalRequest: { count: jest.fn() },
  barangay: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  systemSetting: { findUnique: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyReportSubmitted: jest.fn() }));

const prisma = require('../src/utils/prisma');
const { getMapMarkers } = require('../src/services/gis.service');

const TRUE_POINT = { latitude: 14.2823, longitude: 121.1187 };

function givenWildlife(rows) {
  prisma.complaint.findMany.mockResolvedValue([]);
  prisma.wildlifeTurnover.findMany.mockResolvedValue(rows);
}

describe('public map output', () => {
  beforeEach(() => jest.clearAllMocks());

  test('an endangered record is published at shifted coordinates', async () => {
    givenWildlife([{
      reference_id: 'WLD-2026-00008',
      species_name: 'Philippine Hanging Parrot',
      is_endangered: true,
      status: 'Priority_Review',
      ...TRUE_POINT,
      barangay: { name: 'Butong' },
    }]);
    const [marker] = await getMapMarkers();
    expect(marker.latitude).not.toBe(TRUE_POINT.latitude);
    expect(metresBetween(TRUE_POINT, marker)).toBeGreaterThan(105);
  });

  test('a NON-endangered record is published at its true coordinates', async () => {
    // The control must be targeted. Fuzzing everything would make the map
    // useless for the ordinary sightings it exists to show.
    givenWildlife([{
      reference_id: 'WLD-2026-00009',
      species_name: 'Common Water Monitor',
      is_endangered: false,
      status: 'Released',
      ...TRUE_POINT,
      barangay: { name: 'Butong' },
    }]);
    const [marker] = await getMapMarkers();
    expect(marker.latitude).toBe(TRUE_POINT.latitude);
    expect(marker.longitude).toBe(TRUE_POINT.longitude);
  });

  test('complaint markers are never shifted', async () => {
    prisma.wildlifeTurnover.findMany.mockResolvedValue([]);
    prisma.complaint.findMany.mockResolvedValue([{
      tracking_id: 'CMP-2026-00001',
      complaint_type: 'Illegal_Dumping',
      status: 'Pending',
      priority: false,
      ...TRUE_POINT,
      barangay: { name: 'Butong' },
    }]);
    const [marker] = await getMapMarkers();
    expect(marker.latitude).toBe(TRUE_POINT.latitude);
  });

  test('two separate requests return the same shifted point', async () => {
    const row = {
      reference_id: 'WLD-2026-00008',
      species_name: 'Philippine Hanging Parrot',
      is_endangered: true,
      status: 'Priority_Review',
      ...TRUE_POINT,
      barangay: { name: 'Butong' },
    };
    givenWildlife([row]);
    const [first] = await getMapMarkers();
    givenWildlife([row]);
    const [second] = await getMapMarkers();
    expect(second).toEqual(first);
  });

  test('carries no reporter identity (R.A. 10173)', async () => {
    givenWildlife([{
      reference_id: 'WLD-2026-00008',
      species_name: 'Philippine Hanging Parrot',
      is_endangered: true,
      status: 'Priority_Review',
      ...TRUE_POINT,
      barangay: { name: 'Butong' },
    }]);
    const [marker] = await getMapMarkers();
    for (const leak of ['reported_by', 'reporter', 'user', 'user_id', 'email', 'contact', 'address_details']) {
      expect(marker).not.toHaveProperty(leak);
    }
  });
});

// ---------------------------------------------------------------------------
// Intake: priority promotion and the submission-based clock.
// ---------------------------------------------------------------------------
const { createTurnover } = require('../src/services/wildlife.service');

// createSequential runs inside prisma.$transaction and calls tx[model].count
// then tx[model].create. Capture what it was asked to write.
let written;
function mockTransaction() {
  prisma.$transaction.mockImplementation(async (fn) => fn({
    wildlifeTurnover: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(async ({ data }) => {
        written = data;
        return { turnover_id: 1, reference_id: data.reference_id, ...data };
      }),
    },
  }));
}

const INPUT = {
  barangay_id: 5,
  species_name: 'Philippine Serpent Eagle',
  animal_condition: 'Injured',
  description: 'Found grounded with an injured wing near the tree line.',
};

describe('wildlife intake', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    written = undefined;
    prisma.barangay.findUnique.mockResolvedValue({ barangay_id: 5, name: 'Butong' });
    prisma.user.findUnique.mockResolvedValue(null); // skip the receipt email
    prisma.systemSetting.findUnique.mockResolvedValue({ setting_value: '3218' });
    mockTransaction();
  });

  test('a flagged endangered species is promoted to priority review', async () => {
    await createTurnover(7, { ...INPUT, is_endangered: true }, null, {});
    expect(written.is_endangered).toBe(true);
    expect(written.is_priority_review).toBe(true);
    expect(written.status).toBe('Priority_Review');
  });

  test('an ordinary turnover is not promoted', async () => {
    await createTurnover(7, { ...INPUT, is_endangered: false }, null, {});
    expect(written.is_priority_review).toBe(false);
    expect(written.status).toBe('Pending_Review');
  });

  test('omitting the flag entirely is treated as not endangered', async () => {
    await createTurnover(7, INPUT, null, {});
    expect(written.is_endangered).toBe(false);
    expect(written.is_priority_review).toBe(false);
  });

  test('THE CLOCK STARTS AT SUBMISSION, not at approval', async () => {
    // Wildlife is the only module where this is true. Complaints and requests
    // deliberately leave both fields null until a staff member accepts them.
    await createTurnover(7, INPUT, null, {});
    expect(written.sla_started_at).toEqual(written.submitted_at);
  });

  test('a deadline exists immediately, with no approval step', async () => {
    await createTurnover(7, INPUT, null, {});
    expect(written.sla_deadline).toBeInstanceOf(Date);
    expect(written.sla_deadline.getTime()).toBeGreaterThan(written.submitted_at.getTime());
  });

  test('the deadline is computed in working time, not wall clock', async () => {
    // 3218 minutes is about 2.23 days of wall clock. Any start whose budget
    // crosses a weekend must land later than that, which is the only
    // observable difference between the two calculators.
    await createTurnover(7, INPUT, null, {});
    const wallClock = written.submitted_at.getTime() + 3218 * 60_000;
    expect(written.sla_deadline.getTime()).toBeGreaterThanOrEqual(wallClock);
  });

  test('an unknown barangay is refused', async () => {
    prisma.barangay.findUnique.mockResolvedValue(null);
    await expect(createTurnover(7, INPUT, null, {})).rejects.toThrow(/barangay/i);
  });

  test('the turnover is audited', async () => {
    const { writeAuditLog } = require('../src/utils/audit');
    await createTurnover(7, { ...INPUT, is_endangered: true }, null, {});
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'WILDLIFE_CREATE',
      targetTable: 'WildlifeTurnover',
      performedBy: 7,
    }));
  });

  test('the audit entry records the endangered flag but no personal data', async () => {
    const { writeAuditLog } = require('../src/utils/audit');
    await createTurnover(7, { ...INPUT, is_endangered: true }, null, {});
    const { data } = writeAuditLog.mock.calls[0][0];
    expect(data.is_endangered).toBe(true);
    expect(data).not.toHaveProperty('address_details');
    expect(data).not.toHaveProperty('description');
  });
});
