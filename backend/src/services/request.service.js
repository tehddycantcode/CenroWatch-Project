// Environmental service request logic. Pattern: routes → controllers → services → prisma.
// Only some request types have a Citizens Charter SLA (seedling, env education).

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { createSequential } = require('../utils/createSequential');
const { getSlaMinutes, addMinutes } = require('../utils/sla');
const { withActive } = require('../utils/archive');

// request_type -> SLA setting key + sane fallback (minutes).
const SLA_BY_TYPE = {
  Seedling_Distribution: { key: 'request_seedling_sla_minutes', fallback: 25 },
  Environmental_Education: { key: 'request_env_education_sla_minutes', fallback: 187 },
};

const DETAIL_SELECT = {
  request_id: true,
  tracking_id: true,
  user_id: true,
  request_type: true,
  description: true,
  document_path: true,
  requested_quantity: true,
  preferred_schedule: true,
  status: true,
  scheduled_date: true,
  completion_date: true,
  staff_notes: true,
  submitted_at: true,
  updated_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  barangay_id: true,
  barangay: { select: { name: true } },
  // Progress updates the resident is allowed to see. Deliberately omits
  // changed_by (and any staff relation) so no staff identity leaks.
  status_history: {
    orderBy: { changed_at: 'desc' },
    select: { new_status: true, note: true, changed_at: true },
  },
};

const LIST_SELECT = {
  request_id: true,
  tracking_id: true,
  request_type: true,
  status: true,
  requested_quantity: true,
  preferred_schedule: true,
  submitted_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  barangay: { select: { name: true } },
};

async function createRequest(userId, input, documentPath, ctx = {}) {
  const barangay = await prisma.barangay.findUnique({ where: { barangay_id: input.barangay_id } });
  if (!barangay) throw new HttpError(422, 'Selected barangay does not exist.');

  const submitted_at = new Date();
  const year = submitted_at.getFullYear();

  // SLA only applies to certain request types.
  let sla_deadline = null;
  const sla = SLA_BY_TYPE[input.request_type];
  if (sla) {
    const minutes = await getSlaMinutes(sla.key, sla.fallback);
    sla_deadline = addMinutes(submitted_at, minutes);
  }

  const request = await createSequential({
    model: 'environmentalRequest',
    type: 'request',
    idField: 'tracking_id',
    year,
    data: {
      user_id: userId,
      barangay_id: input.barangay_id,
      request_type: input.request_type,
      description: input.description,
      document_path: documentPath || null,
      requested_quantity: input.requested_quantity ?? null,
      preferred_schedule: input.preferred_schedule ?? null,
      submitted_at,
      sla_deadline,
    },
    select: DETAIL_SELECT,
  });

  await writeAuditLog({
    performedBy: userId,
    action: 'REQUEST_CREATE',
    targetTable: 'EnvironmentalRequest',
    targetId: request.request_id,
    data: { tracking_id: request.tracking_id, request_type: request.request_type },
    ipAddress: ctx.ipAddress || null,
  });

  return request;
}

function listMyRequests(userId) {
  return prisma.environmentalRequest.findMany({
    where: withActive({ user_id: userId }),
    orderBy: { submitted_at: 'desc' },
    select: LIST_SELECT,
  });
}

async function getMyRequestByTracking(userId, trackingId) {
  const request = await prisma.environmentalRequest.findUnique({
    where: { tracking_id: trackingId },
    select: { ...DETAIL_SELECT, archived_at: true },
  });
  // Archived reads as missing to its owner (see complaint.service).
  if (!request || request.archived_at) throw new HttpError(404, 'Request not found.');
  if (request.user_id !== userId) throw new HttpError(403, 'You can only view your own requests.');
  delete request.archived_at;
  return request;
}

module.exports = { createRequest, listMyRequests, getMyRequestByTracking };
