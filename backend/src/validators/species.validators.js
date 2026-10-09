// Admin species-catalogue validators.
//
// These are a FIRST pass only: species.service.js re-checks every enum, every
// boolean and the name itself. The duplication is deliberate and the division
// is the point - this layer gives a good per-field 422 to whoever is filling
// in a form, while the service guarantees the invariant for every caller,
// including one that never passes through a route at all.

const { body } = require('express-validator');
const {
  CATEGORY_VALUES, BIOME_VALUES, INDICATOR_VALUES, HAZARD_VALUES,
} = require('../services/species.service');

const optionalEnum = (field, values, label) =>
  body(field).optional({ values: 'falsy' }).trim().isIn(values)
    .withMessage(`${label} must be one of: ${values.join(', ')}.`);

// category is deliberately NOT in `shared`, unlike biome/indicator/hazard -
// see createSpeciesRules and updateSpeciesRules below, which each pin its own
// requiredness instead.
const shared = [
  body('scientific_name').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('local_name').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  optionalEnum('biome', BIOME_VALUES, 'Biome'),
  optionalEnum('indicator', INDICATOR_VALUES, 'Indicator'),
  optionalEnum('hazard', HAZARD_VALUES, 'Hazard'),
  body('is_endangered').optional().isBoolean().toBoolean(),
  body('body_description').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
  body('handling_note').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
  // Attribution for the reference photo. Optional on these two routes so a
  // typo can be corrected without re-uploading, but REQUIRED on the photo
  // upload itself - see setSpeciesPhoto, which explains why.
  body('photo_credit').optional({ values: 'falsy' }).trim().isLength({ max: 255 }),
  body('sort_order').optional({ values: 'falsy' }).isInt({ min: 0, max: 9999 }).toInt(),
];

const createSpeciesRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('A species name is required.')
    .bail()
    .isLength({ max: 200 }).withMessage('Species name is too long.'),
  // category is FUNCTIONAL, not descriptive: species.service.resolveSpecies
  // auto-assigns it onto every report filed against this species, and only
  // falls back to a client-sent category for a row whose OWN category is
  // null. A real species saved with no category would reopen exactly the
  // client-controlled path that auto-assignment exists to close - so, unlike
  // biome and indicator (purely descriptive: a missing one just renders a
  // thinner identification card), it is required at create time.
  body('category')
    .trim()
    .notEmpty().withMessage('Category is required.')
    .bail()
    .isIn(CATEGORY_VALUES).withMessage(`Category must be one of: ${CATEGORY_VALUES.join(', ')}.`),
  ...shared,
];

// `name` is absent on purpose - it is the foreign key reports store and is not
// editable. See the comment in species.service.updateSpecies.
//
// `category` IS present here and optional, unlike on create - an update sends
// only the fields that changed, so making it mandatory would break every edit
// that does not touch category (e.g. fixing a typo in handling_note). A row
// may legitimately have no category - the seeded `Other` sentinel is the
// standing example, and this route is exactly how an Admin reaches it.
const updateSpeciesRules = [
  optionalEnum('category', CATEGORY_VALUES, 'Category'),
  ...shared,
  body('is_active').optional().isBoolean().toBoolean(),
];

module.exports = { createSpeciesRules, updateSpeciesRules };
