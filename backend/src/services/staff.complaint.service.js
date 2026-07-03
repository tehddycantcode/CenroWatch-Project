// Staff-facing complaint logic: queue listing, full detail (staff may see the
// reporter's contact info — these endpoints are authenticated + role-gated, so
// the R.A. 10173 "zero personal data" rule that governs PUBLIC endpoints does
// not apply here), status transitions (with history + resident email), and
// assignment/notes. Every mutation writes an AuditLog.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { computeExceededSla } = require('../utils/sla');
const { notifyReportStatus } = require('../utils/notify');
const { notifyStatusChange } = require('./notification.service');

const TERMINAL = ['Resolved', 'Rejected'];

const QUEUE_SELECT = {
  complaint_id: true,
  tracking_id: true,
  complaint_type: true,
  status: true,
  priority: true,
  is_anonymous: true,
  submitted_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  assigned_to: true,
  barangay: { select: { name: true } },
  user: { select: { first_name: true, last_name: true } },
  assigned_staff: { select: { first_name: true, last_name: true } },
};

const DETAIL_SELECT = {
  complaint_id: true,
  tracking_id: true,
  complaint_type: true,
  description: true,
  photo_path: true,
  latitude: true,
  longitude: true,
  address_details: true,
  status: true,
  priority: true,
  is_anonymous: true,
  staff_notes: true,
  resolution_notes: true,
  submitted_at: true,
  observed_at: true,
  updated_at: true,
  resolved_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  assigned_to: true,
  barangay: { select: { barangay_id: true, name: true } },
  user: { select: { user_id: true, first_name: true, last_name: true, email: true, contact_number: true } },
  assigned_staff: { select: { user_id: true, first_name: true, last_name: true } },
  status_history: {
    orderBy: { changed_at: 'asc' },
    select: { id: true, old_status: true, new_status: true, note: true, changed_at: true, changed_by: true },
  },
};

// Accept either a numeric complaint_id or a CMP-tracking id.
function whereFor(idOrTracking) {
  return /^\d+$/.test(String(idOrTracking))
    ? { complaint_id: Number(idOrTracking) }
    : { tracking_id: String(idOrTracking) };
}

async function listComplaints(filters = {}) {
  // Express 5 makes req.query read-only, so express-validator's toInt/toBoolean
  // sanitizers don't persist — coerce the query values here.
  const { status, search } = filters;
  const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
  const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 20;
  const barangay_id = filters.barangay_id ? Number(filters.barangay_id) : undefined;
  const priority = filters.priority === undefined || filters.priority === ''
    ? undefined
    : filters.priority === true || filters.priority === 'true';

  const where = {};
  if (status) where.status = status;
  if (barangay_id) where.barangay_id = barangay_id;
  if (typeof priority === 'boolean') where.priority = priority;
  if (search) {
    where.OR = [{ tracking_id: { contains: search } }, { description: { contains: search } }];
  }

  const [total, items] = await Promise.all([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { submitted_at: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: QUEUE_SELECT,
    }),
  ]);

  return { items, total, page, limit };
}

async function getComplaint(idOrTracking) {
  const complaint = await prisma.complaint.findFirst({ where: whereFor(idOrTracking), select: DETAIL_SELECT });
  if (!complaint) throw new HttpError(404, 'Complaint not found.');
  return complaint;
}

async function updateComplaintStatus(staffId, idOrTracking, input, ctx = {}) {
  const existing = await prisma.complaint.findFirst({
    where: whereFor(idOrTracking),
    select: {
      complaint_id: true, tracking_id: true, status: true, sla_deadline: true, resolved_at: true,
      user_id: true,
      user: { select: { email: true, first_name: true } },
    },
  });
  if (!existing) throw new HttpError(404, 'Complaint not found.');

  const newStatus = input.status;
  const changed = newStatus !== existing.status;
  const isTerminal = TERMINAL.includes(newStatus);
  const resolved_at =
    newStatus === 'Resolved' ? existing.resolved_at || new Date() : existing.resolved_at;
  const completedAt = isTerminal ? resolved_at || new Date() : null;
  const exceeded_sla = computeExceededSla(existing.sla_deadline, completedAt);

  await prisma.$transaction(async (tx) => {
    await tx.complaint.update({
      where: { complaint_id: existing.complaint_id },
      data: {
        status: newStatus,
        resolved_at,
        exceeded_sla,
        ...(input.resolution_notes !== undefined ? { resolution_notes: input.resolution_notes || null } : {}),
      },
    });
    if (changed) {
      await tx.complaintStatusHistory.create({
        data: {
          complaint_id: existing.complaint_id,
          old_status: existing.status,
          new_status: newStatus,
          changed_by: staffId,
          note: input.note || null,
        },
      });
    }
  });

  await writeAuditLog({
    performedBy: staffId,
    action: 'COMPLAINT_STATUS_UPDATE',
    targetTable: 'Complaint',
    targetId: existing.complaint_id,
    data: { tracking_id: existing.tracking_id, from: existing.status, to: newStatus },
    ipAddress: ctx.ipAddress || null,
  });

  if (changed) {
    await notifyReportStatus({
      to: existing.user?.email,
      name: existing.user?.first_name,
      kind: 'complaint',
      trackingId: existing.tracking_id,
      status: newStatus,
      note: input.note,
    });
    await notifyStatusChange({
      userId: existing.user_id,
      kind: 'complaint',
      trackingId: existing.tracking_id,
      status: newStatus,
      note: input.note,
    });
  }

  return getComplaint(existing.complaint_id);
}

async function updateComplaint(staffId, idOrTracking, input, ctx = {}) {
  const existing = await prisma.complaint.findFirst({
    where: whereFor(idOrTracking),
    select: { complaint_id: true, tracking_id: true },
  });
  if (!existing) throw new HttpError(404, 'Complaint not found.');

  if (input.assigned_to) {
    const staff = await prisma.user.findUnique({ where: { user_id: input.assigned_to }, select: { role: true } });
    if (!staff || (staff.role !== 'CENRO_Staff' && staff.role !== 'Admin')) {
      throw new HttpError(422, 'Can only assign to CENRO staff.');
    }
  }

  const data = {};
  if (input.assigned_to !== undefined) data.assigned_to = input.assigned_to || null;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.staff_notes !== undefined) data.staff_notes = input.staff_notes || null;
  if (input.resolution_notes !== undefined) data.resolution_notes = input.resolution_notes || null;

  await prisma.complaint.update({ where: { complaint_id: existing.complaint_id }, data });

  await writeAuditLog({
    performedBy: staffId,
    action: 'COMPLAINT_UPDATE',
    targetTable: 'Complaint',
    targetId: existing.complaint_id,
    data: { tracking_id: existing.tracking_id, fields: Object.keys(data) },
    ipAddress: ctx.ipAddress || null,
  });

  return getComplaint(existing.complaint_id);
}

module.exports = { listComplaints, getComplaint, updateComplaintStatus, updateComplaint };
