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

// A reason is required: it is what the audit log carries as the justification
// for hiding a public record.
const archiveReportRules = [
  body('reason')
    .exists().withMessage('A reason is required.')
    .bail()
    .trim()
    .notEmpty().withMessage('A reason is required.')
    .isLength({ max: 255 }).withMessage('Reason must be 255 characters or fewer.'),
];

// The office coordinates are the one pair that may be blanked: an empty value is
// how an Admin switches the "distance from the office" line off again. Every
// other setting drives a calculation that has no sensible empty state - an empty
// SLA budget would silently stop producing deadlines - so they keep the
// not-empty rule. The range check on a non-empty coordinate lives in
// admin.settings.service.js, where the key is already being inspected.
const CLEARABLE_SETTINGS = ['cenro_office_lat', 'cenro_office_lng'];

const updateSettingRules = [
  body('setting_value')
    .exists().withMessage('A value is required.').bail()
    .trim()
    .custom((value, { req }) => {
      if (value === '' && !CLEARABLE_SETTINGS.includes(req.params.key)) {
        throw new Error('Value cannot be empty.');
      }
      return true;
    })
    .isLength({ max: 2000 }),
];

// Report categories (complaint types / request types). Shape only - uniqueness,
// the name format and the last-active-category guard are enforced in
// category.service, where the database can be consulted.
const createCategoryRules = [
  body('name').trim().notEmpty().withMessage('A name is required.').bail().isLength({ max: 100 }),
  body('label').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('sort_order').optional({ values: 'null' }).isInt({ min: 0, max: 9999 }).toInt(),
  body('sla_setting_key').optional({ values: 'null' }).trim().isLength({ max: 100 }),
  body('sla_fallback_minutes').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
];

// Deliberately no `name`: renaming a category is not offered. See updateType.
const updateCategoryRules = [
  body('label').optional({ values: 'null' }).trim().isLength({ max: 120 }),
  body('is_active').optional().isBoolean().withMessage('Invalid active flag.').toBoolean(),
  body('sort_order').optional({ values: 'null' }).isInt({ min: 0, max: 9999 }).toInt(),
  body('sla_setting_key').optional({ values: 'null' }).trim().isLength({ max: 100 }),
  body('sla_fallback_minutes').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
];

// Barangays. name is required on create; update may change coordinates or retire
// the barangay, but never its name - it is the unique key the seed upserts on.
const createBarangayRules = [
  body('name').trim().notEmpty().withMessage('A name is required.').bail().isLength({ max: 100 }),
  body('latitude').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }).toFloat(),
  body('longitude').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }).toFloat(),
];

const updateBarangayRules = [
  body('latitude').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }).toFloat(),
  body('longitude').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }).toFloat(),
  body('is_active').optional().isBoolean().withMessage('Invalid active flag.').toBoolean(),
];

module.exports = {
  createUserRules, updateUserRules, archiveReportRules, updateSettingRules,
  createCategoryRules, updateCategoryRules, createBarangayRules, updateBarangayRules,
  ROLES, ASSIGNABLE_ROLES,
};
