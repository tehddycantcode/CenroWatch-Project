// Printable PDF of a single report, for the hardcopy files CENRO keeps.
// Mirrors the admin analytics report pipeline: audit the export, set the PDF
// headers, then pipe a pdfkit document straight to the response.

const asyncHandler = require('../utils/asyncHandler');
const complaintService = require('../services/staff.complaint.service');
const wildlifeService = require('../services/staff.wildlife.service');
const requestService = require('../services/staff.request.service');
const reportService = require('../services/staff.report.service');
const { writeAuditLog } = require('../utils/audit');

const KINDS = {
  complaint: {
    load: (id) => complaintService.getComplaint(id),
    ref: (r) => r.tracking_id,
    targetTable: 'Complaint',
    targetId: (r) => r.complaint_id,
    action: 'COMPLAINT_REPORT_EXPORT',
  },
  wildlife: {
    load: (id) => wildlifeService.getTurnover(id),
    ref: (r) => r.reference_id,
    targetTable: 'WildlifeTurnover',
    targetId: (r) => r.turnover_id,
    action: 'WILDLIFE_REPORT_EXPORT',
  },
  request: {
    load: (id) => requestService.getRequest(id),
    ref: (r) => r.tracking_id,
    targetTable: 'EnvironmentalRequest',
    targetId: (r) => r.request_id,
    action: 'REQUEST_REPORT_EXPORT',
  },
};

// The document carries reporter contact details, so every export is logged:
// the audit trail names who took a copy of a resident's data off the system.
function exportReport(kind) {
  const cfg = KINDS[kind];
  return asyncHandler(async (req, res) => {
    const record = await cfg.load(req.params.id);
    const ref = cfg.ref(record);
    const generatedAt = Date.now();

    await writeAuditLog({
      performedBy: req.user.user_id,
      action: cfg.action,
      targetTable: cfg.targetTable,
      targetId: cfg.targetId(record),
      data: { reference: ref, format: 'pdf' },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cenrowatch-${ref}.pdf"`);

    const doc = reportService.documentFor(kind, ref);
    doc.pipe(res);
    reportService.writeReport(doc, kind, record, {
      generatedAt,
      by: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || undefined,
    });
    doc.end();
  });
}

module.exports = {
  complaintReport: exportReport('complaint'),
  wildlifeReport: exportReport('wildlife'),
  requestReport: exportReport('request'),
};
