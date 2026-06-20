// Complaint business logic. Pattern: routes → controllers → services → prisma.
// Every mutation writes an AuditLog; SLA deadline is stamped at submission.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { formatTrackingId } = require('../utils/trackingId');
const { getSlaMinutes, addMinutes } = require('../utils/sla');

// Returned to the owner (their own report) — includes the barangay name.
const DETAIL_SELECT = {
  complaint_id: true,
  tracking_id: true,
  user_id: true,
  complaint_type: true,
  description: true,
  photo_path: true,
  latitude: true,
  longitude: true,
  address_details: true,
  status: true,
  priority: true,
  staff_notes: true,
  resolution_notes: true,
  submitted_at: true,
  updated_at: true,
  resolved_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  barangay_id: true,
  barangay: { select: { name: true } },
};

const LIST_SELECT = {
  complaint_id: true,
  tracking_id: true,
  complaint_type: true,
  status: true,
  priority: true,
  photo_path: true,
  submitted_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  barangay: { select: { name: true } },
};

async function createComplaint(userId, input, photoPath, ctx = {}) {
  const barangay = await prisma.barangay.findUnique({ where: { barangay_id: input.barangay_id } });
  if (!barangay) throw new HttpError(422, 'Selected barangay does not exist.');

  const submitted_at = new Date();
  const year = submitted_at.getFullYear();
  const slaMinutes = await getSlaMinutes('complaint_sla_minutes', 3365);
  const sla_deadline = addMinutes(submitted_at, slaMinutes);

  // Per-year sequential tracking id (CMP-YYYY-NNNNN) computed inside a
  // transaction; retry on the rare tracking_id collision under concurrency.
  let complaint;
  for (let attempt = 0; ; attempt++) {
    try {
      complaint = await prisma.$transaction(async (tx) => {
        const count = await tx.complaint.count({
          where: { tracking_id: { startsWith: `CMP-${year}-` } },
        });
        const tracking_id = formatTrackingId('complaint', count + 1, submitted_at);
        return tx.complaint.create({
          data: {
            tracking_id,
            user_id: userId,
            barangay_id: input.barangay_id,
            complaint_type: input.complaint_type,
            description: input.description,
            photo_path: photoPath || null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            address_details: input.address_details || null,
            submitted_at,
            sla_deadline,
          },
          select: DETAIL_SELECT,
        });
      });
      break;
    } catch (e) {
      if (e.code === 'P2002' && attempt < 4) continue; // tracking_id race — retry
      throw e;
    }
  }

  await writeAuditLog({
    performedBy: userId,
    action: 'COMPLAINT_CREATE',
    targetTable: 'Complaint',
    targetId: complaint.complaint_id,
    data: {
      tracking_id: complaint.tracking_id,
      complaint_type: complaint.complaint_type,
      barangay_id: input.barangay_id,
    },
    ipAddress: ctx.ipAddress || null,
  });

  return complaint;
}

function listMyComplaints(userId) {
  return prisma.complaint.findMany({
    where: { user_id: userId },
    orderBy: { submitted_at: 'desc' },
    select: LIST_SELECT,
  });
}

async function getMyComplaintByTracking(userId, trackingId) {
  const complaint = await prisma.complaint.findUnique({
    where: { tracking_id: trackingId },
    select: DETAIL_SELECT,
  });
  if (!complaint) throw new HttpError(404, 'Report not found.');
  if (complaint.user_id !== userId) throw new HttpError(403, 'You can only view your own reports.');
  return complaint;
}

module.exports = { createComplaint, listMyComplaints, getMyComplaintByTracking };
