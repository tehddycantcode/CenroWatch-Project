// A resident report must carry a location - as a map pin, OR as a street and
// landmark description, or both.
//
// Coordinates were REQUIRED between 2026-09-29 and this change, because a
// report with no place attached is the least actionable thing CENRO can
// receive: staff cannot inspect what they cannot find. That reasoning still
// holds, and this rule is how it survives while letting someone who will not
// or cannot use GPS still file. What is NOT acceptable is a report with
// neither, and that is what the suite exists to stop.
//
// THE STAFF WALK-IN ROUTE IS NO LONGER EXEMPT. It used to be, because someone
// at the counter often cannot give coordinates - but they can almost always
// type a street or a landmark, so the exemption stopped being necessary the
// moment the text alternative existed. Its test below now asserts the rule
// applies, which is the opposite of what this file asserted before.

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

describe('a resident complaint needs a location, one way or the other', () => {
  test('accepted with a pin and no address', async () => {
    const r = await runRules(createComplaintRules, complaintBody());
    expect(fieldsWithErrors(r)).toEqual([]);
  });

  test('accepted with an address and NO pin - this is the whole point of the change', async () => {
    const r = await runRules(createComplaintRules, complaintBody({
      latitude: '', longitude: '',
      address_details: 'Beside the covered court on Barangay Road, Pulo.',
    }));
    expect(fieldsWithErrors(r)).toEqual([]);
  });

  test('accepted with both', async () => {
    const r = await runRules(createComplaintRules, complaintBody({
      address_details: 'Beside the covered court.',
    }));
    expect(fieldsWithErrors(r)).toEqual([]);
  });

  test('REJECTED with neither', async () => {
    const r = await runRules(createComplaintRules, complaintBody({ latitude: '', longitude: '' }));
    expect(fieldsWithErrors(r)).toContain('location');
  });

  test('rejected when the keys are absent entirely, not just empty', async () => {
    const body = complaintBody();
    delete body.latitude;
    delete body.longitude;
    const r = await runRules(createComplaintRules, body);
    expect(fieldsWithErrors(r)).toContain('location');
  });

  test('still rejects coordinates that are out of range', async () => {
    const r = await runRules(createComplaintRules, complaintBody({ latitude: '91' }));
    expect(fieldsWithErrors(r)).toContain('latitude');
  });
});

describe('the five cases that would otherwise slip through', () => {
  test('A HALF-PIN IS NOT A LOCATION: latitude without longitude', async () => {
    // Accepting this would store a report whose pin cannot be placed on a map.
    const r = await runRules(createComplaintRules, complaintBody({ longitude: '' }));
    expect(fieldsWithErrors(r)).toContain('location');
  });

  test('a half-pin WITH an address is fine - the address carries it', async () => {
    // Opposite polarity, so the half-pin rule cannot be written as "reject any
    // incomplete pair" and break a legitimate submission.
    const r = await runRules(createComplaintRules, complaintBody({
      longitude: '', address_details: 'Corner of Gov. Drive and Pulo Road.',
    }));
    expect(fieldsWithErrors(r)).toEqual([]);
  });

  test('latitude 0 counts as PRESENT, because 0 is falsy in JavaScript', async () => {
    // A truthiness test would discard a real coordinate. 0,0 is not in Cabuyao,
    // but the bug this pins is the JS falsiness, not the geography - and the
    // same mistake would discard longitude 0 for a report filed on the meridian.
    const r = await runRules(createComplaintRules, complaintBody({ latitude: 0, longitude: 0 }));
    expect(fieldsWithErrors(r)).toEqual([]);
  });

  test('a non-numeric latitude is still refused, not silently skipped', async () => {
    // The blank-to-undefined sanitizer exists so that every value which WAS
    // sent gets range-checked. If it were written as optional({ values:
    // 'falsy' }) instead, 'abc' would still be caught - but 0 would not be
    // sent for validation at all. This pins the half that is easy to lose.
    const r = await runRules(createComplaintRules, complaintBody({ latitude: 'abc' }));
    expect(fieldsWithErrors(r)).toContain('latitude');
  });

  test('a whitespace-only address does NOT satisfy the rule', async () => {
    const r = await runRules(createComplaintRules, complaintBody({
      latitude: '', longitude: '', address_details: '     ',
    }));
    expect(fieldsWithErrors(r)).toContain('location');
  });

  test('an over-long address with no pin reports BOTH problems', async () => {
    // The resident has to know the address was rejected for length; otherwise
    // they see "give me a location" while looking at the location they typed.
    const r = await runRules(createComplaintRules, complaintBody({
      latitude: '', longitude: '', address_details: 'x'.repeat(256),
    }));
    const fields = fieldsWithErrors(r);
    expect(fields).toContain('address_details');
    expect(fields).toContain('location');
  });
});

describe('the same rule covers every other intake route', () => {
  test('an anonymous complaint accepts an address with no pin', async () => {
    const r = await runRules(createAnonymousComplaintRules, complaintBody({
      latitude: '', longitude: '', consent: 'true',
      address_details: 'Near the barangay hall.',
    }));
    expect(fieldsWithErrors(r)).toEqual([]);
  });

  test('an anonymous complaint is rejected with neither', async () => {
    const r = await runRules(createAnonymousComplaintRules, complaintBody({
      latitude: '', longitude: '', consent: 'true',
    }));
    expect(fieldsWithErrors(r)).toContain('location');
  });

  test('a wildlife turnover accepts an address with no pin', async () => {
    const r = await runRules(createWildlifeRules, wildlifeBody({
      latitude: '', longitude: '', address_details: 'Along the creek behind the school.',
    }));
    expect(fieldsWithErrors(r)).toEqual([]);
  });

  test('a wildlife turnover is rejected with neither', async () => {
    const r = await runRules(createWildlifeRules, wildlifeBody({ latitude: '', longitude: '' }));
    expect(fieldsWithErrors(r)).toContain('location');
  });

  test('THE WALK-IN ROUTE IS NOW COVERED TOO - it used to be exempt', async () => {
    // The previous version of this file asserted the opposite. A counter clerk
    // can type a landmark even with no coordinates, so intake is not blocked.
    const r = await runRules(createWalkInComplaintRules, {
      barangay_id: '1',
      complaint_type: 'Illegal_Dumping',
      description: 'Walk-in: resident reports burning rubbish nightly.',
    });
    expect(fieldsWithErrors(r)).toContain('location');
  });

  test('a walk-in with only an address is accepted', async () => {
    const r = await runRules(createWalkInComplaintRules, {
      barangay_id: '1',
      complaint_type: 'Illegal_Dumping',
      description: 'Walk-in: resident reports burning rubbish nightly.',
      address_details: 'Purok 3, near the chapel.',
    });
    expect(fieldsWithErrors(r)).toEqual([]);
  });
});
