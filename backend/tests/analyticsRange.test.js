// Date logic for the customizable analytics range. These are pure functions and
// the cheapest part of the analytics service to get wrong: an off-by-one in the
// bucket list silently distorts the trend line rather than throwing.
//
// The service module pulls in the prisma client at require time, so it is mocked
// away here even though none of these functions touch the database.
jest.mock('../src/utils/prisma', () => ({}));

const {
  resolveRange,
  bucketKeys,
  bucketKey,
  granularityFor,
} = require('../src/services/admin.analytics.service');

const d = (s) => new Date(s); // local-time construction, matching the service

describe('granularityFor', () => {
  // Boundaries are asserted on BOTH sides. A one-day drift here changes a
  // 92-bucket daily chart into a 4-bucket monthly one with no error anywhere.
  test('<= 92 days reads per day', () => {
    expect(granularityFor(d('2026-01-01'), d('2026-04-03'))).toBe('day'); // 92
  });
  test('93 days switches to month', () => {
    expect(granularityFor(d('2026-01-01'), d('2026-04-04'))).toBe('month'); // 93
  });
  test('~3 years still reads per month', () => {
    expect(granularityFor(d('2023-01-01'), d('2026-01-01'))).toBe('month'); // 1096
  });
  test('beyond 3 years reads per year', () => {
    expect(granularityFor(d('2023-01-01'), d('2026-01-02'))).toBe('year'); // 1097
  });
});

describe('bucketKey', () => {
  const when = d('2026-03-07T13:45:00');
  test('day', () => expect(bucketKey(when, 'day')).toBe('2026-03-07'));
  test('month', () => expect(bucketKey(when, 'month')).toBe('2026-03'));
  test('year', () => expect(bucketKey(when, 'year')).toBe('2026'));
});

describe('bucketKeys', () => {
  test('daily list is contiguous and inclusive of both ends', () => {
    const keys = bucketKeys(d('2026-01-30'), d('2026-02-02T23:59:59'), 'day');
    expect(keys).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });

  // setMonth on the 31st is the classic JS date trap: naively stepping from
  // Jan 31 lands on Mar 3. The generator anchors to day 1 to avoid it.
  test('monthly stepping does not skip February', () => {
    const keys = bucketKeys(d('2026-01-31'), d('2026-04-15'), 'month');
    expect(keys).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });

  test('handles a leap day', () => {
    const keys = bucketKeys(d('2028-02-27'), d('2028-03-01T23:59:59'), 'day');
    expect(keys).toEqual(['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  });

  test('yearly stepping anchors to January', () => {
    expect(bucketKeys(d('2024-07-04'), d('2026-02-01'), 'year')).toEqual(['2024', '2025', '2026']);
  });

  test('a single day still yields one bucket, never zero', () => {
    expect(bucketKeys(d('2026-05-05'), d('2026-05-05T23:59:59'), 'day')).toEqual(['2026-05-05']);
  });
});

describe('resolveRange', () => {
  test('defaults to the 6-month preset', () => {
    expect(resolveRange({}).range).toBe('6m');
  });

  test('accepts every documented preset', () => {
    for (const r of ['1m', '3m', '6m', '1y', 'all']) {
      expect(resolveRange({ range: r }).range).toBe(r);
    }
  });

  test('"all" defers its lower bound to the caller', () => {
    // getAnalytics resolves this from the earliest row; a null here is the signal.
    expect(resolveRange({ range: 'all' }).from).toBeNull();
  });

  test('a custom range wins over a preset', () => {
    const r = resolveRange({ range: '1y', startDate: '2026-06-01', endDate: '2026-06-30' });
    expect(r.range).toBe('custom');
    expect(r.granularity).toBe('day');
  });

  test('the custom end date covers the whole final day', () => {
    // Filed at 4pm on the end date must still be inside the window.
    const r = resolveRange({ startDate: '2026-06-01', endDate: '2026-06-30' });
    expect(r.to.getHours()).toBe(23);
    expect(r.to.getDate()).toBe(30);
  });

  // A dashboard must not 500 because someone typed a bad date.
  test.each([
    ['unknown preset', { range: 'garbage' }],
    ['unparseable dates', { startDate: 'not-a-date', endDate: 'x' }],
    ['inverted range', { startDate: '2026-09-01', endDate: '2026-06-01' }],
    ['only a start date', { startDate: '2026-06-01' }],
  ])('falls back to the default on %s', (_label, filters) => {
    expect(resolveRange(filters).range).toBe('6m');
  });
});
