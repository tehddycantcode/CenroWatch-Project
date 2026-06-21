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

// User account management
router.get('/users', controller.listUsers);
router.post('/users', v.createUserRules, validate, controller.createUser);
router.patch('/users/:id', v.updateUserRules, validate, controller.updateUser);

// Audit-log viewer
router.get('/audit-logs', controller.listAuditLogs);

// System settings
router.get('/settings', controller.listSettings);
router.patch('/settings/:key', v.updateSettingRules, validate, controller.updateSetting);

module.exports = router;
