// Date arithmetic for the in-app calendar picker.
//
// EVERYTHING HERE WORKS IN LOCAL TIME, DELIBERATELY. The tempting one-liner for
// formatting is `date.toISOString().slice(0, 10)`, and it is wrong for this app:
// toISOString formats in UTC, and Cabuyao is UTC+8, so for any local time before
// 08:00 it returns YESTERDAY. A resident filing at 7am would get a picker
// defaulting to the wrong day, with the wrong cell highlighted as today, and the
// complaint's observed date off by one. ComplaintFormScreen already carried a
// note about computing this locally; this module is where that now lives.
//
// ISO date strings (YYYY-MM-DD) sort lexicographically in the same order they
// sort chronologically, which is why min/max stay as strings the whole way
// through instead of being parsed back into Dates to compare.
//
// Pure, import-free, module.exports - same reason as pushDecision.js,
// backAction.js and otherCategory.js: it keeps the testable half within reach of
// a plain node jest with no babel step.

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar day of a Date as YYYY-MM-DD. '' for anything unusable. */
function toISODate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today, as the device's own calendar day. */
function todayISO() {
  return toISODate(new Date());
}

/** YYYY-MM-DD to a Date at LOCAL midnight. null for anything else. */
function parseISODate(iso) {
  if (typeof iso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  // Constructing from parts keeps it local. `new Date('2026-09-29')` would be
  // parsed as UTC midnight and shift backwards a day east of Greenwich.
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Step a {year, month} cursor, rolling the year over in either direction. */
function addMonths({ year, month }, delta) {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * Whole weeks (Sunday-first) covering the given month, padded with the
 * neighbouring months so every row has seven cells.
 * Each cell: { date, iso, day, inMonth }.
 */
function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks = [];
  const cursor = new Date(start);
  // Six rows covers every arrangement a month can take; trailing all-outside
  // rows are dropped below so a short month does not render a blank week.
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      week.push({
        date: new Date(cursor),
        iso: toISODate(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  while (weeks.length && weeks[weeks.length - 1].every((c) => !c.inMonth)) weeks.pop();
  return weeks;
}

/** Is this day outside the allowed range? Bounds are inclusive; null means open. */
function isOutOfRange(iso, min, max) {
  if (!iso) return false;
  if (min && iso < min) return true;
  if (max && iso > max) return true;
  return false;
}

module.exports = { toISODate, todayISO, parseISODate, addMonths, monthMatrix, isOutOfRange };
