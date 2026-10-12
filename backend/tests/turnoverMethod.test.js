// How the animal reaches CENRO: the reporter chooses "I will bring it in" or
// "please collect it", and that choice decides whether the office waits at the
// counter or schedules a trip.
//
// WHY THIS SUITE EXISTS. The field is REQUIRED in both clients' own UI and
// OPTIONAL at the API, and that asymmetry is deliberate, load-bearing, and
// exactly the kind of thing a later "tighten the validation" pass deletes
// without realising what it costs:
//
//   An installed APK that predates this question does not send the field. If
//   the API required it, every wildlife report from that build would 422 - and
//   it would fail AFTER the resident had filled in the species, the condition,
//   the location, the description and a photo, which is the worst moment to be
//   refused. CLAUDE.md records this shape twice (the SecureStore crash on the
//   register token, and the walk-in location exemption). Mobile updates arrive
//   over the air on the NEXT launch, so there is always a window where both
//   versions are live.
//
// So: an omitted method must pass validation and be stored as NULL, and a
// supplied one must be one of the two enum values. A test that only checked the
// happy path would let someone make it required and never notice.

const { validationResult } = require('express-validator');
const { createWildlifeRules, TURNOVER_METHODS } = require('../src/validators/wildlife.validators');

async function runRules(body) {
  const req = { body, params: {}, query: {}, cookies: {}, headers: {} };
  for (const rule of createWildlifeRules) await rule.run(req);
  return { result: validationResult(req), req };
}

const errorFields = (result) => result.array().map((e) => e.path);

// Valid apart from whatever an individual test changes.
const wildlifeBody = (over = {}) => ({
  barangay_id: '1',
  species_name: 'Reticulated Python',
  animal_condition: 'Healthy',
  description: 'A large snake is coiled under the parked tricycle by the creek.',
  latitude: '14.2726',
  longitude: '121.1256',
  ...over,
});

describe('turnover_method validation', () => {
  test('accepts Walk_In', async () => {
    const { result } = await runRules(wildlifeBody({ turnover_method: 'Walk_In' }));
    expect(result.isEmpty()).toBe(true);
  });

  test('accepts Pickup_Request', async () => {
    const { result } = await runRules(wildlifeBody({ turnover_method: 'Pickup_Request' }));
    expect(result.isEmpty()).toBe(true);
  });

  // THE POINT OF THE SUITE. An old client sends no such field; it must file.
  test('accepts a report that omits the field entirely', async () => {
    const { result } = await runRules(wildlifeBody());
    expect(result.isEmpty()).toBe(true);
    expect(errorFields(result)).not.toContain('turnover_method');
  });

  // Multipart forms send an untouched field as '' rather than omitting the key,
  // so the empty string has to be tolerated the same way a missing key is.
  test('accepts an empty string, as a multipart form sends it', async () => {
    const { result } = await runRules(wildlifeBody({ turnover_method: '' }));
    expect(result.isEmpty()).toBe(true);
  });

  test('rejects a value outside the enum', async () => {
    const { result } = await runRules(wildlifeBody({ turnover_method: 'Courier' }));
    expect(result.isEmpty()).toBe(false);
    expect(errorFields(result)).toContain('turnover_method');
  });

  // The enum is duplicated in four places by necessity (Prisma schema, this
  // validator, web/src/lib/reports.js, mobile/src/lib/reports.js). This pins the
  // one copy the API enforces, so a rename that misses a client is at least
  // caught on the side that returns the 422.
  test('the accepted list is exactly the two documented values', () => {
    expect(TURNOVER_METHODS).toEqual(['Walk_In', 'Pickup_Request']);
  });
});

describe('turnover_method is not confused with reported_via', () => {
  // Both enums have a `Walk_In` member and they mean different things:
  // reported_via is the channel the REPORT arrived through (a staff intake
  // field), turnover_method is how the ANIMAL arrives. Nothing may quietly
  // start writing one from the other.
  test('the create rules do not accept reported_via from a reporter', async () => {
    const { req } = await runRules(wildlifeBody({ reported_via: 'Walk_In' }));
    // express-validator ignores unknown fields rather than refusing them, so
    // the guarantee that matters is in the service: it never reads this key.
    const svc = require('fs').readFileSync(
      require('path').join(__dirname, '../src/services/wildlife.service.js'),
      'utf8',
    );
    expect(svc).not.toMatch(/input\.reported_via/);
    expect(req.body.reported_via).toBe('Walk_In');
  });
});
