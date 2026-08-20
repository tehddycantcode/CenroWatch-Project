// express-validator chains for the auth endpoints.

const { body } = require('express-validator');

const registerRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('A valid email is required.')
    .normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Za-z]/).withMessage('Password must contain a letter.')
    .matches(/[0-9]/).withMessage('Password must contain a number.'),
  body('first_name')
    .trim()
    .notEmpty().withMessage('First name is required.')
    .isLength({ max: 100 }),
  body('last_name')
    .trim()
    .notEmpty().withMessage('Last name is required.')
    .isLength({ max: 100 }),
  body('contact_number')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 20 }).withMessage('Contact number is too long.'),
  body('barangay_id')
    .optional({ values: 'null' })
    .isInt({ min: 1 }).withMessage('barangay_id must be a valid id.')
    .toInt(),
  // R.A. 10173 — explicit consent is required to process personal data.
  // Accept a JSON boolean true or the strings 'true'/'1'.
  body('privacy_consent')
    .custom((v) => v === true || v === 'true' || v === 1 || v === '1')
    .withMessage('Privacy consent is required to register.')
    .bail()
    .customSanitizer(() => true),
];

const loginRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('A valid email is required.')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

const forgotPasswordRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('A valid email is required.')
    .normalizeEmail(),
];

const resetPasswordRules = [
  body('token').isString().trim().notEmpty().withMessage('Reset token is required.'),
  body('password')
    .isString()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Za-z]/).withMessage('Password must contain a letter.')
    .matches(/[0-9]/).withMessage('Password must contain a number.'),
];

const updateProfileRules = [
  body('first_name').optional().trim().notEmpty().withMessage('First name cannot be empty.').isLength({ max: 100 }),
  body('last_name').optional().trim().notEmpty().withMessage('Last name cannot be empty.').isLength({ max: 100 }),
  body('contact_number').optional({ values: 'falsy' }).trim().isLength({ max: 20 }).withMessage('Contact number is too long.'),
  body('barangay_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('barangay_id must be a valid id.').toInt(),
];

const changePasswordRules = [
  body('current_password').notEmpty().withMessage('Current password is required.'),
  body('new_password')
    .isString()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Za-z]/).withMessage('Password must contain a letter.')
    .matches(/[0-9]/).withMessage('Password must contain a number.'),
];

const verifyEmailRules = [
  body('code')
    .trim()
    .notEmpty().withMessage('Enter the code from your email.')
    .bail()
    .isLength({ min: 6, max: 6 }).withMessage('The code is 6 digits.')
    .isNumeric().withMessage('The code is 6 digits.'),
];

// Mirrors registerRules so the same address normalizes to the same string on
// both paths - otherwise a change could create an address that login cannot
// match.
const changeEmailRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('A valid email is required.')
    .normalizeEmail(),
];

module.exports = {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  updateProfileRules,
  changePasswordRules,
  verifyEmailRules,
  changeEmailRules,
};
