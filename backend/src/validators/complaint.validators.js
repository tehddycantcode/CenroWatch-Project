const { body } = require('express-validator');
const { isSelectable } = require('../services/category.service');

// Complaint types used to be a hardcoded array here, mirroring a Prisma enum,
// and the two had to be kept in step by hand. They are admin-managed rows now,
// so the check is referential: does a category with this name exist, and is it
// still active? A retired category stays valid on the reports that already
// reference it but cannot be chosen for a new one.
const complaintTypeRule = body('complaint_type')
  .trim()
  .notEmpty().withMessage('Complaint type is required.')
  .bail()
  .custom(async (value) => {
    if (!(await isSelectable('complaint', value))) {
      throw new Error('Invalid complaint type.');
    }
    return true;
  });

// Fields arrive as multipart/form-data (alongside the optional photo), so
// numeric fields are sanitized from strings here.
const createComplaintRules = [
  body('barangay_id')
    .notEmpty().withMessage('Barangay is required.')
    .bail()
    .isInt({ min: 1 }).withMessage('barangay_id must be a valid id.')
    .toInt(),
  complaintTypeRule,
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required.')
    .bail()
    .isLength({ min: 10, max: 5000 }).withMessage('Description must be 10–5000 characters.'),
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
  // Optional resident-provided "date issue was observed". Sent as an ISO date
  // string; must not be in the future. Filing date is stamped separately.
  body('observed_at')
    .optional({ values: 'falsy' })
    .isISO8601().withMessage('Enter a valid observed date.')
    .bail()
    .custom((v) => new Date(v) <= new Date()).withMessage('The observed date cannot be in the future.')
    .toDate(),
];

// Anonymous submissions reuse the same fields but must explicitly acknowledge
// the privacy notice (consent). Multipart sends booleans as strings.
const createAnonymousComplaintRules = [
  ...createComplaintRules,
  body('consent')
    .custom((v) => v === true || v === 'true')
    .withMessage('You must acknowledge the privacy notice to submit an anonymous report.'),
];

module.exports = { createComplaintRules, createAnonymousComplaintRules, complaintTypeRule };
