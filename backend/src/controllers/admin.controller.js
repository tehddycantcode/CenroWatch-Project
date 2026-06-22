const asyncHandler = require('../utils/asyncHandler');
const analyticsService = require('../services/admin.analytics.service');
const userService = require('../services/admin.user.service');
const auditService = require('../services/admin.audit.service');
const settingsService = require('../services/admin.settings.service');
const reportService = require('../services/admin.report.service');
const { writeAuditLog } = require('../utils/audit');

// Analytics
const analytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getAnalytics();
  res.json({ success: true, data: { analytics } });
});

// Analytics report as a downloadable PDF.
const analyticsReport = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getAnalytics();
  const generatedAt = Date.now();

  await writeAuditLog({
    performedBy: req.user.user_id,
    action: 'ANALYTICS_REPORT_EXPORT',
    targetTable: 'Analytics',
    data: { format: 'pdf', total_reports: analytics.reports.total },
    ipAddress: req.ip,
  });

  const filename = `cenrowatch-analytics-${new Date(generatedAt).toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = reportService.createReportDocument();
  doc.pipe(res);
  reportService.writeAnalyticsReport(doc, analytics, {
    generatedAt,
    by: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || undefined,
  });
  doc.end();
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

module.exports = { analytics, analyticsReport, listUsers, createUser, updateUser, listAuditLogs, listSettings, updateSetting };
