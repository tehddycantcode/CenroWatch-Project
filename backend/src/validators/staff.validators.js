const { body, query } = require('express-validator');
const { COMPLAINT_TYPES } = require('./complaint.validators');

// Status enums — mirror schema.prisma.
const COMPLAINT_STATUSES = ['Pending', 'Under_Review', 'Approved', 'In_Progress', 'Resolved', 'Rejected'];
// Citizens Charter intake channels (ComplaintReceivedVia in schema.prisma).
const RECEIVED_VIA = ['Walk_In', 'Email', 'Phone_Call', 'Facebook_Messenger', 'Logbook_Record'];
const WILDLIFE_STATUSES = ['Pending_Review', 'Priority_Review', 'Under_Care', 'Released', 'Transferred', 'Deceased'];
const REQUEST_STATUSES = ['Pending', 'Approved', 'Scheduled', 'Completed', 'Rejected'];

const noteRule = body('note')
  .optional({ values: 'falsy' })
  .trim()
  .isLength({ max: 2000 })
  .withMessage('Note is too long.');

// ── List/queue filters (shared across resources) ──────────────────────────
const listQueryRules = [
  query('status').optional({ values: 'falsy' }).trim(),
  query('barangay_id').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('Invalid barangay.').toInt(),
  query('priority').optional({ values: 'falsy' }).isBoolean().withMessage('Invalid priority.').toBoolean(),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }).toInt(),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }).toInt(),
];

// ── Complaint ─────────────────────────────────────────────────────────────
const complaintStatusRules = [
  body('status').trim().notEmpty().withMessage('Status is required.').bail().isIn(COMPLAINT_STATUSES).withMessage('Invalid status.'),
  noteRule,
  body('resolution_notes').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
];

const complaintUpdateRules = [
  body('assigned_to').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('Invalid staff id.').toInt(),
  body('priority').optional().isBoolean().withMessage('Invalid priority.').toBoolean(),
  body('staff_notes').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
  body('resolution_notes').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
];

// Staff logging a walk-in complaint on behalf of a resident at the office.
// Photo is optional here (the resident may only describe the concern verbally).
const createWalkInComplaintRules = [
  body('complaint_type').trim().notEmpty().withMessage('Complaint type is required.').bail().isIn(COMPLAINT_TYPES).withMessage('Invalid complaint type.'),
  body('barangay_id').notEmpty().withMessage('Barangay is required.').bail().isInt({ min: 1 }).withMessage('barangay_id must be a valid id.').toInt(),
  body('description').trim().notEmpty().withMessage('Description is required.').bail().isLength({ min: 10, max: 5000 }).withMessage('Description must be 10-5000 characters.'),
  body('received_via').optional({ values: 'falsy' }).isIn(RECEIVED_VIA).withMessage('Invalid intake channel.'),
  body('is_anonymous').optional().isBoolean().withMessage('Invalid anonymous flag.').toBoolean(),
  body('reporter_name').optional({ values: 'falsy' }).trim().isLength({ max: 120 }).withMessage('Reporter name is too long.'),
  body('reporter_contact').optional({ values: 'falsy' }).trim().isLength({ max: 120 }).withMessage('Reporter contact is too long.'),
  body('observed_at')
    .optional({ values: 'falsy' })
    .isISO8601().withMessage('Enter a valid observed date.')
    .bail()
    .custom((v) => new Date(v) <= new Date()).withMessage('The observed date cannot be in the future.')
    .toDate(),
  body('latitude').optional({ values: 'falsy' }).isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude.').toFloat(),
  body('longitude').optional({ values: 'falsy' }).isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude.').toFloat(),
  body('address_details').optional({ values: 'falsy' }).trim().isLength({ max: 255 }).withMessage('Address is too long.'),
];

// ── Wildlife ──────────────────────────────────────────────────────────────
const wildlifeStatusRules = [
  body('status').trim().notEmpty().withMessage('Status is required.').bail().isIn(WILDLIFE_STATUSES).withMessage('Invalid status.'),
  noteRule,
  body('transfer_destination').optional({ values: 'falsy' }).trim().isLength({ max: 255 }),
];

const wildlifeUpdateRules = [
  body('staff_notes').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
  body('transfer_destination').optional({ values: 'falsy' }).trim().isLength({ max: 255 }),
];

// ── Request ───────────────────────────────────────────────────────────────
const requestStatusRules = [
  body('status').trim().notEmpty().withMessage('Status is required.').bail().isIn(REQUEST_STATUSES).withMessage('Invalid status.'),
  noteRule,
  body('scheduled_date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid scheduled date.').toDate(),
];

const requestUpdateRules = [
  body('staff_notes').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
  body('scheduled_date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid scheduled date.').toDate(),
];

module.exports = {
  COMPLAINT_STATUSES,
  WILDLIFE_STATUSES,
  REQUEST_STATUSES,
  listQueryRules,
  complaintStatusRules,
  complaintUpdateRules,
  createWalkInComplaintRules,
  wildlifeStatusRules,
  wildlifeUpdateRules,
  requestStatusRules,
  requestUpdateRules,
};
