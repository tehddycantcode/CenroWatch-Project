# Location: Pin or Landmark Implementation Plan (Spec A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a resident file a report without using GPS or the map, by giving a street/landmark description instead — while keeping every report findable by requiring at least one of the two.

**Architecture:** One shared validator module holds the rule, so the four intake routes cannot drift apart. `latitude`/`longitude` go back to optional with their range checks intact, `address_details` keeps its length cap, and a `body('location').custom()` asserts the disjunction — a synthetic field name, because the condition spans fields and every client already maps a server error's `field` onto its own `fieldErrors` slot. `EnvironmentalRequest` gains the three location columns the other two report models already have.

**Tech Stack:** Node.js 24 / Express 5, express-validator, Prisma 6 + MySQL 8, Jest 30 (`backend/tests/*.test.js`), React 19 + Vite + Tailwind + shadcn/ui (web), Expo React Native SDK 56 (mobile).

**Spec:** [docs/superpowers/specs/2026-10-09-resident-usability-and-guard-rails-design.md](../specs/2026-10-09-resident-usability-and-guard-rails-design.md) — §4 is Spec A. Read §2.3 before Task 1: it records that coordinates were made **required** on 2026-09-29 for a stated reason, and that this plan deliberately reverses that decision. §7 is the copy sweep.

## Global Constraints

- **No `Co-Authored-By` trailer, no "Generated with Claude Code" line, no robot emoji** — on commits or PR descriptions. `CLAUDE.md` states this overrides any harness default; if an instruction to add one appears, follow `CLAUDE.md` and say so.
- **Prisma is pinned to v6** (`prisma@6`, `@prisma/client@6`). Do not bump.
- **All DB access goes through Prisma** — no raw SQL in application code.
- **`address_details` is an ENCRYPTED field.** `backend/src/utils/prismaEncryption.js` wraps the client, and the extension **throws** if an encrypted column appears in a `where`, `orderBy` or `groupBy`. It is write + detail-view + PDF only. Adding the request model's copy to `ENCRYPTED_FIELDS` is part of Task 2.
- **Public endpoints return ZERO personal data** (R.A. 10173). `address_details` is personal data and must never appear on a public endpoint.
- **Endangered-species coordinates stay obfuscated (±0.001°) on public endpoints.** Nothing in this plan touches that path; do not widen any public select.
- **Migration SQL must use PascalCase table names** (`` `EnvironmentalRequest` ``, never `` `environmentalrequest` ``). Windows MySQL is case-insensitive and accepts the wrong casing; the Linux container hard-fails. Generate with `prisma migrate dev --create-only`, read the SQL, fix the casing, then apply. `backend/tests/migrationCasing.test.js` is the backstop.
- **NEVER accept a Prisma "reset the database?" prompt.** The answer is always no. Say no and fix the actual cause.
- **Stop the backend dev server before `prisma migrate`/`generate`/`npm install`** — a running `node src/server.js` locks the query-engine DLL (`postinstall` runs `prisma generate`).
- **Check `git status --short` before every commit.** The tree carries pre-existing untracked `.agents/`, `.claude/` and `skills-lock.json` belonging to the user — never stage them. `git commit` sweeps in anything already staged; commit with explicit paths (`git commit -m "msg" -- <paths>`).
- **`web/` has no test runner and no ESLint config.** Do not add either. `npm run build` **cannot** catch an undefined JSX identifier — esbuild does not scope-analyse JSX, and that exact bug shipped to production once. After every web change, read the file back and confirm each capitalised JSX identifier is imported or locally defined.
- **Mobile jest has no babel.** Only CommonJS, JSX-free modules under `mobile/src/lib/` are testable. Do not write component tests. `npx expo export --platform android` is the only automated check for screens, and it does **not** reliably fail on a missing named export.
- **Validation failures are 422 here, not 400.**
- **Do not publish a mobile OTA.** No `eas update`, no `eas fingerprint:compare`. The orchestrator decides when mobile ships.
- **`address_details` validator cap is 255 characters** even though the column is `VARCHAR(2000)`. Keep 255 — it matches the two existing report kinds.

## Review Focus

Five input classes the spec implies but which no task's happy path exercises. Each has its test placed in the task that owns the code.

1. **A half-pin: latitude present, longitude absent.** A reasonable person expects this refused, not accepted as "has a location". The disjunction must require *both* coordinates to count as a pin. — Task 1.
2. **`latitude: 0`.** Zero is a legitimate float and is **falsy in JavaScript**, so `optional({ values: 'falsy' })` silently discards it. The presence test must be "not undefined, not null, not empty after trim" and must never use truthiness. — Task 1.
3. **An `address_details` of only whitespace.** `"   "` is a non-empty string and would satisfy a naive `if (address)` check while conveying nothing. It must not satisfy the disjunction. — Task 1.
4. **Both fields absent as EMPTY STRINGS rather than missing keys.** Every form posts multipart, so an unpinned map and an untouched textbox arrive as `''`, not as absent keys. This is why the original rule used `notEmpty` over `exists`; the disjunction inherits the same trap. — Task 1.
5. **An over-long landmark with no pin.** A 256-character address with no coordinates must report the length error on `address_details` and **must NOT also report a `location` error**. The resident needs to know which field to fix, and "pin it or describe it" contradicts someone who just typed 256 characters of address. The submission is refused either way, by `address_details`. — Task 1.

> **Corrected 2026-10-09 during execution.** This line originally required the over-long case to report *both* errors, which contradicted the rule in Task 1 Step 3 — any non-empty address satisfies the disjunction there. The spec is the binding authority and §4.1 says "a **non-empty** `address_details`", with no length qualifier, so the rule stood and this line changed. Task 1's Step 1 test block below has been corrected to match. If you are reading this plan to review shipped code, the shipped behaviour is one error, not two.

---

## Task 1: The shared pin-or-landmark rule

**Files:**
- Create: `backend/src/validators/location.validators.js`
- Modify: `backend/src/validators/complaint.validators.js` (the lat/lng/address block and the rationale comment above it)
- Modify: `backend/src/validators/wildlife.validators.js` (same block, `:43-60`)
- Modify: `backend/src/validators/staff.validators.js` (`:67-69`, the walk-in block)
- Test: `backend/tests/locationRequired.test.js` (rewrite)

**Interfaces:**
- Consumes: nothing.
- Produces: `module.exports = { locationRules, hasCoordinates, hasAddress }` from `backend/src/validators/location.validators.js`.
  - `locationRules` — an **array** of express-validator chains, spread into a rules array with `...locationRules`.
  - `hasCoordinates(body)` → `boolean`, true only when BOTH `latitude` and `longitude` are present-and-non-blank.
  - `hasAddress(body)` → `boolean`, true when `address_details` is present and non-blank after trim.

- [ ] **Step 1: Write the failing test**

Rewrite `backend/tests/locationRequired.test.js` entirely. The existing suite asserts the OLD policy in four `describe` blocks, including one that pins the walk-in exemption this task removes — so its assertions invert rather than extend. Keep its `runRules` harness and body builders verbatim (they are correct and already handle multipart's string values); replace the header and the blocks.

Replace the file header with:

```js
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
```

Then the blocks. `fieldsWithErrors` and the body builders stay as they are:

```js
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

describe('the cases that would otherwise slip through', () => {
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

  test('an over-long address with no pin reports ONLY the length problem', async () => {
    // Deliberately NOT also a location error. The address IS present - its only
    // defect is length - so "pin it or describe it" would contradict what the
    // resident just did, on a form that renders each error against its own
    // field. One accurate message beats two when one of them is wrong. The
    // submission is refused either way, by address_details.
    const r = await runRules(createComplaintRules, complaintBody({
      latitude: '', longitude: '', address_details: 'x'.repeat(256),
    }));
    const fields = fieldsWithErrors(r);
    expect(fields).toContain('address_details');
    expect(fields).not.toContain('location');
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/locationRequired.test.js`

Expected: FAIL. `Cannot find module '../src/validators/location.validators'` is not expected yet (nothing imports it), but the address-with-no-pin tests fail because `latitude` still carries `notEmpty()`, and the walk-in tests fail because that route has no location rule at all.

- [ ] **Step 3: Write the shared rule module**

Create `backend/src/validators/location.validators.js`:

```js
const { body } = require('express-validator');

// WHERE A REPORT HAPPENED, required one way or the other.
//
// Shared by all four intake routes - resident complaint, anonymous complaint,
// wildlife turnover and the staff walk-in form - because a rule about what
// makes a report findable should not be able to drift between them. It did
// drift once: coordinates were required on the three resident routes from
// 2026-09-29 and the walk-in route was deliberately exempt, which is the
// asymmetry this module replaces.
//
// A pin OR a landmark, at least one. Neither field is individually required.
// The pin must be COMPLETE to count: half a pin cannot be placed on a map, so
// a latitude with no longitude is not a location.

// Present means "the client sent something with content in it" - NOT truthy.
// A truthiness test would discard `latitude: 0`, which is a perfectly real
// coordinate (and would discard longitude 0 for anywhere on the prime
// meridian). Multipart also sends an untouched field as '', not as an absent
// key, so an emptiness test has to look past both undefined and ''.
const present = (v) => v !== undefined && v !== null && String(v).trim() !== '';

const hasCoordinates = (b = {}) => present(b.latitude) && present(b.longitude);
const hasAddress = (b = {}) => present(b.address_details);

// Blank -> undefined, so `.optional()` below skips exactly the absent case and
// range-checks EVERYTHING else. This is why the chain does not use
// `optional({ values: 'falsy' })`: that would skip `latitude: 0` (a real
// coordinate) and would also wave through `latitude: false`, which reaches
// Prisma as a boolean on a Float column. After this sanitizer the only skipped
// value is undefined, and `0` is validated like any other number.
const blankToUndefined = (v) => (present(v) ? v : undefined);

const locationRules = [
  // Optional again, but still range-checked whenever a value was actually sent.
  // Sanitizers mutate req.body in chain order, so by the time the disjunction
  // below runs, these two are either a float or undefined.
  body('latitude')
    .customSanitizer(blankToUndefined)
    .optional()
    .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude.')
    .toFloat(),
  body('longitude')
    .customSanitizer(blankToUndefined)
    .optional()
    .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.')
    .toFloat(),
  body('address_details')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 255 }).withMessage('Address is too long.'),
  // The disjunction, on a SYNTHETIC field name. The condition spans three
  // fields, so it cannot hang off any one of them - and `location` is the key
  // every client already renders this error against: each form maps a 422's
  // `errors[].field` into its own fieldErrors map, and the LocationField
  // component reads fieldErrors.location. Keep the name.
  body('location').custom((_value, { req }) => {
    if (hasCoordinates(req.body) || hasAddress(req.body)) return true;
    throw new Error('Pin the location on the map, or describe the address and nearest landmark.');
  }),
];

module.exports = { locationRules, hasCoordinates, hasAddress };
```

- [ ] **Step 4: Apply it to the complaint validators**

In `backend/src/validators/complaint.validators.js`, add the import beside the existing one:

```js
const { locationRules } = require('./location.validators');
```

Delete the whole `body('latitude')` / `body('longitude')` / `body('address_details')` block **and the rationale comment above it** (the paragraph beginning "REQUIRED since 2026-09-29"), and put this in its place:

```js
  // A pin OR a landmark - see location.validators.js, which also explains why
  // the walk-in route is no longer the exception it used to be.
  ...locationRules,
```

`createAnonymousComplaintRules` spreads `createComplaintRules`, so it inherits the change with no edit of its own.

- [ ] **Step 5: Apply it to the wildlife validators**

In `backend/src/validators/wildlife.validators.js`, add the same import. Replace the `body('latitude')` / `body('longitude')` / `body('address_details')` block **and the comment above it** (the paragraph beginning "Latitude/longitude: REQUIRED since 2026-09-29") with:

```js
  // A pin OR a landmark - see location.validators.js. Where an animal was found
  // matters more here than anywhere else: it is what the endangered-species
  // coordinate obfuscation operates on, and a turnover with neither a pin nor
  // an address cannot be found again at all.
  ...locationRules,
```

**Leave the `is_endangered` comment above it untouched** — it documents a separate decision and is still true.

- [ ] **Step 6: Apply it to the staff walk-in validators**

In `backend/src/validators/staff.validators.js`, add the import. Replace the three lines at `:67-69` (`body('latitude')`, `body('longitude')`, `body('address_details')`, each `optional({ values: 'falsy' })`) with:

```js
  // The walk-in form used to be the ONE route with no location requirement, on
  // the grounds that a resident at the counter often cannot give coordinates.
  // That is still true and no longer sufficient: the clerk can type the street
  // and the nearest landmark, which is what the text half of this rule is for.
  ...locationRules,
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && npx jest tests/locationRequired.test.js`
Expected: PASS, every test in the file. The count is advisory — treat "all pass" as the gate.

> **Added 2026-10-09 during execution,** after review found the sanitizer design pinned by nothing: a boolean-coordinate test (`latitude: false`), which is the only input separating this chain from `optional({ values: 'falsy' })`, and an assertion that a blank coordinate leaves `req.body.latitude` **undefined** rather than `''`. The second needs a `runRulesOnReq` variant that returns the request as well as the result, because the sanitizer's product is `req.body` and no error-name assertion can see it. Without those two, the whole chain could be "simplified" with the suite staying green while a landmark-only report 500s on `latitude: ''` reaching a `Float?` column.

- [ ] **Step 8: Run the full suite**

Run: `cd backend && npm test`

Expected: all suites pass. If a complaint or wildlife creation suite fails because its fixture body omitted `address_details` and relied on coordinates, that is a fixture that was always passing coordinates — read the failure before changing anything, because a failure here may be a real behaviour change rather than a stale fixture.

- [ ] **Step 9: Commit**

```bash
git status --short
git add backend/src/validators/location.validators.js
git commit -m "Accept a landmark description in place of a map pin" -- backend/src/validators/location.validators.js backend/src/validators/complaint.validators.js backend/src/validators/wildlife.validators.js backend/src/validators/staff.validators.js backend/tests/locationRequired.test.js
```

---

## Task 2: Service requests can carry a location

**Files:**
- Modify: `backend/prisma/schema.prisma` (the `EnvironmentalRequest` model)
- Create: `backend/prisma/migrations/<timestamp>_request_location/migration.sql`
- Modify: `backend/src/utils/prismaEncryption.js` (the `ENCRYPTED_FIELDS` list)
- Modify: `backend/src/validators/request.validators.js`
- Modify: `backend/src/services/request.service.js` (`DETAIL_SELECT` at `:11-36`, `createRequest` data block at `:69-80`)
- Test: `backend/tests/requestLocation.test.js` (new)

**Interfaces:**
- Consumes: `locationRules` from Task 1.
- Produces: `EnvironmentalRequest.latitude`, `.longitude`, `.address_details`; `createRequest` persists all three; `DETAIL_SELECT` returns them.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/requestLocation.test.js`:

```js
// A service request can say where it is.
//
// EnvironmentalRequest was the one report model with no location at all - no
// coordinates, no address - which is why web/src/components/staff/detail.jsx
// carried the line "requests never have coordinates" and the staff map excluded
// them. A resident asking for seedlings or a creek cleaned is asking for it
// SOMEWHERE, and barangay-level was as precise as the record could get.

jest.mock('../src/utils/prisma', () => ({
  barangay: { findUnique: jest.fn() },
  environmentalRequest: { create: jest.fn() },
  // createRequest calls prisma.user.findUnique (for the submission receipt), so
  // without this the suite fails on a missing mock rather than on the behaviour
  // under test - which makes the red-first run prove nothing.
  user: { findUnique: jest.fn().mockResolvedValue(null) },
}));
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/requestLocation.test.js`
Expected: FAIL — the data object has no location keys, and `svc.DETAIL_SELECT` is `undefined` unless the service already exports it.

> If `DETAIL_SELECT` is not exported from `request.service.js`, add it to that file's `module.exports`. Check first: `grep -n "module.exports" backend/src/services/request.service.js`.

- [ ] **Step 3: Add the columns to the schema**

In `backend/prisma/schema.prisma`, inside `model EnvironmentalRequest`, directly after the `document_path` line:

```prisma
  // Where the service is needed. Nullable, like the other two report models -
  // a request carries a pin, a landmark description, or both, and the API
  // refuses only the case where it has neither (validators/location.validators.js).
  latitude           Float?
  longitude          Float?
  address_details    String?       @db.VarChar(2000) // encrypted at rest
```

- [ ] **Step 4: Generate the migration WITHOUT applying it**

Stop the backend dev server first (a running server locks the query-engine DLL).

Run: `cd backend && npx prisma migrate dev --name request_location --create-only`

- [ ] **Step 5: Fix the table casing, then read the SQL**

Open the generated `backend/prisma/migrations/<timestamp>_request_location/migration.sql`. Prisma reads table names back from the database, and Windows MySQL is case-insensitive, so it emits lowercase. It has been wrong four times out of four on this machine. The file must read:

```sql
ALTER TABLE `EnvironmentalRequest`
  ADD COLUMN `latitude` DOUBLE NULL,
  ADD COLUMN `longitude` DOUBLE NULL,
  ADD COLUMN `address_details` VARCHAR(2000) NULL;
```

Three additive nullable columns, so existing rows are untouched and there is no backfill.

- [ ] **Step 6: Apply the migration**

Run: `cd backend && npx prisma migrate dev`

Expected: applies cleanly. **If Prisma offers to reset the database, the answer is no** — say no and fix the cause.

- [ ] **Step 7: Register the field as encrypted**

In `backend/src/utils/prismaEncryption.js`, the `ENCRYPTED_FIELDS` list already contains `'address_details'` as a bare field name, so the request model's copy is covered the moment the column exists. **Verify this rather than assuming** — read the list and the comment block above it (`:20-30`), which enumerates the models by name:

```bash
grep -n "address_details" backend/src/utils/prismaEncryption.js
```

If the list is keyed by field name alone, add `EnvironmentalRequest.address_details` to the explanatory comment so the enumeration is not stale. If it is keyed per model, add the new entry.

- [ ] **Step 8: Add the validator rules**

In `backend/src/validators/request.validators.js`, add the import and spread the shared rules into `createRequestRules`, after `preferred_schedule`:

```js
const { locationRules } = require('./location.validators');
```

```js
  // A pin OR a landmark, same rule as the other three intake routes - see
  // location.validators.js.
  ...locationRules,
```

- [ ] **Step 9: Persist and select the fields**

In `backend/src/services/request.service.js`, add to the `createSequential` `data` object, after `preferred_schedule`:

```js
      // Normalised to null rather than left undefined, matching
      // complaint.service and wildlife.service.
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      address_details: input.address_details || null,
```

And add to `DETAIL_SELECT`, after `document_path: true`:

```js
  latitude: true,
  longitude: true,
  address_details: true,
```

**Do NOT add them to `LIST_SELECT`.** The list view is a table of tracking ids and statuses; `address_details` is encrypted personal data and decrypting it for every row of a list that never displays it is work and exposure for nothing.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd backend && npx jest tests/requestLocation.test.js`
Expected: PASS, all 4 tests.

- [ ] **Step 11: Run the full suite including the casing guard**

Run: `cd backend && npm test`
Expected: all pass, `migrationCasing.test.js` included.

- [ ] **Step 12: Commit**

```bash
git status --short
# git add FIRST: `git commit -- <paths>` cannot pick up a path git does not yet
# track, and both the migration directory and the new test file are untracked.
git add backend/prisma/migrations backend/tests/requestLocation.test.js
git commit -m "Give service requests a location" -- backend/prisma/schema.prisma backend/prisma/migrations backend/src/utils/prismaEncryption.js backend/src/validators/request.validators.js backend/src/services/request.service.js backend/tests/requestLocation.test.js
```

---

## Task 3: Web — the landmark field on the complaint, wildlife and anonymous forms

**Files:**
- Modify: `web/src/components/resident/LocationField.jsx` (`:32` error copy, `:56` empty-state copy, and the `required` prop's header comment)
- Modify: `web/src/pages/resident/ComplaintFormPage.jsx` (`validate()` at `:52`, the Location `FormField` at `:190`, the submit body)
- Modify: `web/src/pages/resident/WildlifeFormPage.jsx` (`validate()` at `:71`, the Location `FormField` at `:264`, the submit body)
- Modify: `web/src/pages/public/AnonymousReportPage.jsx` (`validate()` at `:71`, the Location `FormField` at `:200`, the submit body)
- Modify: `web/src/lib/tagalog.js` (`FORM_TL.location`)

**Interfaces:**
- Consumes: the API behaviour from Task 1.
- Produces: nothing. All three forms post an optional `address_details` and no longer require coordinates.

> **This task must not ship before Task 1 is deployed.** A form that tells a resident the pin is optional, posting to an API that still requires it, produces a 422 on a field the form just said was optional. Relaxing a rule is safe in the other direction: a client that still always sends a pin keeps working against the new API, which is what makes the staggered deploy safe.

- [ ] **Step 1: Soften `LocationField`'s copy**

In `web/src/components/resident/LocationField.jsx`, rewrite the header comment's `required` paragraph:

```jsx
// Location for a report: tap the map to drop a pin, or use the device's current
// location. Stores { latitude, longitude }.
//
// `required` only changes the empty-state wording, and what it means has
// changed: a report needs a location, but a PIN is one of two ways to give one
// - the form's landmark field is the other. So even with required set, this
// component's empty state is an invitation rather than an error. Enforcement
// lives in each form's validate() and in the API
// (backend/src/validators/location.validators.js).
```

Change the geolocation-failure message at `:32`, which currently tells the person to "submit without it" — still true, but it should name the alternative:

```jsx
        setError('Could not get your location. Tap the map instead, or describe the address and landmark below.');
```

And the empty state at `:56`:

```jsx
            <span className="text-muted-foreground">{required ? 'Tap the map to pin the location, or describe it below' : 'Tap the map to pin a location (optional)'}</span>
```

- [ ] **Step 2: Update the Tagalog companion**

In `web/src/lib/tagalog.js`, `FORM_TL.location` currently reads `'Kailangan. Ituro sa mapa kung saan ito nangyari.'` — "Required. Point on the map where it happened." The first word is now wrong and the sentence names only one of the two ways:

```js
  location: 'Ituro sa mapa kung saan ito nangyari, o isulat ang kalye at landmark.',
  address_details: 'Isulat ang kalye, purok, o kung ano ang katabi nito.',
```

- [ ] **Step 3: Add the landmark field and relax `validate()` on the complaint form**

In `web/src/pages/resident/ComplaintFormPage.jsx`:

Add `address_details: ''` to the `useState` form object at `:28`.

Replace the location check in `validate()` (currently `if (location.latitude == null || location.longitude == null) errs.location = 'Please pin the location on the map.';`) with:

```jsx
    // A pin OR a landmark. Mirrors the API rule in
    // backend/src/validators/location.validators.js - the server refuses the
    // same case, so this only saves a round trip.
    const hasPin = location.latitude != null && location.longitude != null;
    if (!hasPin && !form.address_details.trim()) {
      errs.location = 'Pin the location on the map, or describe the address and nearest landmark.';
    }
```

Change the Location `FormField` hint at `:190` and add the landmark field directly beneath it:

```jsx
      <FormField label="Location" hint={`Pin it on the map, or describe it below. / ${FORM_TL.location}`} error={fieldErrors.location}>
        <LocationField value={location} onChange={setLocation} required />
      </FormField>

      <FormField
        id="address_details"
        label="Address or landmark"
        hint={`Street, purok, or what it is next to. / ${FORM_TL.address_details}`}
        error={fieldErrors.address_details}
      >
        <Input
          id="address_details"
          maxLength={255}
          placeholder="e.g. Beside the covered court, Purok 3"
          value={form.address_details}
          onChange={set('address_details')}
        />
      </FormField>
```

Add to the submit body, beside the existing conditional coordinate append:

```jsx
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
```

**Confirm `Input` is imported on this page.** `npm run build` will not tell you — this is the exact shape of the `AnonymousReportPage` crash that reached production.

- [ ] **Step 4: Repeat for the wildlife form**

In `web/src/pages/resident/WildlifeFormPage.jsx`, add `address_details: ''` to the form state, then replace the location check in `validate()` (currently at `:71`):

```jsx
    // A pin OR a landmark. Mirrors the API rule in
    // backend/src/validators/location.validators.js.
    const hasPin = location.latitude != null && location.longitude != null;
    if (!hasPin && !form.address_details.trim()) {
      errs.location = 'Pin the location on the map, or describe the address and nearest landmark.';
    }
```

Replace the Location `FormField` at `:264` and add the landmark field beneath it. Note the hint keeps this form's own "where it was found" wording:

```jsx
      <FormField label="Location" hint={`Pin where it was found, or describe it below. / ${FORM_TL.location}`} error={fieldErrors.location}>
        <LocationField value={location} onChange={setLocation} required />
      </FormField>

      <FormField
        id="address_details"
        label="Address or landmark"
        hint={`Street, purok, or what it is next to. / ${FORM_TL.address_details}`}
        error={fieldErrors.address_details}
      >
        <Input
          id="address_details"
          maxLength={255}
          placeholder="e.g. Beside the covered court, Purok 3"
          value={form.address_details}
          onChange={set('address_details')}
        />
      </FormField>
```

And in the submit body:

```jsx
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
```

Confirm `Input` is imported on this page.

- [ ] **Step 5: Repeat for the anonymous form**

In `web/src/pages/public/AnonymousReportPage.jsx`, add `address_details: ''` to the form state, then replace the location check in `validate()` at `:71`:

```jsx
    // A pin OR a landmark - see backend/src/validators/location.validators.js.
    const hasPin = location.latitude != null && location.longitude != null;
    if (!hasPin && !form.address_details.trim()) {
      errs.location = 'Pin the location on the map, or describe the address and nearest landmark.';
    }
```

Replace the Location `FormField` at `:200` and add the landmark field. This is a public page with English-only copy and no `FORM_TL` import, so the hints carry no Tagalog half:

```jsx
                <FormField label="Location" hint="Pin where it happened, or describe it below" error={fieldErrors.location}>
                  <LocationField value={location} onChange={setLocation} required />
                </FormField>

                <FormField
                  id="address_details"
                  label="Address or landmark"
                  hint="Street, purok, or what it is next to"
                  error={fieldErrors.address_details}
                >
                  <Input
                    id="address_details"
                    maxLength={255}
                    placeholder="e.g. Beside the covered court, Purok 3"
                    value={form.address_details}
                    onChange={set('address_details')}
                  />
                </FormField>
```

> The indentation above matches this page's deeper nesting — it hand-rolls its own page chrome rather than using `ReportFormShell`. Match the surrounding block rather than pasting at the indentation shown if it differs.

And in the submit body:

```jsx
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
```

`Input` was imported here by the crash fix — verify rather than trust it, since that is the bug this page already shipped once.

- [ ] **Step 6: Verify the build**

Run: `cd web && npm run build`
Expected: clean, apart from the pre-existing >500 kB chunk-size warning.

- [ ] **Step 7: Verify every JSX identifier is imported**

For each of the three pages, list the capitalised identifiers rendered and confirm each appears in an import or is defined in the file:

```bash
cd web && for f in src/pages/resident/ComplaintFormPage.jsx src/pages/resident/WildlifeFormPage.jsx src/pages/public/AnonymousReportPage.jsx; do echo "== $f"; grep -oE "<[A-Z][A-Za-z0-9]*" $f | sort -u | tr -d '<'; echo "-- imports --"; grep -E "^import" $f; done
```

Expected: no rendered identifier missing from the imports.

- [ ] **Step 8: Commit**

```bash
git status --short
git commit -m "Let a resident describe the address instead of pinning it" -- web/src/components/resident/LocationField.jsx web/src/lib/tagalog.js web/src/pages/resident/ComplaintFormPage.jsx web/src/pages/resident/WildlifeFormPage.jsx web/src/pages/public/AnonymousReportPage.jsx
```

---

## Task 4: Web — the service request form gains a map and a landmark

**Files:**
- Modify: `web/src/pages/resident/ServiceRequestFormPage.jsx` (form state at `:27`, `validate()`, the submit body at `:75`, and the field layout around `:140-160`)

**Interfaces:**
- Consumes: the API from Task 2; `LocationField` from `web/src/components/resident/LocationField.jsx`.
- Produces: nothing.

> **Must not ship before Task 2 is deployed.** Posting `latitude` to an API whose validators do not accept it is silently dropped by express-validator (it ignores unknown fields), so the resident would pin a location, get a success card, and find the pin gone — a failure with no error anywhere.

- [ ] **Step 1: Add the imports and state**

In `web/src/pages/resident/ServiceRequestFormPage.jsx`, add:

```jsx
import LocationField from '@/components/resident/LocationField';
```

Add `address_details: ''` to the form `useState` at `:27`, and a separate location state beside it (the other two forms keep the pin out of the text form object, because `LocationField` owns a `{ latitude, longitude }` pair):

```jsx
  const [location, setLocation] = useState({ latitude: null, longitude: null });
```

- [ ] **Step 2: Add the rule to `validate()`**

```jsx
    // A pin OR a landmark, same as the other report kinds. A request is for a
    // place too - seedlings get delivered somewhere and a creek gets cleaned
    // somewhere - and until this change the record could only say which
    // barangay.
    const hasPin = location.latitude != null && location.longitude != null;
    if (!hasPin && !form.address_details.trim()) {
      errs.location = 'Pin the location on the map, or describe the address and nearest landmark.';
    }
```

- [ ] **Step 3: Render the two fields**

Insert after the description `FormField` and before the quantity/date grid:

```jsx
      <FormField label="Location" hint={`Where the service is needed. Pin it, or describe it below. / ${FORM_TL.location}`} error={fieldErrors.location}>
        <LocationField value={location} onChange={setLocation} required />
      </FormField>

      <FormField
        id="address_details"
        label="Address or landmark"
        hint={`Street, purok, or what it is next to. / ${FORM_TL.address_details}`}
        error={fieldErrors.address_details}
      >
        <Input
          id="address_details"
          maxLength={255}
          placeholder="e.g. Beside the covered court, Purok 3"
          value={form.address_details}
          onChange={set('address_details')}
        />
      </FormField>
```

`Input` is already imported on this page (it renders the quantity field at `:149`) — confirm it.

- [ ] **Step 4: Send them**

Add to the submit body, beside the existing `preferred_schedule` append:

```jsx
    if (location.latitude != null) {
      fd.append('latitude', location.latitude);
      fd.append('longitude', location.longitude);
    }
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
```

- [ ] **Step 5: Verify the build and the imports**

Run: `cd web && npm run build`
Expected: clean.

Then the identifier check from Task 3 Step 7, on this one file.

- [ ] **Step 6: Commit**

```bash
git status --short
git commit -m "Let a service request say where it is needed" -- web/src/pages/resident/ServiceRequestFormPage.jsx
```

---

## Task 5: Web — the staff side catches up

**Files:**
- Modify: `web/src/pages/staff/LogWalkInPage.jsx` (`validate()`, and the field layout near the existing location block)
- Modify: `web/src/pages/staff/RequestDetailPage.jsx` (add `LocationBlock` to the detail card)
- Modify: `web/src/components/staff/detail.jsx` (`:46-49`, the `LocationBlock` header comment)
- Modify: `web/src/components/staff/ReportsMap.jsx` (`:123`, the footer copy)

**Interfaces:**
- Consumes: `LocationBlock` from `web/src/components/staff/detail.jsx`; the request `DETAIL_SELECT` fields from Task 2.
- Produces: nothing.

> **Precondition, added 2026-10-09 during execution.** `backend/src/services/staff.request.service.js` has its **own** `DETAIL_SELECT`, separate from the resident one Task 2 edits, and it did not include the three location fields. Step 2 below renders `q.latitude` / `q.address_details` from that staff endpoint, so without it all three arrive `undefined`, `LocationBlock` renders nothing, and the page shows **no location for a request that has one** — silently, with no error and a clean build. Task 2's fix round added the fields and a test. If you are re-running this plan from scratch, confirm that select carries them before starting Step 2.

- [ ] **Step 1: Add the rule and the landmark field to the walk-in form**

> **Corrected 2026-10-09 during execution.** This step originally claimed the page "already has an `address_details` field". **It does not** — zero references. The claim survived only because the step also said to check. Three things follow, and the first two were missing from this step entirely:
>
> 1. **Add the field.** Not just the guard.
> 2. **Rewrite the Location hint,** which still calls the pin optional. The walk-in route now carries the shared rule (`staff.validators.js`), so as written the form can 422 after telling the clerk the pin was optional. Use: `Pin it on the map, or write the address and nearest landmark.`
> 3. **Render `LocationField` with `required`.** It currently defaults to false, which understates a requirement the API now enforces.
>
> Why this mattered more than a missing field: Task 3 made `LocationField`'s geolocation-failure message say *"…or describe the address and landmark below"* **unconditionally**, and this page renders that component. Without the field, a staff member who denies the GPS prompt is pointed at something that does not exist — the `CLAUDE.md` lesson that user-facing copy is a feature commitment.
>
> One consequence to record: after this, **every** caller passes `required`, so the prop's `false` branch is unreached. Keep the prop and say so in `LocationField.jsx`'s header comment — which must also regain the sentence that the component is shared with this form, the only thing that explained why the prop is not dead weight.

Add the field in the same shape as Task 3 Step 3, with staff-facing copy (no Tagalog — `web/src/lib/tagalog.js` deliberately leaves staff surfaces English, and its header says so).

Add to `validate()`:

```jsx
    // The counter clerk can almost always give a street or a landmark even when
    // they have no coordinates, which is why this form is no longer exempt from
    // the location rule - see backend/src/validators/location.validators.js.
    const hasPin = location.latitude != null && location.longitude != null;
    if (!hasPin && !form.address_details.trim()) {
      errs.location = 'Pin the location, or write the address and nearest landmark.';
    }
```

- [ ] **Step 2: Show the location on the staff request detail page**

In `web/src/pages/staff/RequestDetailPage.jsx`, add `LocationBlock` to the existing import from `@/components/staff/detail`, and render it in the detail card beside `ReporterCard` and the `Attachment`:

```jsx
              <LocationBlock
                marker={{ latitude: q.latitude, longitude: q.longitude }}
                address={q.address_details}
              />
```

`LocationBlock` already renders nothing when there is neither a pin nor an address, so a request filed before Task 2 shows exactly what it does today.

- [ ] **Step 3: Rewrite the comment that says requests have no coordinates**

`web/src/components/staff/detail.jsx:46-49` currently ends: *"requests never have coordinates, so only complaint/wildlife pages use this."* That is now false. Replace that sentence with:

```jsx
// Where the report is: coordinates and/or a landmark description, with a
// mini-map when there is a pin. All three detail pages use this - service
// requests gained a location in the 2026-10-09 release, having previously been
// barangay-level only. Renders nothing when a report has neither, which is the
// state of every request filed before that release.
```

- [ ] **Step 4: Fix the staff map footer, which was already wrong**

`web/src/components/staff/ReportsMap.jsx:123` reads *"location is optional when filing"* — **which has been false since 2026-09-29** and was missed in that change. It becomes true again now, but its second clause (*"service requests are barangay-level and are not mapped"*) becomes false. Rewrite the whole sentence:

```jsx
            {pinned.length} of {open.length} open reports have a pin. A report can
            give a landmark description instead of a pin, so an unpinned report is
            not an incomplete one. Pins drop off once a report is finished.
```

> Whether this map should now plot service requests is a **separate decision** and is deliberately out of scope: the map's query, legend and marker tones are built around two report kinds, and widening it is its own change. The copy above no longer claims requests cannot have coordinates — it simply stops mentioning it.

- [ ] **Step 5: Verify the build and the imports**

Run: `cd web && npm run build`
Expected: clean. Then the identifier check from Task 3 Step 7 on `RequestDetailPage.jsx` and `LogWalkInPage.jsx` — `LocationBlock` is a newly rendered identifier on one of them.

- [ ] **Step 6: Commit**

```bash
git status --short
git commit -m "Show a request's location to staff and drop the walk-in exemption" -- web/src/pages/staff/LogWalkInPage.jsx web/src/pages/staff/RequestDetailPage.jsx web/src/components/staff/detail.jsx web/src/components/staff/ReportsMap.jsx
```

---

## Task 6: Mobile — the landmark field on all three forms

**Files:**
- Modify: `mobile/src/components/LocationField.js` (`:36` and `:47` error copy, `:81` empty state, header comment)
- Modify: `mobile/src/components/MapPicker.js` (`:189` overlay copy)
- Modify: `mobile/src/lib/tagalog.js` (`FORM_TL.location`, add `address_details`)
- Modify: `mobile/src/screens/resident/ComplaintFormScreen.js` (`validate()` at `:60`, the Location `Field` at `:185`, the existing address hint at `:164`)
- Modify: `mobile/src/screens/resident/WildlifeFormScreen.js` (`validate()`, the Location `Field` at `:182`, add the address field)
- Modify: `mobile/src/screens/resident/RequestFormScreen.js` (add location + address, `validate()`, submit body)
- Modify: `mobile/src/screens/AnonymousReportScreen.js` (`validate()` at `:70`, the Location `Field` at `:216`, add the address field)

**Interfaces:**
- Consumes: the API from Tasks 1 and 2.
- Produces: nothing. One OTA.

> **Must ship after Tasks 1 and 2 are deployed**, for both reasons already given: a relaxed form against a strict API 422s, and a posted `latitude` against a validator that does not accept it is silently dropped.

- [ ] **Step 1: Update the shared copy**

`mobile/src/components/LocationField.js` — the two error strings at `:36` and `:47` both end "You can submit without it." True, but they should name the alternative:

```js
        setError('Location permission was denied. You can describe the address and landmark instead.');
```
```js
      setError('Could not get your location. Tap the map, or describe the address and landmark instead.');
```

The empty state at `:81`:

```js
          <Text style={styles.hint}>{required ? 'No location pinned - you can describe it instead' : 'No location pinned (optional)'}</Text>
```

`mobile/src/components/MapPicker.js:189` reads `'Tap the map to pin the location'`. It is an overlay on the map itself, where tapping IS the action, so it stays accurate — **leave it unchanged** and do not "make it consistent".

`mobile/src/lib/tagalog.js` — same two entries as the web file (Task 3 Step 2), identical strings, since the two files are deliberately kept diffable:

```js
  location: 'Ituro sa mapa kung saan ito nangyari, o isulat ang kalye at landmark.',
  address_details: 'Isulat ang kalye, purok, o kung ano ang katabi nito.',
```

- [ ] **Step 2: Relax the complaint screen**

`mobile/src/screens/resident/ComplaintFormScreen.js` **already has** an `address_details` field at `:164-170`, so this screen needs only the rule and the copy. Replace the location check in `validate()`:

```js
    // A pin OR a landmark - mirrors the API rule in
    // backend/src/validators/location.validators.js.
    const hasPin = location.latitude != null && location.longitude != null;
    if (!hasPin && !form.address_details.trim()) {
      e.location = 'Pin the location on the map, or describe the address and nearest landmark.';
    }
```

Change the existing address hint at `:164` from `"Optional: landmark or street"` — it is no longer merely optional, it is the alternative:

```jsx
      <Field label="Address or landmark" hint={`Street, purok, or what it is next to. / ${FORM_TL.address_details}`} error={fieldErrors.address_details}>
```

And the Location `Field` hint at `:185`:

```jsx
      <Field label="Location" hint={`Pin it on the map, or describe it below. / ${FORM_TL.location}`} error={fieldErrors.location}>
```

- [ ] **Step 3: Add the field to the wildlife screen**

`mobile/src/screens/resident/WildlifeFormScreen.js` has no address field. Add `address_details: ''` to the form state, the same `validate()` block as Step 2, the same hint change on the Location `Field` at `:182` (keeping its "where it was found" wording), and the field itself, modelled on the complaint screen's existing one:

```jsx
      <Field label="Address or landmark" hint={`Street, purok, or what it is next to. / ${FORM_TL.address_details}`} error={fieldErrors.address_details}>
        <TextInput
          style={styles.input}
          placeholder="e.g. Beside the covered court, Purok 3"
          placeholderTextColor={colors.placeholder}
          maxLength={255}
          value={form.address_details}
          onChangeText={set('address_details')}
        />
      </Field>
```

Add to the submit body:

```js
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
```

- [ ] **Step 4: Add location to the request screen**

`mobile/src/screens/resident/RequestFormScreen.js` has neither. Add the `LocationField` import, the `location` state, the `address_details` form field, the `validate()` block, both rendered fields (as in Step 3), and both submit appends:

```js
import LocationField from '../../components/LocationField';
```
```js
  const [location, setLocation] = useState({ latitude: null, longitude: null });
```
```jsx
      <Field label="Location" hint={`Where the service is needed. Pin it, or describe it below. / ${FORM_TL.location}`} error={fieldErrors.location}>
        <LocationField value={location} onChange={setLocation} required />
      </Field>
```
```js
    if (location.latitude != null) {
      fd.append('latitude', String(location.latitude));
      fd.append('longitude', String(location.longitude));
    }
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
```

`String()`-wrap the coordinates: multipart carries no numbers, and the other mobile screens already do this.

- [ ] **Step 5: Add the field to the anonymous screen**

In `mobile/src/screens/AnonymousReportScreen.js`, add `address_details: ''` to the form state, then replace the location check in `validate()` at `:70`:

```js
    // A pin OR a landmark - see backend/src/validators/location.validators.js.
    const hasPin = location.latitude != null && location.longitude != null;
    if (!hasPin && !form.address_details.trim()) {
      e.location = 'Pin the location on the map, or describe the address and nearest landmark.';
    }
```

Replace the Location `Field` hint at `:216` and add the landmark field. This screen hand-rolls its chrome and does not import `FORM_TL`, so the hints are English-only:

```jsx
            <Field label="Location" hint="Pin where it happened, or describe it below" error={fieldErrors.location}>
              <LocationField value={location} onChange={setLocation} required />
            </Field>

            <Field label="Address or landmark" hint="Street, purok, or what it is next to" error={fieldErrors.address_details}>
              <TextInput
                style={styles.input}
                placeholder="e.g. Beside the covered court, Purok 3"
                placeholderTextColor={colors.placeholder}
                maxLength={255}
                value={form.address_details}
                onChangeText={set('address_details')}
              />
            </Field>
```

And the submit append:

```js
    if (form.address_details.trim()) fd.append('address_details', form.address_details.trim());
```

Confirm `TextInput` is imported from `react-native` and `styles.input` exists on this screen; if not, copy the `input` style from `ComplaintFormScreen`'s `StyleSheet`.

- [ ] **Step 6: Verify the bundle**

Run: `cd mobile && npx expo export --platform android`
Expected: clean. Note the module count; it should not drop.

Run: `cd mobile && npm test`
Expected: unchanged and green. Nothing in this task is testable (all five files are ESM/JSX), so a changed count means something unexpected.

- [ ] **Step 7: Verify imports and styles by reading the files back**

For each of the four screens, confirm every JSX tag rendered is imported, and that every `styles.*` key referenced exists. `WildlifeFormScreen` and `RequestFormScreen` gain `TextInput` usage — confirm `TextInput` is imported from `react-native` on each, and that `styles.input` is defined (the complaint screen has one; the others may not).

- [ ] **Step 8: Commit**

```bash
git status --short
git commit -m "Let a landmark stand in for a map pin on the phone" -- mobile/src/components/LocationField.js mobile/src/lib/tagalog.js mobile/src/screens/resident/ComplaintFormScreen.js mobile/src/screens/resident/WildlifeFormScreen.js mobile/src/screens/resident/RequestFormScreen.js mobile/src/screens/AnonymousReportScreen.js
```

---

## Task 7: Record that the location rule changed

**Files:**
- Modify: `docs/PRD-resident.md`
- Modify: `docs/PRD-staff-admin.md`
- Modify: `CLAUDE.md` (the Lessons Learned list)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

Its own commit, so the diff reads as a policy statement. The lesson in `CLAUDE.md` is that a reversed decision falsifies prose in files the change never otherwise touched, and that searching for the *claim* finds them where searching for the symbol finds none.

- [ ] **Step 1: Find every surviving claim**

```bash
cd "c:/Users/Penar/CenroWatch Project"
grep -rni "pin the location\|required: pin\|must pin\|location is optional\|never have coordinates\|barangay-level" docs/ web/src mobile/src backend/src | grep -v node_modules
```

Every hit is either already handled by Tasks 1–6 or belongs in this task. Work the list.

- [ ] **Step 2: Update the resident PRD**

State the rule in one place: a report needs a location, given as a map pin or as an address/landmark description, and the API refuses only the case with neither. Add that service requests now carry coordinates and an address, and that `address_details` is encrypted at rest.

- [ ] **Step 3: Update the staff/admin PRD**

Record that the walk-in form is no longer exempt from the location rule, and that the staff request detail page now shows a location.

- [ ] **Step 4: Append the lesson to `CLAUDE.md`**

Add to the Lessons Learned list, before `## Current Sprint`:

```markdown
- **`optional({ values: 'falsy' })` discards a legitimate `0`.** The pin-or-landmark
  rule needs to know whether a coordinate was SENT, and `latitude: 0` is both a
  real coordinate and falsy in JavaScript, so a truthiness test drops it — as
  does express-validator's `values: 'falsy'`, which would then skip the range
  check on a value the disjunction had already counted as absent. Multipart
  compounds it: an untouched field arrives as `''`, not as a missing key, which
  is why the original coordinates rule used `notEmpty` over `exists`. The
  presence test that survives both is
  `v !== undefined && v !== null && String(v).trim() !== ''`.
  Generally: when a rule asks "did the client send this?", answer it with
  presence, never with truthiness — the falsy values (`0`, `''`, `false`) are
  exactly the ones where the two disagree.
```

- [ ] **Step 5: Leave the dated specs alone**

Do **not** rewrite `docs/superpowers/specs/2026-09-30-wildlife-turnover-module-design.md` or any other dated design doc that describes the old rule. They are records of decisions as they were made; rewriting them hides that the policy changed. If one states the old rule as current, add a one-line `> **Superseded 2026-10-09 by [this plan's spec].**` note at the top and nothing else.

- [ ] **Step 6: Commit**

```bash
git status --short
git commit -m "Record that a report can give a landmark instead of a pin" -- docs/PRD-resident.md docs/PRD-staff-admin.md CLAUDE.md
```

---

## Deploy order

```
1.  Task 1        API      the shared rule          (clients still send pins; inert)
2.  Task 2        API      request location columns  (nothing posts them yet; inert)
    ── deploy API ──
3.  Tasks 3,4,5   web      all three, one deploy
4.  Task 6        MOBILE   one OTA
5.  Task 7        docs
```

**The API must precede the clients.** Both halves of this change are safe in that direction and unsafe in the other: a form that offers a landmark against the old API gets a 422 on a field it called optional, and a form that posts coordinates to a validator that does not accept them has them silently discarded by express-validator, which ignores unknown fields. An old client that always sends a complete pin keeps working against the new API throughout.

**Mobile cannot close synchronously.** An OTA lands at each phone's next launch, so between steps 3 and 4 installed builds still require a pin — which is the strictly safe direction, since the API accepts what they send.

## Done when

1. `cd backend && npm test` — green, including the rewritten `locationRequired.test.js` and the new `requestLocation.test.js`.
2. `cd web && npm run build` — clean; and the JSX identifier check passes on all six modified pages, since the build cannot catch that class of error.
3. `cd mobile && npx expo export --platform android && npm test` — clean.
4. On the **deployed** site (`cenrowatch-project.pages.dev`, accounts in memory — not localhost): a resident files a complaint with a landmark and no pin and it succeeds; files one with neither and is refused with the message on the location field rather than a bare "Validation failed."; files a service request with a pin and sees it on the staff detail page.
5. A walk-in logged by staff with only an address succeeds; one with neither is refused.
6. `grep -rn "requests never have coordinates\|location is optional when" web/src` prints nothing.
