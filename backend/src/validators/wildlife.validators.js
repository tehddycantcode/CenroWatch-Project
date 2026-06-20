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
  // Resident may flag a suspected endangered/protected species -> priority review.
  body('is_endangered')
    .optional()
    .customSanitizer((v) => v === true || v === 'true' || v === '1' || v === 1),
  body('latitude')
    .optional({ values: 'falsy' })
    .isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude.')
    .toFloat(),
  body('longitude')
    .optional({ values: 'falsy' })
    .isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.')
    .toFloat(),
  body('address_details')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 255 }).withMessage('Address is too long.'),
];

module.exports = { createWildlifeRules, ANIMAL_CONDITIONS };
