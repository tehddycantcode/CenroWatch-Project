const asyncHandler = require('../utils/asyncHandler');
const analyticsService = require('../services/admin.analytics.service');
const userService = require('../services/admin.user.service');
const auditService = require('../services/admin.audit.service');
const settingsService = require('../services/admin.settings.service');

// Analytics
const analytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getAnalytics();
  res.json({ success: true, data: { analytics } });
});

// Users
const listUsers = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(req.query);
  res.json({ success: true, data: result });
});

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.user.user_id, req.body, { ipAddress: req.ip });
  res.status(201).json({ success: true, message: 'User created.', data: { user } });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'User updated.', data: { user } });
});

// Audit logs
const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditService.listAuditLogs(req.query);
  res.json({ success: true, data: result });
});

// Settings
const listSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.listSettings();
  res.json({ success: true, data: { settings } });
});

const updateSetting = asyncHandler(async (req, res) => {
  const setting = await settingsService.updateSetting(req.user.user_id, req.params.key, req.body.setting_value, { ipAddress: req.ip });
  res.json({ success: true, message: 'Setting updated.', data: { setting } });
});

module.exports = { analytics, listUsers, createUser, updateUser, listAuditLogs, listSettings, updateSetting };
