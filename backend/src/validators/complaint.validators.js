const { body } = require('express-validator');

// Mirrors the ComplaintType enum in schema.prisma.
const COMPLAINT_TYPES = [
  'Illegal_Dumping',
  'Open_Burning',
  'Noise_Disturbance',
  'Improper_Hazardous_Waste_Storage',
  'Drainage_Blockage',
  'Air_Pollution',
  'Water_Pollution',
  'Other',
];

// Fields arrive as multipart/form-data (alongside the optional photo), so
// numeric fields are sanitized from strings here.
const createComplaintRules = [
  body('barangay_id')
    .notEmpty().withMessage('Barangay is required.')
    .bail()
    .isInt({ min: 1 }).withMessage('barangay_id must be a valid id.')
    .toInt(),
  body('complaint_type')
    .trim()
    .notEmpty().withMessage('Complaint type is required.')
    .bail()
    .isIn(COMPLAINT_TYPES).withMessage('Invalid complaint type.'),
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
];

// Anonymous submissions reuse the same fields but must explicitly acknowledge
// the privacy notice (consent). Multipart sends booleans as strings.
const createAnonymousComplaintRules = [
  ...createComplaintRules,
  body('consent')
    .custom((v) => v === true || v === 'true')
    .withMessage('You must acknowledge the privacy notice to submit an anonymous report.'),
];

module.exports = { createComplaintRules, createAnonymousComplaintRules, COMPLAINT_TYPES };
