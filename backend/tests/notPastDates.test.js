// A date the office is being asked to ACT ON cannot be in the past.
//
// Two fields qualify: a resident's preferred_schedule, and the staff
// scheduled_date set when a request moves to Scheduled. Both are forward
// looking. `observed_at` is deliberately NOT here - it records when someone SAW
// something, so a past date is the only sensible value, and it already has the
// opposite bound (no future dates).
//
// Enforced in the API as well as the forms, because a rule enforced only in the
// browser is enforced only for people using the browser.

jest.mock('../src/services/category.service', () => ({
  isSelectable: jest.fn(async () => true),
}));

const { validationResult } = require('express-validator');
const { createRequestRules } = require('../src/validators/request.validators');
const { requestStatusRules } = require('../src/validators/staff.validators');

async function runRules(rules, body) {
  const req = { body, params: {}, query: {}, cookies: {}, headers: {} };
  for (const rule of rules) await rule.run(req);
  return validationResult(req).array().map((e) => e.path);
}

// LOCAL date arithmetic, deliberately - not toISOString(), which is UTC.
// The rule floors at server-local midnight, and a browser date input sends the
// user's local calendar date, so a UTC-derived fixture makes this suite fail
// for eight hours a day on a UTC+8 machine while passing on Railway.
const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const requestBody = (over = {}) => ({
  barangay_id: '1',
  request_type: 'Seedling_Distribution',
  description: 'Requesting seedlings for the barangay tree-planting drive.',
  address_details: 'Beside the barangay hall.',
  ...over,
});

describe('a resident cannot ask for a service in the past', () => {
  test('TODAY IS ACCEPTED - the rule is "not in the past", not "strictly future"', async () => {
    // Same-day scheduling is legitimate and an off-by-one here makes the field
    // unusable for it. This is the case most likely to be got wrong.
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: dayOffset(0) }))).toEqual([]);
  });

  test('tomorrow is accepted', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: dayOffset(1) }))).toEqual([]);
  });

  test('YESTERDAY IS REFUSED', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: dayOffset(-1) }))).toContain('preferred_schedule');
  });

  test('a date far in the past is refused', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: '2001-01-01' }))).toContain('preferred_schedule');
  });

  test('omitting it entirely is still fine - the field is optional', async () => {
    expect(await runRules(createRequestRules, requestBody())).toEqual([]);
  });

  test('an empty string is still fine, which is what an untouched date input sends', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: '' }))).toEqual([]);
  });

  test('a non-date is still refused as before', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: 'next tuesday' }))).toContain('preferred_schedule');
  });
});

describe('staff cannot schedule a request for the past either', () => {
  test('today is accepted', async () => {
    expect(await runRules(requestStatusRules, { status: 'Scheduled', scheduled_date: dayOffset(0) })).toEqual([]);
  });

  test('yesterday is refused', async () => {
    expect(await runRules(requestStatusRules, { status: 'Scheduled', scheduled_date: dayOffset(-1) })).toContain('scheduled_date');
  });

  test('omitting it is fine - it is only set on the Scheduled transition', async () => {
    expect(await runRules(requestStatusRules, { status: 'Approved' })).toEqual([]);
  });
});

describe('the general request-update route is covered too, not just the status route', () => {
  // The rule lived only on requestStatusRules at first, so a past date could
  // still be set through PATCH /staff/requests/:id - the same field, a
  // different validator array. Two arrays, one rule.
  const { requestUpdateRules } = require('../src/validators/staff.validators');

  test('yesterday is refused here as well', async () => {
    expect(await runRules(requestUpdateRules, { scheduled_date: dayOffset(-1) })).toContain('scheduled_date');
  });

  test('today is still accepted', async () => {
    expect(await runRules(requestUpdateRules, { scheduled_date: dayOffset(0) })).toEqual([]);
  });
});

describe('observed_at keeps its OPPOSITE bound', () => {
  // The inverse case, so the two rules cannot be conflated by someone
  // "making the date handling consistent".
  const { createComplaintRules } = require('../src/validators/complaint.validators');
  const complaintBody = (over = {}) => ({
    barangay_id: '1',
    complaint_type: 'Illegal_Dumping',
    description: 'There is a pile of household waste beside the creek.',
    address_details: 'Beside the covered court.',
    ...over,
  });

  test('a PAST observed date is accepted - that is the only sensible value', async () => {
    expect(await runRules(createComplaintRules, complaintBody({ observed_at: dayOffset(-7) }))).toEqual([]);
  });

  test('a FUTURE observed date is refused', async () => {
    expect(await runRules(createComplaintRules, complaintBody({ observed_at: dayOffset(7) }))).toContain('observed_at');
  });
});
