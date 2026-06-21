const { body, query } = require('express-validator');

// Status enums — mirror schema.prisma.
const COMPLAINT_STATUSES = ['Pending', 'Under_Review', 'In_Progress', 'Resolved', 'Rejected'];
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
  wildlifeStatusRules,
  wildlifeUpdateRules,
  requestStatusRules,
  requestUpdateRules,
};
