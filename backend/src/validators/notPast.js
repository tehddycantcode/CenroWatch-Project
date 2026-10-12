const { body } = require('express-validator');

// A date the office is being asked to ACT ON cannot already have happened.
//
// Shared by the resident's preferred_schedule and the staff scheduled_date so
// the two cannot drift. Deliberately NOT applied to observed_at, which records
// when someone SAW something and carries the opposite bound.
//
// Compared at DAY granularity, not by timestamp: `new Date('2026-10-12')` parses
// as midnight UTC, so a plain `< new Date()` comparison would reject TODAY for
// most of the day. Same-day scheduling is legitimate, so the floor is the start
// of today in the server's own timezone.
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function notPast(field, label) {
  return body(field)
    .optional({ values: 'falsy' })
    .isISO8601().withMessage(`${label} must be a valid date.`)
    .bail()
    .custom((v) => new Date(v) >= startOfToday())
    .withMessage(`${label} cannot be in the past.`)
    .toDate();
}

module.exports = { notPast, startOfToday };
