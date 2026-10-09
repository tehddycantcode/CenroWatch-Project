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
