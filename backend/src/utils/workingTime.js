// Working-time arithmetic for Citizens Charter SLA deadlines.
//
// PURE by design: this module requires nothing, reads no configuration and
// touches no database, which is what lets its test suite run with zero mocks.
//
// WHAT A "WORKING DAY" MEANS HERE: the full 24 hours of Monday to Friday.
// Whole weekends are skipped; there is deliberately NO 08:00-17:00 window.
// The seeded complaint budget is 3365 minutes. Against a 24-hour day that is
// the documented 2d 8h 5m. Against an 8-hour day it becomes seven working days
// - roughly nine to eleven calendar days - which would silently triple what
// CENRO promises a resident on a deadline they can already see on the tracking
// page. Skipping weekends only ever moves a deadline LATER or leaves it alone,
// so it is a change no resident can be worse off for. Narrowing the day to
// office hours is not a bug fix, it is a renegotiation of the Charter, and it
// needs CENRO's sign-off rather than a code change. The window is a calendar
// parameter so that decision stays one constant away.
//
// TIMEZONE: fixed +08:00 arithmetic, never the host timezone. `new Date()` is
// an absolute instant, but getDay()/getHours() read wherever the process
// happens to be running - PHT on the dev box by accident, UTC in the container.
// Manila Saturday 05:00 is Friday 21:00Z, so a naive getDay() would count it as
// working time and start a clock two days early. The Philippines has had no DST
// since 1978, so a fixed offset is exact rather than an approximation.

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

// ~54 years of day-steps. Only reachable if a calendar defines no working time
// at all, which would otherwise spin forever.
const MAX_STEPS = 20_000;

const DEFAULT_CALENDAR = {
  offsetMinutes: 8 * 60, // Asia/Manila, no DST
  workingDays: [1, 2, 3, 4, 5], // 0 = Sunday
  dayStartMinute: 0,
  dayEndMinute: 1440, // exclusive; 1440 = the full 24h day
  holidays: new Set(), // 'YYYY-MM-DD' local dates; empty for now
};

// Shift an instant so the getUTC* accessors read Manila wall-clock fields, and
// back again. Everything between these two calls is local-field arithmetic.
const toLocal = (d, cal) => new Date(d.getTime() + cal.offsetMinutes * MIN_MS);
const fromLocal = (d, cal) => new Date(d.getTime() - cal.offsetMinutes * MIN_MS);

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (ld) => `${ld.getUTCFullYear()}-${pad(ld.getUTCMonth() + 1)}-${pad(ld.getUTCDate())}`;
const minuteOfDay = (ld) => ld.getUTCHours() * 60 + ld.getUTCMinutes();
const localMidnight = (ld) => new Date(Date.UTC(ld.getUTCFullYear(), ld.getUTCMonth(), ld.getUTCDate()));
const localAt = (ld, minute) => new Date(localMidnight(ld).getTime() + minute * MIN_MS);

function isWorkingDate(ld, cal) {
  return cal.workingDays.includes(ld.getUTCDay()) && !cal.holidays.has(dateKey(ld));
}

/** Is this instant inside working time? */
function isWorkingInstant(instant, cal = DEFAULT_CALENDAR) {
  const ld = toLocal(instant, cal);
  if (!isWorkingDate(ld, cal)) return false;
  const m = minuteOfDay(ld);
  return m >= cal.dayStartMinute && m < cal.dayEndMinute;
}

/**
 * The first working instant at or after `instant`. Identity if already inside
 * working time. A weekend or holiday start advances to the next working day's
 * opening instant - so every moment from Saturday 00:00 to Sunday 23:59
 * produces the same Monday start, and therefore the same deadline.
 */
function nextWorkingStart(instant, cal = DEFAULT_CALENDAR) {
  let ld = toLocal(instant, cal);
  for (let step = 0; ; step++) {
    if (step > MAX_STEPS) throw new Error('workingTime: calendar defines no working time');
    if (isWorkingDate(ld, cal)) {
      const m = minuteOfDay(ld);
      if (m < cal.dayStartMinute) return fromLocal(localAt(ld, cal.dayStartMinute), cal);
      if (m < cal.dayEndMinute) return fromLocal(ld, cal); // already working
    }
    ld = new Date(localMidnight(ld).getTime() + DAY_MS); // next local midnight
  }
}

/**
 * Add `minutes` of WORKING time to an instant.
 *
 * The budget is spent only while the clock is inside working time; weekends and
 * holidays are stepped over without consuming any of it.
 *
 * Exact-boundary rule: `remaining <= avail` means consuming the budget exactly
 * lands ON the boundary (Friday 24:00) rather than skipping to Monday. That
 * composes with computeExceededSla's strict `>`, so finishing precisely at the
 * deadline is not a breach. The alternative would hand a free 48 hours to
 * anyone whose budget happens to divide evenly into whole days.
 */
function addWorkingMinutes(startInstant, minutes, cal = DEFAULT_CALENDAR) {
  let cursor = nextWorkingStart(startInstant, cal);
  let remaining = Math.max(0, Number(minutes) || 0);
  if (remaining === 0) return cursor;

  for (let step = 0; ; step++) {
    if (step > MAX_STEPS) throw new Error('workingTime: calendar defines no working time');
    const endOfWindow = fromLocal(localAt(toLocal(cursor, cal), cal.dayEndMinute), cal);
    const avail = (endOfWindow.getTime() - cursor.getTime()) / MIN_MS;
    if (remaining <= avail) return new Date(cursor.getTime() + remaining * MIN_MS);
    remaining -= avail;
    cursor = nextWorkingStart(endOfWindow, cal);
  }
}

module.exports = { addWorkingMinutes, nextWorkingStart, isWorkingInstant, DEFAULT_CALENDAR };
