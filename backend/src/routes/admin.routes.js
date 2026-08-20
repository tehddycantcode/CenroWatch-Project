// Admin routes — mounted at /api/v1/admin. Every endpoint requires an
// authenticated Admin. Covers the management dashboard analytics, user account
// management, the audit-log viewer, and tunable system settings.

const express = require('express');
const router = express.Router();

const authenticate = require('../middlewares/authenticate');
const authorize = require('../middlewares/authorize');
const validate = require('../middlewares/validate');
const v = require('../validators/admin.validators');
const controller = require('../controllers/admin.controller');

router.use(authenticate, authorize('Admin'));

// Analytics dashboard
router.get('/analytics', controller.analytics);
router.get('/analytics/report', controller.analyticsReport);

// User account management
router.get('/users', controller.listUsers);
router.post('/users', v.createUserRules, validate, controller.createUser);
router.patch('/users/:id', v.updateUserRules, validate, controller.updateUser);
// Vouch for an address CENRO confirmed off-system. No body, so no validator:
// the only transition this performs is null -> now(). See markEmailVerified.
router.patch('/users/:id/verify-email', controller.verifyUserEmail);

// Report archive (soft delete). Archived reports drop out of the queues,
// dashboards, analytics, public endpoints, and the resident's own list, but
// stay in the database so the record and its history survive.
router.get('/archive', controller.listArchived);
router.patch('/archive/:kind/:id', v.archiveReportRules, validate, controller.archiveReport);
router.patch('/archive/:kind/:id/restore', controller.restoreReport);

// Audit-log viewer
router.get('/audit-logs', controller.listAuditLogs);

// System settings
router.get('/settings', controller.listSettings);
router.patch('/settings/:key', v.updateSettingRules, validate, controller.updateSetting);

module.exports = router;
