// The CENRO office coordinates that the staff report detail page draws its
// "distance to this report" line from.
//
// These live in SystemSetting so an Admin can correct them without a deploy,
// which means a typo in a text box becomes map geometry. A latitude of 141
// instead of 14.1 does not fail loudly - it silently puts the office in the
// Arctic and every distance on every report becomes nonsense, so the guard is
// at the write, not the read.

jest.mock('../src/utils/prisma', () => ({
  systemSetting: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));

const prisma = require('../src/utils/prisma');
const svc = require('../src/services/admin.settings.service');
const office = require('../src/services/officeLocation.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.systemSetting.findUnique.mockResolvedValue({ setting_id: 1, setting_value: '0' });
  prisma.systemSetting.update.mockImplementation(({ data, where }) =>
    Promise.resolve({ setting_id: 1, setting_key: where.setting_key, ...data }),
  );
});

describe('updateSetting - coordinate validation', () => {
  test('accepts a real Cabuyao coordinate', async () => {
    await expect(svc.updateSetting(1, 'cenro_office_lat', '14.271764542862766')).resolves.toBeTruthy();
    await expect(svc.updateSetting(1, 'cenro_office_lng', '121.12434099651512')).resolves.toBeTruthy();
  });

  test('rejects a latitude outside -90..90', async () => {
    await expect(svc.updateSetting(1, 'cenro_office_lat', '141.27')).rejects.toMatchObject({ statusCode: 422 });
  });

  test('rejects a longitude outside -180..180', async () => {
    await expect(svc.updateSetting(1, 'cenro_office_lng', '221.12')).rejects.toMatchObject({ statusCode: 422 });
  });

  test('rejects text', async () => {
    await expect(svc.updateSetting(1, 'cenro_office_lat', 'city hall')).rejects.toMatchObject({ statusCode: 422 });
  });

  // An empty string is how an Admin clears the setting and switches the feature
  // off again, so it must NOT be treated as an invalid coordinate.
  test('accepts an empty value as "unset"', async () => {
    await expect(svc.updateSetting(1, 'cenro_office_lat', '')).resolves.toBeTruthy();
  });

  // The minute rule must keep working exactly as before.
  test('still rejects a non-integer minute setting', async () => {
    await expect(svc.updateSetting(1, 'complaint_sla_minutes', '12.5')).rejects.toMatchObject({ statusCode: 422 });
  });
});

// The route-level rule, run for real rather than through HTTP - there is no
// supertest in this project, but an express-validator chain is just middleware
// and can be run against a plain object.
describe('updateSettingRules - which settings may be blanked', () => {
  const { validationResult } = require('express-validator');
  const { updateSettingRules } = require('../src/validators/admin.validators');

  async function run(key, setting_value) {
    const req = { params: { key }, body: { setting_value }, query: {}, headers: {} };
    for (const rule of updateSettingRules) await rule.run(req);
    return validationResult(req);
  }

  // Clearing a coordinate is how the distance line gets switched off. Before
  // this rule the shared notEmpty() refused it, so the documented way to turn
  // the feature off did not actually work.
  test('the office coordinates may be cleared', async () => {
    expect((await run('cenro_office_lat', '')).isEmpty()).toBe(true);
    expect((await run('cenro_office_lng', '')).isEmpty()).toBe(true);
  });

  // An empty SLA budget would silently stop producing deadlines.
  test('other settings still may not be cleared', async () => {
    const result = await run('complaint_sla_minutes', '');
    expect(result.isEmpty()).toBe(false);
    expect(result.array()[0].msg).toBe('Value cannot be empty.');
  });

  test('a missing value is still refused outright', async () => {
    const result = await run('cenro_office_lat', undefined);
    expect(result.isEmpty()).toBe(false);
  });
});

describe('getOfficeLocation', () => {
  const rows = (lat, lng) => [
    { setting_key: 'cenro_office_lat', setting_value: lat },
    { setting_key: 'cenro_office_lng', setting_value: lng },
  ];

  test('returns the point when both coordinates are set', async () => {
    prisma.systemSetting.findMany.mockResolvedValue(rows('14.271764542862766', '121.12434099651512'));
    expect(await office.getOfficeLocation()).toEqual({
      lat: 14.271764542862766,
      lng: 121.12434099651512,
    });
  });

  // Half a coordinate is not a location. Returning one would put the office on
  // the equator or the prime meridian and draw a line across the planet, so the
  // feature has to stay switched off until both halves exist.
  test('returns null when only one coordinate is set', async () => {
    prisma.systemSetting.findMany.mockResolvedValue(rows('14.271764542862766', ''));
    expect(await office.getOfficeLocation()).toBeNull();
  });

  test('returns null when the settings rows do not exist', async () => {
    prisma.systemSetting.findMany.mockResolvedValue([]);
    expect(await office.getOfficeLocation()).toBeNull();
  });

  test('returns null rather than NaN when a value is not a number', async () => {
    prisma.systemSetting.findMany.mockResolvedValue(rows('city hall', '121.12'));
    expect(await office.getOfficeLocation()).toBeNull();
  });
});
