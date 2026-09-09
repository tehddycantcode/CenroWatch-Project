const { body } = require('express-validator');
const { isSelectable } = require('../services/category.service');

// Referential, not a hardcoded list - see the note in complaint.validators.js.
const requestTypeRule = body('request_type')
  .trim()
  .notEmpty().withMessage('Request type is required.')
  .bail()
  .custom(async (value) => {
    if (!(await isSelectable('request', value))) {
      throw new Error('Invalid request type.');
    }
    return true;
  });

const createRequestRules = [
  body('barangay_id')
    .notEmpty().withMessage('Barangay is required.')
    .bail()
    .isInt({ min: 1 }).withMessage('barangay_id must be a valid id.')
    .toInt(),
  requestTypeRule,
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

module.exports = { createRequestRules, requestTypeRule };
