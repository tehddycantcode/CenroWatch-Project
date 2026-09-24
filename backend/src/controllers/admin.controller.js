const asyncHandler = require('../utils/asyncHandler');
const analyticsService = require('../services/admin.analytics.service');
const userService = require('../services/admin.user.service');
const auditService = require('../services/admin.audit.service');
const settingsService = require('../services/admin.settings.service');
const archiveService = require('../services/admin.archive.service');
const reportService = require('../services/admin.report.service');
const categoryService = require('../services/category.service');
const barangayService = require('../services/barangay.service');
const { writeAuditLog } = require('../utils/audit');

// Analytics
const analytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getAnalytics(req.query);
  res.json({ success: true, data: { analytics } });
});

// Analytics report as a downloadable PDF.
const analyticsReport = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getAnalytics(req.query);
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

const verifyUserEmail = asyncHandler(async (req, res) => {
  const user = await userService.markEmailVerified(req.user.user_id, req.params.id, { ipAddress: req.ip });
  res.json({ success: true, message: 'Email address confirmed.', data: { user } });
});

// Audit logs
const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditService.listAuditLogs(req.query);
  res.json({ success: true, data: result });
});

// Report archive (soft delete)
const listArchived = asyncHandler(async (req, res) => {
  const items = await archiveService.listArchived();
  res.json({ success: true, data: { items } });
});

const archiveReport = asyncHandler(async (req, res) => {
  const report = await archiveService.archiveReport(
    req.user.user_id, req.params.kind, req.params.id, req.body.reason, { ipAddress: req.ip }
  );
  res.json({ success: true, message: 'Report archived.', data: { report } });
});

const restoreReport = asyncHandler(async (req, res) => {
  const report = await archiveService.restoreReport(
    req.user.user_id, req.params.kind, req.params.id, { ipAddress: req.ip }
  );
  res.json({ success: true, message: 'Report restored.', data: { report } });
});

// Report categories and barangays - the lists an Admin can manage without a
// code change. See category.service / barangay.service.
const listCategories = asyncHandler(async (req, res) => {
  const categories = await categoryService.listAll();
  res.json({ success: true, data: categories });
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createType(req.params.kind, req.user.user_id, req.body, { ipAddress: req.ip });
  res.status(201).json({ success: true, message: 'Category created.', data: { category } });
});

const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateType(req.params.kind, req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Category updated.', data: { category } });
});

const listBarangays = asyncHandler(async (req, res) => {
  const barangays = await barangayService.listAllBarangays();
  res.json({ success: true, data: { barangays } });
});

const createBarangay = asyncHandler(async (req, res) => {
  const barangay = await barangayService.createBarangay(req.user.user_id, req.body, { ipAddress: req.ip });
  res.status(201).json({ success: true, message: 'Barangay created.', data: { barangay } });
});

const updateBarangay = asyncHandler(async (req, res) => {
  const barangay = await barangayService.updateBarangay(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Barangay updated.', data: { barangay } });
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

module.exports = {
  analytics, analyticsReport, listUsers, createUser, updateUser, verifyUserEmail,
  listArchived, archiveReport, restoreReport,
  listAuditLogs, listSettings, updateSetting,
  listCategories, createCategory, updateCategory,
  listBarangays, createBarangay, updateBarangay,
};
