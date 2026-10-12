const { body } = require('express-validator');

// A date the office is being asked to ACT ON cannot already have happened.
//
// Shared by the resident's preferred_schedule and the staff scheduled_date so
// the two cannot drift. Deliberately NOT applied to observed_at, which records
// when someone SAW something and carries the opposite bound.
//
// Compared as YYYY-MM-DD STRINGS, deliberately, not as Date objects.
// A date-only string parses as UTC midnight, so any Date comparison makes this
// rule depend on the server's offset: it was lenient by up to 8 hours on a
// UTC+8 host and REJECTED TODAY on a host west of UTC. The question is only
// whether one calendar date precedes another, and ISO dates compare correctly
// as strings. Same-day scheduling is legitimate, so today itself passes.
function todayLocalISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function notPast(field, label) {
  return body(field)
    .optional({ values: 'falsy' })
    .isISO8601().withMessage(`${label} must be a valid date.`)
    .bail()
    .custom((v) => String(v).slice(0, 10) >= todayLocalISO())
    .withMessage(`${label} cannot be in the past.`)
    .toDate();
}

module.exports = { notPast, todayLocalISO };
