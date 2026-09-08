// Working-time arithmetic for Citizens Charter SLA deadlines.
//
// This module is PURE - it requires nothing, touches no database - so this
// suite needs no mocks at all. Every fixture carries an explicit +08:00 offset
// so the assertions hold no matter what timezone the test runner is in. That
// is not decoration: reading the host timezone is the single most likely defect
// in this feature (the dev box is PHT by accident, the container is UTC), and
// the cases below are what catch it.

const {
  addWorkingMinutes,
  nextWorkingStart,
  isWorkingInstant,
  DEFAULT_CALENDAR,
} = require('../src/utils/workingTime');

// 2026-09-07 Mon | 09-11 Fri | 09-12 Sat | 09-13 Sun | 09-14 Mon | 09-16 Wed | 09-21 Mon
const ph = (s) => new Date(`${s}+08:00`);
const COMPLAINT_SLA = 3365; // the seeded Citizens Charter budget, in minutes

// Compare instants, not object identity or local rendering.
const at = (result, expected) => expect(result.toISOString()).toBe(ph(expected).toISOString());

describe('addWorkingMinutes', () => {
  test('a span with no weekend in it matches plain wall-clock addition', () => {
    at(addWorkingMinutes(ph('2026-09-07T09:00'), COMPLAINT_SLA), '2026-09-09T17:05');
  });

  test('a Friday evening start skips the weekend', () => {
    // Wall clock would say Mon 02:05; the weekend pushes it to Wednesday.
    at(addWorkingMinutes(ph('2026-09-11T18:00'), COMPLAINT_SLA), '2026-09-16T02:05');
  });

  test('a Saturday start begins counting Monday 00:00', () => {
    at(addWorkingMinutes(ph('2026-09-12T10:00'), COMPLAINT_SLA), '2026-09-16T08:05');
  });

  // Everything inside the weekend normalizes to the same Monday instant, so it
  // must produce byte-identical deadlines. Filing at 00:01 Saturday and 23:59
  // Sunday are the same promise.
  test('every instant in a weekend yields the identical deadline', () => {
    const results = ['2026-09-12T00:00', '2026-09-12T10:00', '2026-09-13T23:59']
      .map((s) => addWorkingMinutes(ph(s), COMPLAINT_SLA).toISOString());
    expect(new Set(results).size).toBe(1);
  });

  test('a span long enough to cross two weekends skips both', () => {
    // 8 working days. Wall clock would land on Thu 09-17.
    at(addWorkingMinutes(ph('2026-09-09T09:00'), 8 * 1440), '2026-09-21T09:00');
  });

  describe('the exact-boundary rule', () => {
    // Consuming the budget EXACTLY lands on the boundary instant rather than
    // skipping to Monday. computeExceededSla uses a strict >, so landing on the
    // deadline is not a breach - the two rules compose. Pushing to Monday here
    // would hand 48 free hours to anyone whose budget divides evenly.
    test('exactly one working day ends at the boundary, not the next Monday', () => {
      at(addWorkingMinutes(ph('2026-09-11T00:00'), 1440), '2026-09-12T00:00');
    });

    test('one minute past the boundary jumps the whole weekend', () => {
      at(addWorkingMinutes(ph('2026-09-11T00:00'), 1441), '2026-09-14T00:01');
    });

    test('one minute short stays on Friday', () => {
      at(addWorkingMinutes(ph('2026-09-11T00:00'), 1439), '2026-09-11T23:59');
    });
  });

  test('a zero budget returns the start, normalized into working time', () => {
    at(addWorkingMinutes(ph('2026-09-07T09:00'), 0), '2026-09-07T09:00');
    at(addWorkingMinutes(ph('2026-09-12T10:00'), 0), '2026-09-14T00:00');
  });

  // The property that licenses the backfill: working-time addition can only
  // ever move a deadline LATER than wall-clock addition, never earlier. So no
  // report that was on time can be made retroactively late by this change.
  test('is monotone - never earlier than plain wall-clock addition', () => {
    for (const start of ['2026-09-07T09:00', '2026-09-11T18:00', '2026-09-12T10:00', '2026-09-13T23:59']) {
      for (const mins of [0, 60, 1439, 1440, 1441, COMPLAINT_SLA, 11520]) {
        const working = addWorkingMinutes(ph(start), mins).getTime();
        const wall = ph(start).getTime() + mins * 60_000;
        expect(working).toBeGreaterThanOrEqual(wall);
      }
    }
  });

  test('throws rather than hanging when the calendar has no working days', () => {
    const dead = { ...DEFAULT_CALENDAR, workingDays: [] };
    expect(() => addWorkingMinutes(ph('2026-09-07T09:00'), 60, dead)).toThrow(/working/i);
  });
});

describe('timezone independence', () => {
  // Manila Saturday 05:00 is Friday 21:00 UTC. A naive getDay() on the server
  // would call this a working Friday and start the clock two days early.
  test('a Manila Saturday is non-working even though it is Friday in UTC', () => {
    const instant = ph('2026-09-12T05:00');
    expect(instant.getUTCDay()).toBe(5); // Friday, in UTC
    expect(isWorkingInstant(instant)).toBe(false); // Saturday, in Manila
  });

  // Manila Monday 07:00 is Sunday 23:00 UTC - the same bug in the other
  // direction, which would refuse to start a clock that should be running.
  test('a Manila Monday is working even though it is Sunday in UTC', () => {
    const instant = ph('2026-09-14T07:00');
    expect(instant.getUTCDay()).toBe(0); // Sunday, in UTC
    expect(isWorkingInstant(instant)).toBe(true); // Monday, in Manila
  });

  test.each(['UTC', 'America/New_York', 'Asia/Manila'])(
    'the result does not move when the runner is in %s',
    (tz) => {
      const original = process.env.TZ;
      try {
        process.env.TZ = tz;
        at(addWorkingMinutes(ph('2026-09-12T10:00'), COMPLAINT_SLA), '2026-09-16T08:05');
      } finally {
        process.env.TZ = original;
      }
    }
  );
});

describe('nextWorkingStart', () => {
  test('leaves an instant already in working time untouched', () => {
    at(nextWorkingStart(ph('2026-09-07T09:00')), '2026-09-07T09:00');
  });

  test('advances a weekend instant to Monday midnight', () => {
    at(nextWorkingStart(ph('2026-09-12T10:00')), '2026-09-14T00:00');
    at(nextWorkingStart(ph('2026-09-13T23:59')), '2026-09-14T00:00');
  });
});

describe('holiday support', () => {
  // Holidays are deferred as a feature but the hook must exist, or adding the
  // table later means touching every call site instead of loadCalendar().
  const withHoliday = { ...DEFAULT_CALENDAR, holidays: new Set(['2026-09-14']) };

  test('a holiday is skipped exactly like a weekend day', () => {
    at(addWorkingMinutes(ph('2026-09-12T10:00'), COMPLAINT_SLA, withHoliday), '2026-09-17T08:05');
  });

  test('a holiday instant is not working time', () => {
    expect(isWorkingInstant(ph('2026-09-14T09:00'), withHoliday)).toBe(false);
    expect(isWorkingInstant(ph('2026-09-14T09:00'))).toBe(true); // same instant, default calendar
  });
});
