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

const shared = [
  body('scientific_name').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('local_name').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  optionalEnum('category', CATEGORY_VALUES, 'Category'),
  optionalEnum('biome', BIOME_VALUES, 'Biome'),
  optionalEnum('indicator', INDICATOR_VALUES, 'Indicator'),
  optionalEnum('hazard', HAZARD_VALUES, 'Hazard'),
  body('is_endangered').optional().isBoolean().toBoolean(),
  body('body_description').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
  body('handling_note').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
  body('sort_order').optional({ values: 'falsy' }).isInt({ min: 0, max: 9999 }).toInt(),
];

const createSpeciesRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('A species name is required.')
    .bail()
    .isLength({ max: 200 }).withMessage('Species name is too long.'),
  ...shared,
];

// `name` is absent on purpose - it is the foreign key reports store and is not
// editable. See the comment in species.service.updateSpecies.
const updateSpeciesRules = [
  ...shared,
  body('is_active').optional().isBoolean().toBoolean(),
];

module.exports = { createSpeciesRules, updateSpeciesRules };
