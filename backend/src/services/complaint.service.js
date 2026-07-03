// Complaint business logic. Pattern: routes → controllers → services → prisma.
// Every mutation writes an AuditLog; SLA deadline is stamped at submission.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { createSequential } = require('../utils/createSequential');
const { getSlaMinutes, addMinutes } = require('../utils/sla');

// Returned to the owner (their own report) — includes the barangay name.
const DETAIL_SELECT = {
  complaint_id: true,
  tracking_id: true,
  user_id: true,
  is_anonymous: true,
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
  observed_at: true,
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
  observed_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  barangay: { select: { name: true } },
};

// userId is null for anonymous/whistleblower reports (options.anonymous = true);
// no reporter identity is stored in that case.
async function createComplaint(userId, input, photoPath, ctx = {}, options = {}) {
  const isAnonymous = options.anonymous === true || userId == null;

  const barangay = await prisma.barangay.findUnique({ where: { barangay_id: input.barangay_id } });
  if (!barangay) throw new HttpError(422, 'Selected barangay does not exist.');

  const submitted_at = new Date();
  const year = submitted_at.getFullYear();
  const slaMinutes = await getSlaMinutes('complaint_sla_minutes', 3365);
  const sla_deadline = addMinutes(submitted_at, slaMinutes);

  const complaint = await createSequential({
    model: 'complaint',
    type: 'complaint',
    idField: 'tracking_id',
    year,
    data: {
      user_id: isAnonymous ? null : userId,
      is_anonymous: isAnonymous,
      barangay_id: input.barangay_id,
      complaint_type: input.complaint_type,
      description: input.description,
      photo_path: photoPath || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      address_details: input.address_details || null,
      submitted_at,
      observed_at: input.observed_at ?? null,
      sla_deadline,
    },
    select: DETAIL_SELECT,
  });

  await writeAuditLog({
    performedBy: isAnonymous ? null : userId,
    action: isAnonymous ? 'COMPLAINT_CREATE_ANONYMOUS' : 'COMPLAINT_CREATE',
    targetTable: 'Complaint',
    targetId: complaint.complaint_id,
    data: {
      tracking_id: complaint.tracking_id,
      complaint_type: complaint.complaint_type,
      barangay_id: input.barangay_id,
      anonymous: isAnonymous,
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

// PUBLIC status lookup by tracking id — zero personal data (R.A. 10173).
// Lets an anonymous reporter follow up using only their reference number.
async function getPublicComplaintStatus(trackingId) {
  const complaint = await prisma.complaint.findUnique({
    where: { tracking_id: trackingId },
    select: {
      tracking_id: true,
      complaint_type: true,
      status: true,
      submitted_at: true,
      observed_at: true,
      updated_at: true,
      resolved_at: true,
      barangay: { select: { name: true } },
    },
  });
  if (!complaint) throw new HttpError(404, 'No report found with that reference number.');
  return complaint;
}

module.exports = { createComplaint, listMyComplaints, getMyComplaintByTracking, getPublicComplaintStatus };
