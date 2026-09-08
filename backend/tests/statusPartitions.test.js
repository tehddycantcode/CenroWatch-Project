// Every status enum value must be accounted for as either OPEN or TERMINAL.
//
// These arrays drive the overdue queries: `status IN (...OPEN) AND
// sla_deadline < now`. A status missing from them does not error, it simply
// never matches - so every report in that state silently vanishes from the
// breach counts and the SLA compliance figures, and nothing anywhere says so.
//
// That is exactly what would have happened when 'Approved' was added to
// ComplaintStatus: it is the state where the clock is actually running, and
// omitting it from either COMPLAINT_OPEN would have under-reported breaches
// while every test still passed.
//
// This test is written against the SCHEMA rather than a hardcoded list, so it
// also fails for the NEXT status somebody adds, not just for Approved.

jest.mock('../src/utils/prisma', () => ({}));

const fs = require('fs');
const path = require('path');

const analytics = require('../src/services/admin.analytics.service');
const overview = require('../src/services/staff.overview.service');

function enumValues(name) {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const block = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(schema);
  expect(block).not.toBeNull();
  return block[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

const CASES = [
  ['ComplaintStatus', analytics.COMPLAINT_OPEN, analytics.COMPLAINT_TERMINAL],
  ['WildlifeStatus', analytics.WILDLIFE_OPEN, analytics.WILDLIFE_TERMINAL],
  ['RequestStatus', analytics.REQUEST_OPEN, analytics.REQUEST_TERMINAL],
];

describe('analytics status partitions cover the whole enum', () => {
  test.each(CASES)('%s', (enumName, open, terminal) => {
    const all = enumValues(enumName).toSorted();
    expect([...open, ...terminal].toSorted()).toEqual(all);
  });

  test.each(CASES)('%s open and terminal do not overlap', (_enumName, open, terminal) => {
    expect(open.filter((s) => terminal.includes(s))).toEqual([]);
  });
});

// The staff dashboard keeps its own copy of the OPEN arrays. They must agree
// with the analytics ones, or the two screens report different breach counts
// from the same data - which is worse than either being wrong alone.
describe('the staff overview partitions match the analytics ones', () => {
  test.each([
    ['complaints', overview.COMPLAINT_OPEN, analytics.COMPLAINT_OPEN],
    ['wildlife', overview.WILDLIFE_OPEN, analytics.WILDLIFE_OPEN],
    ['requests', overview.REQUEST_OPEN, analytics.REQUEST_OPEN],
  ])('%s', (_label, a, b) => {
    expect(a.toSorted()).toEqual(b.toSorted());
  });
});

// The API rejects any status not in this validator list, so a value present in
// the schema but missing here is a 422 on a legal transition.
describe('the staff validator accepts every schema status', () => {
  const validators = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'validators', 'staff.validators.js'),
    'utf8'
  );

  test.each([
    ['ComplaintStatus', 'COMPLAINT_STATUSES'],
    ['WildlifeStatus', 'WILDLIFE_STATUSES'],
    ['RequestStatus', 'REQUEST_STATUSES'],
  ])('%s', (enumName, constName) => {
    const declared = new RegExp(`const\\s+${constName}\\s*=\\s*\\[([^\\]]*)\\]`).exec(validators);
    expect(declared).not.toBeNull();
    const listed = [...declared[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).toSorted();
    expect(listed).toEqual(enumValues(enumName).toSorted());
  });
});
