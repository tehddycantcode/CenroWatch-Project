const { body } = require('express-validator');

const ROLES = ['Admin', 'CENRO_Staff', 'Resident'];

// Administrator accounts are never minted through the Users screen. Only the
// seeded/bootstrap admin holds that role; this endpoint can assign the other
// two. Existing Admin accounts keep working - the restriction is on assigning
// the role, not on holding it.
const ASSIGNABLE_ROLES = ['CENRO_Staff', 'Resident'];

const passwordRule = body('password')
  .isString().withMessage('Password is required.')
  .bail()
  .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
  .matches(/[A-Za-z]/).withMessage('Password must contain a letter.')
  .matches(/[0-9]/).withMessage('Password must contain a number.');

const createUserRules = [
  body('email').trim().notEmpty().withMessage('Email is required.').bail().isEmail().withMessage('Enter a valid email.').normalizeEmail(),
  passwordRule,
  body('first_name').trim().notEmpty().withMessage('First name is required.').isLength({ max: 100 }),
  body('last_name').trim().notEmpty().withMessage('Last name is required.').isLength({ max: 100 }),
  body('role').trim().notEmpty().withMessage('Role is required.').bail().isIn(ASSIGNABLE_ROLES).withMessage('Role must be CENRO Staff or Resident.'),
  body('contact_number').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
  body('barangay_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Invalid barangay.').toInt(),
];

const updateUserRules = [
  // Shape check only: any real role may arrive here, because a client may echo
  // an Admin target's unchanged role back while editing their name. The service
  // compares against the current role and enforces what may actually be
  // ASSIGNED, so a no-op role is accepted and a real promotion is refused.
  body('role').optional({ values: 'falsy' }).isIn(ROLES).withMessage('Invalid role.'),
  body('is_active').optional().isBoolean().withMessage('Invalid active flag.').toBoolean(),
  body('first_name').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('last_name').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  body('contact_number').optional({ values: 'null' }).trim().isLength({ max: 20 }),
  body('barangay_id').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('Invalid barangay.').toInt(),
];

const updateSettingRules = [
  body('setting_value').exists().withMessage('A value is required.').bail().trim().notEmpty().withMessage('Value cannot be empty.').isLength({ max: 2000 }),
];

module.exports = { createUserRules, updateUserRules, updateSettingRules, ROLES, ASSIGNABLE_ROLES };
