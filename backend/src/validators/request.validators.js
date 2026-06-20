const { body } = require('express-validator');

// Mirrors the RequestType enum in schema.prisma.
const REQUEST_TYPES = [
  'Garbage_Hauling',
  'Creek_River_Cleaning',
  'Seedling_Distribution',
  'Environmental_Education',
  'Other_Service',
];

const createRequestRules = [
  body('barangay_id')
    .notEmpty().withMessage('Barangay is required.')
    .bail()
    .isInt({ min: 1 }).withMessage('barangay_id must be a valid id.')
    .toInt(),
  body('request_type')
    .trim()
    .notEmpty().withMessage('Request type is required.')
    .bail()
    .isIn(REQUEST_TYPES).withMessage('Invalid request type.'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required.')
    .bail()
    .isLength({ min: 10, max: 5000 }).withMessage('Description must be 10–5000 characters.'),
  body('requested_quantity')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100000 }).withMessage('Quantity must be a positive number.')
    .toInt(),
  body('preferred_schedule')
    .optional({ values: 'falsy' })
    .isISO8601().withMessage('Preferred schedule must be a valid date.')
    .toDate(),
];

module.exports = { createRequestRules, REQUEST_TYPES };
