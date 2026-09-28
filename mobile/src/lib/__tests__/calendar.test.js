const {
  toISODate,
  parseISODate,
  addMonths,
  monthMatrix,
  isOutOfRange,
} = require('../calendar');

describe('toISODate', () => {
  // THE BUG THIS EXISTS TO PREVENT. The obvious implementation is
  // date.toISOString().slice(0, 10), which formats in UTC. Cabuyao is UTC+8, so
  // for any local time before 08:00 that returns YESTERDAY - a resident filing
  // at 7am would see the picker default to the wrong day and the highlighted
  // "today" cell would be off by one. ComplaintFormScreen already carries a
  // comment about computing this locally; this is what holds it.
  //
  // Both times below are deliberate: 00:30 catches the shift for timezones AHEAD
  // of UTC (ours), 23:30 catches it for timezones BEHIND it, so the test is
  // meaningful wherever it runs.
  test('formats the LOCAL calendar day, not the UTC one', () => {
    expect(toISODate(new Date(2026, 8, 29, 0, 30))).toBe('2026-09-29');
    expect(toISODate(new Date(2026, 8, 29, 23, 30))).toBe('2026-09-29');
  });

  test('zero-pads month and day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('returns empty string for a missing or invalid date', () => {
    expect(toISODate(null)).toBe('');
    expect(toISODate(new Date('nonsense'))).toBe('');
  });
});

describe('parseISODate', () => {
  test('reads a date string as LOCAL midnight', () => {
    const d = parseISODate('2026-09-29');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(29);
  });

  // Round-tripping is what the picker does every time it opens.
  test('round-trips with toISODate', () => {
    expect(toISODate(parseISODate('2026-02-01'))).toBe('2026-02-01');
  });

  test('returns null for anything unusable', () => {
    expect(parseISODate('')).toBeNull();
    expect(parseISODate('29/09/2026')).toBeNull();
    expect(parseISODate(undefined)).toBeNull();
  });
});

describe('addMonths', () => {
  test('moves within a year', () => {
    expect(addMonths({ year: 2026, month: 8 }, 1)).toEqual({ year: 2026, month: 9 });
  });

  test('rolls over the year in both directions', () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('monthMatrix', () => {
  // September 2026 starts on a Tuesday and has 30 days - the month in the
  // screenshot being matched.
  const weeks = monthMatrix(2026, 8);

  test('returns whole weeks starting on Sunday', () => {
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0].date.getDay()).toBe(0);
  });

  test('pads the first week with the previous month', () => {
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][2].iso).toBe('2026-09-01');
    expect(weeks[0][2].inMonth).toBe(true);
  });

  test('covers every day of the month exactly once', () => {
    const inMonth = weeks.flat().filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0].iso).toBe('2026-09-01');
    expect(inMonth[29].iso).toBe('2026-09-30');
  });

  test('handles a month that starts on a Sunday without a blank first week', () => {
    // February 2026 starts on a Sunday.
    expect(monthMatrix(2026, 1)[0][0].iso).toBe('2026-02-01');
  });
});

describe('isOutOfRange', () => {
  // ISO dates compare correctly as plain strings, which is why min/max are kept
  // as strings all the way through rather than parsed back into Dates.
  test('rejects dates after max', () => {
    expect(isOutOfRange('2026-09-30', null, '2026-09-29')).toBe(true);
    expect(isOutOfRange('2026-09-29', null, '2026-09-29')).toBe(false);
  });

  test('rejects dates before min', () => {
    expect(isOutOfRange('2026-09-28', '2026-09-29', null)).toBe(true);
    expect(isOutOfRange('2026-09-29', '2026-09-29', null)).toBe(false);
  });

  test('allows anything when no bounds are given', () => {
    expect(isOutOfRange('1999-01-01', null, null)).toBe(false);
  });
});
