// A resident report must carry a pinned location.
//
// Coordinates used to be optional on every form, which meant CENRO could receive
// a complaint with no place attached - the least actionable thing a report can
// be, since staff cannot inspect what they cannot find. The forms now require a
// pin, and this suite is what stops that requirement being cosmetic: a rule
// enforced only in the browser is enforced only for people using the browser.
//
// THE STAFF WALK-IN ROUTE IS DELIBERATELY EXCLUDED and is tested here for that
// reason. A resident standing at the counter often cannot give coordinates, and
// blocking intake on a field the staff member has no way to fill would stop the
// report being recorded at all. If someone later "makes this consistent" by
// requiring coordinates everywhere, the walk-in test below fails rather than
// counter staff discovering it.

// isSelectable hits the categories table; the rules under test do not care what
// it says, only that it resolves.
jest.mock('../src/services/category.service', () => ({
  isSelectable: jest.fn(async () => true),
}));

const { validationResult } = require('express-validator');
const {
  createComplaintRules,
  createAnonymousComplaintRules,
} = require('../src/validators/complaint.validators');
const { createWildlifeRules } = require('../src/validators/wildlife.validators');
const { createWalkInComplaintRules } = require('../src/validators/staff.validators');

async function runRules(rules, body) {
  const req = { body, params: {}, query: {}, cookies: {}, headers: {} };
  for (const rule of rules) await rule.run(req);
  return validationResult(req);
}

const fieldsWithErrors = (result) => result.array().map((e) => e.path);

// A body that is valid apart from whatever the individual test removes.
const complaintBody = (over = {}) => ({
  barangay_id: '1',
  complaint_type: 'Illegal_Dumping',
  description: 'There is a pile of household waste beside the creek.',
  latitude: '14.2726',
  longitude: '121.1256',
  ...over,
});

const wildlifeBody = (over = {}) => ({
  barangay_id: '1',
  species_name: 'Philippine Serpent Eagle',
  animal_condition: 'Injured',
  description: 'Found grounded near the roadside, unable to fly away.',
  latitude: '14.2726',
  longitude: '121.1256',
  ...over,
});

describe('a resident complaint needs a pinned location', () => {
  test('is accepted when coordinates are present', async () => {
    const result = await runRules(createComplaintRules, complaintBody());
    expect(fieldsWithErrors(result)).toEqual([]);
  });

  test('is rejected when the pin is missing entirely', async () => {
    const body = complaintBody();
    delete body.latitude;
    delete body.longitude;
    const result = await runRules(createComplaintRules, body);
    expect(fieldsWithErrors(result)).toEqual(expect.arrayContaining(['latitude', 'longitude']));
  });

  // The forms send multipart, so an unpinned map arrives as empty strings rather
  // than as absent keys. Treating those as "present" would let the requirement
  // through with nothing behind it.
  test('is rejected when the coordinates arrive empty', async () => {
    const result = await runRules(createComplaintRules, complaintBody({ latitude: '', longitude: '' }));
    expect(fieldsWithErrors(result)).toEqual(expect.arrayContaining(['latitude', 'longitude']));
  });

  test('still rejects coordinates that are out of range', async () => {
    const result = await runRules(createComplaintRules, complaintBody({ latitude: '999' }));
    expect(fieldsWithErrors(result)).toContain('latitude');
  });
});

describe('an anonymous complaint needs one too', () => {
  test('is rejected without a pin', async () => {
    const body = complaintBody({ consent: 'true' });
    delete body.latitude;
    delete body.longitude;
    const result = await runRules(createAnonymousComplaintRules, body);
    expect(fieldsWithErrors(result)).toEqual(expect.arrayContaining(['latitude', 'longitude']));
  });

  test('is accepted with a pin and consent', async () => {
    const result = await runRules(createAnonymousComplaintRules, complaintBody({ consent: 'true' }));
    expect(fieldsWithErrors(result)).toEqual([]);
  });
});

describe('a wildlife turnover needs one too', () => {
  test('is rejected without a pin', async () => {
    const body = wildlifeBody();
    delete body.latitude;
    delete body.longitude;
    const result = await runRules(createWildlifeRules, body);
    expect(fieldsWithErrors(result)).toEqual(expect.arrayContaining(['latitude', 'longitude']));
  });

  test('is accepted with a pin', async () => {
    const result = await runRules(createWildlifeRules, wildlifeBody());
    expect(fieldsWithErrors(result)).toEqual([]);
  });
});

describe('the staff walk-in form is deliberately exempt', () => {
  // Counter intake must not be blocked on a field the resident cannot supply.
  test('accepts a walk-in complaint with no coordinates at all', async () => {
    const body = complaintBody({ reporter_name: 'Juan Dela Cruz' });
    delete body.latitude;
    delete body.longitude;
    const result = await runRules(createWalkInComplaintRules, body);
    expect(fieldsWithErrors(result)).not.toContain('latitude');
    expect(fieldsWithErrors(result)).not.toContain('longitude');
  });
});
