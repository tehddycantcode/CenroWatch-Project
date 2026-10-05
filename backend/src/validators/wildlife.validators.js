const { body } = require('express-validator');

// Mirrors the AnimalCondition enum in schema.prisma.
const ANIMAL_CONDITIONS = ['Healthy', 'Injured', 'Sick', 'Dead'];

const createWildlifeRules = [
  body('barangay_id')
    .notEmpty().withMessage('Barangay is required.')
    .bail()
    .isInt({ min: 1 }).withMessage('barangay_id must be a valid id.')
    .toInt(),
  body('species_name')
    .trim()
    .notEmpty().withMessage('Species name is required.')
    .isLength({ max: 200 }).withMessage('Species name is too long.'),
  // ONLY a fallback for a species with no category of its own (the "Other"
  // sentinel). For every catalogued species the row wins and this is ignored -
  // see resolveSpecies. Kept deliberately LENIENT rather than .isIn(...): an
  // old web bundle still posts whatever the resident typed into the category
  // box it used to show, and 422ing that would break the live site for the
  // window between the API deploy and the web deploy. The service drops
  // anything that is not one of the three.
  body('species_category')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }),
  body('animal_condition')
    .trim()
    .notEmpty().withMessage('Animal condition is required.')
    .bail()
    .isIn(ANIMAL_CONDITIONS).withMessage('Invalid animal condition.'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required.')
    .bail()
    .isLength({ min: 10, max: 5000 }).withMessage('Description must be 10–5000 characters.'),
  // is_endangered IS NO LONGER ACCEPTED. It is derived from the species row,
  // because it drives public-map coordinate obfuscation and a reporter must not
  // decide whether a rescue site is hidden. There is no rule here on purpose:
  // express-validator ignores unknown fields, so an old client sending it is
  // silently ignored rather than refused. DO NOT "restore" this rule.
  // REQUIRED since 2026-09-29, same as complaints - see the note in
  // complaint.validators.js. Where an animal was found matters more here than
  // anywhere else: it is what the endangered-species obfuscation operates on,
  // and a turnover with no coordinates simply drops off the map.
  body('latitude')
    .notEmpty().withMessage('Pin the location on the map.')
    .bail()
    .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude.')
    .toFloat(),
  body('longitude')
    .notEmpty().withMessage('Pin the location on the map.')
    .bail()
    .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.')
    .toFloat(),
  body('address_details')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 255 }).withMessage('Address is too long.'),
];

module.exports = { createWildlifeRules, ANIMAL_CONDITIONS };
