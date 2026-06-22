// Staff-facing environmental-request logic: queue, detail, status transitions
// (approve / schedule / complete / reject, with side effects + resident email),
// and notes. Authenticated + role-gated, so staff may see the requester's contact.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { computeExceededSla } = require('../utils/sla');
const { notifyReportStatus } = require('../utils/notify');
const { notifyStatusChange } = require('./notification.service');

const TERMINAL = ['Completed', 'Rejected'];

const QUEUE_SELECT = {
  request_id: true,
  tracking_id: true,
  request_type: true,
  status: true,
  requested_quantity: true,
  preferred_schedule: true,
  scheduled_date: true,
  submitted_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  processed_by: true,
  barangay: { select: { name: true } },
  user: { select: { first_name: true, last_name: true } },
};

const DETAIL_SELECT = {
  request_id: true,
  tracking_id: true,
  request_type: true,
  description: true,
  document_path: true,
  requested_quantity: true,
  preferred_schedule: true,
  status: true,
  scheduled_date: true,
  completion_date: true,
  approved_by_cenro_head: true,
  approval_date: true,
  staff_notes: true,
  submitted_at: true,
  updated_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  processed_by: true,
  barangay: { select: { barangay_id: true, name: true } },
  user: { select: { user_id: true, first_name: true, last_name: true, email: true, contact_number: true } },
  processor: { select: { user_id: true, first_name: true, last_name: true } },
};

function whereFor(idOrTracking) {
  return /^\d+$/.test(String(idOrTracking))
    ? { request_id: Number(idOrTracking) }
    : { tracking_id: String(idOrTracking) };
}

async function listRequests(filters = {}) {
  // Express 5 makes req.query read-only, so coerce the query values here.
  const { status, search } = filters;
  const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
  const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 20;
  const barangay_id = filters.barangay_id ? Number(filters.barangay_id) : undefined;

  const where = {};
  if (status) where.status = status;
  if (barangay_id) where.barangay_id = barangay_id;
  if (search) {
    where.OR = [{ tracking_id: { contains: search } }, { description: { contains: search } }];
  }

  const [total, items] = await Promise.all([
    prisma.environmentalRequest.count({ where }),
    prisma.environmentalRequest.findMany({
      where,
      orderBy: { submitted_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: QUEUE_SELECT,
    }),
  ]);

  return { items, total, page, limit };
}

async function getRequest(idOrTracking) {
  const request = await prisma.environmentalRequest.findFirst({ where: whereFor(idOrTracking), select: DETAIL_SELECT });
  if (!request) throw new HttpError(404, 'Request not found.');
  return request;
}

async function updateRequestStatus(staffId, idOrTracking, input, ctx = {}) {
  const existing = await prisma.environmentalRequest.findFirst({
    where: whereFor(idOrTracking),
    select: {
      request_id: true, tracking_id: true, status: true, sla_deadline: true,
      scheduled_date: true, completion_date: true, approval_date: true, user_id: true,
      user: { select: { email: true, first_name: true } },
    },
  });
  if (!existing) throw new HttpError(404, 'Request not found.');

  const newStatus = input.status;
  const changed = newStatus !== existing.status;
  const isTerminal = TERMINAL.includes(newStatus);

  const scheduled_date =
    newStatus === 'Scheduled' ? input.scheduled_date || existing.scheduled_date : existing.scheduled_date;
  const completion_date =
    newStatus === 'Completed' ? existing.completion_date || new Date() : existing.completion_date;
  const approved = newStatus === 'Approved';
  const approval_date = approved ? existing.approval_date || new Date() : existing.approval_date;
  const completedAt = isTerminal ? completion_date || new Date() : null;
  const exceeded_sla = computeExceededSla(existing.sla_deadline, completedAt);

  const data = {
    status: newStatus,
    processed_by: staffId,
    scheduled_date,
    completion_date,
    exceeded_sla,
    approval_date,
    ...(approved ? { approved_by_cenro_head: true } : {}),
  };

  await prisma.environmentalRequest.update({ where: { request_id: existing.request_id }, data });

  await writeAuditLog({
    performedBy: staffId,
    action: 'REQUEST_STATUS_UPDATE',
    targetTable: 'EnvironmentalRequest',
    targetId: existing.request_id,
    data: { tracking_id: existing.tracking_id, from: existing.status, to: newStatus },
    ipAddress: ctx.ipAddress || null,
  });

  if (changed) {
    await notifyReportStatus({
      to: existing.user?.email,
      name: existing.user?.first_name,
      kind: 'request',
      trackingId: existing.tracking_id,
      status: newStatus,
      note: input.note,
    });
    await notifyStatusChange({
      userId: existing.user_id,
      kind: 'request',
      trackingId: existing.tracking_id,
      status: newStatus,
      note: input.note,
    });
  }

  return getRequest(existing.request_id);
}

async function updateRequest(staffId, idOrTracking, input, ctx = {}) {
  const existing = await prisma.environmentalRequest.findFirst({
    where: whereFor(idOrTracking),
    select: { request_id: true, tracking_id: true },
  });
  if (!existing) throw new HttpError(404, 'Request not found.');

  const data = {};
  if (input.staff_notes !== undefined) data.staff_notes = input.staff_notes || null;
  if (input.scheduled_date !== undefined) data.scheduled_date = input.scheduled_date || null;

  await prisma.environmentalRequest.update({ where: { request_id: existing.request_id }, data });

  await writeAuditLog({
    performedBy: staffId,
    action: 'REQUEST_UPDATE',
    targetTable: 'EnvironmentalRequest',
    targetId: existing.request_id,
    data: { tracking_id: existing.tracking_id, fields: Object.keys(data) },
    ipAddress: ctx.ipAddress || null,
  });

  return getRequest(existing.request_id);
}

module.exports = { listRequests, getRequest, updateRequestStatus, updateRequest };
