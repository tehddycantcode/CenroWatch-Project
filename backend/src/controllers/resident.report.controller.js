// The resident's own copy of their own case, as a PDF.
//
// Goes through the RESIDENT services, not the staff ones, which is the whole
// safety property here: those services enforce ownership (403 when the row
// belongs to somebody else) and their DETAIL_SELECTs already withhold every
// staff identity and internal field. The document can therefore only contain
// what the tracking page already shows this person.
//
// An ANONYMOUS complaint has user_id = NULL and so has no owner. The service
// refuses it before this controller renders anything, which is correct: there
// is nobody to issue a copy to, and the public tracker deliberately returns
// status only.

const asyncHandler = require('../utils/asyncHandler');
const complaintService = require('../services/complaint.service');
const wildlifeService = require('../services/wildlife.service');
const requestService = require('../services/request.service');
const reportService = require('../services/staff.report.service');
const { writeAuditLog } = require('../utils/audit');

const KINDS = {
  complaint: {
    load: (ref, userId) => complaintService.getMyComplaintByTracking(userId, ref),
    ref: (r) => r.tracking_id,
    targetTable: 'Complaint',
    targetId: (r) => r.complaint_id,
    action: 'COMPLAINT_RESIDENT_COPY_EXPORT',
  },
  wildlife: {
    load: (ref, userId) => wildlifeService.getMyTurnoverByRef(userId, ref),
    ref: (r) => r.reference_id,
    targetTable: 'WildlifeTurnover',
    targetId: (r) => r.turnover_id,
    action: 'WILDLIFE_RESIDENT_COPY_EXPORT',
  },
  request: {
    load: (ref, userId) => requestService.getMyRequestByTracking(userId, ref),
    ref: (r) => r.tracking_id,
    targetTable: 'EnvironmentalRequest',
    targetId: (r) => r.request_id,
    action: 'REQUEST_RESIDENT_COPY_EXPORT',
  },
};

function exportCopy(kind) {
  const cfg = KINDS[kind];
  return asyncHandler(async (req, res) => {
    // The wildlife router names its param :referenceId and the other two
    // :trackingId - mounted on different routers, so one controller has to
    // accept either rather than the routers being renamed under their clients.
    const ref = req.params.trackingId || req.params.referenceId;
    const record = await cfg.load(ref, req.user.user_id);
    const reference = cfg.ref(record);
    const generatedAt = Date.now();

    // Logged like the staff export. A resident taking a copy of their own data
    // is not a disclosure, but the audit trail is what shows the document was
    // issued by the system rather than produced elsewhere.
    await writeAuditLog({
      performedBy: req.user.user_id,
      action: cfg.action,
      targetTable: cfg.targetTable,
      targetId: cfg.targetId(record),
      data: { reference, format: 'pdf' },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cenrowatch-${reference}.pdf"`);

    const doc = reportService.documentFor(kind, reference, 'resident');
    doc.pipe(res);
    // AWAITED. writeReport fetches the photos from storage while it writes, so
    // calling doc.end() without waiting truncates the document mid-attachment -
    // and the result still arrives as a .pdf download, just a corrupt one.
    await reportService.writeReport(doc, kind, record, {
      generatedAt,
      audience: 'resident',
      residentName: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || undefined,
    });
    doc.end();
  });
}

module.exports = {
  complaintCopy: exportCopy('complaint'),
  wildlifeCopy: exportCopy('wildlife'),
  requestCopy: exportCopy('request'),
};
