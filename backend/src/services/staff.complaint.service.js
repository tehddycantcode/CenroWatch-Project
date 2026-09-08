// Staff-facing complaint logic: queue listing, full detail (staff may see the
// reporter's contact info — these endpoints are authenticated + role-gated, so
// the R.A. 10173 "zero personal data" rule that governs PUBLIC endpoints does
// not apply here), status transitions (with history + resident email), and
// assignment/notes. Every mutation writes an AuditLog.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { computeExceededSla, getSlaMinutes, computeSlaDeadline } = require('../utils/sla');
const { NOT_ARCHIVED, assertNotArchived } = require('../utils/archive');
const { createSequential } = require('../utils/createSequential');
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
  received_via: true,
  reporter_name: true,
  // Pin coordinates for the staff dashboard map (staff-only endpoint; the
  // public-endpoint obfuscation rule does not apply behind RBAC).
  latitude: true,
  longitude: true,
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
  received_via: true,
  reporter_name: true,
  reporter_contact: true,
  logged_by: true,
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
  logged_by_staff: { select: { user_id: true, first_name: true, last_name: true } },
  status_history: {
    orderBy: { changed_at: 'asc' },
    select: { id: true, old_status: true, new_status: true, note: true, changed_at: true, changed_by: true },
  },
  // Detail reads deliberately still return archived rows so an admin can open
  // one and restore it; the queue above is what filters them out.
  archived_at: true,
  archive_reason: true,
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

  const where = { ...NOT_ARCHIVED };
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

// Staff logs a walk-in complaint on behalf of a resident at the office. The
// walk-in resident has no account (user_id stays null); their name/contact are
// captured on the report (unless anonymous). logged_by records the staff who
// took it down, received_via defaults to Walk_In, and the SLA clock starts now.
async function createWalkInComplaint(staffId, input, photoPath, ctx = {}) {
  const barangay = await prisma.barangay.findUnique({ where: { barangay_id: input.barangay_id } });
  if (!barangay) throw new HttpError(422, 'Selected barangay does not exist.');

  const isAnonymous = input.is_anonymous === true;
  const submitted_at = new Date();
  const year = submitted_at.getFullYear();
  // A walk-in is created ALREADY APPROVED. A staff member typing the report at
  // the counter IS the acknowledgement - there is no separate triage step still
  // to come. Making them file it and then approve their own entry would be
  // theatre, and would leave a queue of unapproved walk-ins reporting a fake
  // "nothing overdue".
  const slaMinutes = await getSlaMinutes('complaint_sla_minutes', 3365);
  const sla_started_at = submitted_at;
  const sla_deadline = await computeSlaDeadline(submitted_at, slaMinutes);

  const created = await createSequential({
    model: 'complaint',
    type: 'complaint',
    idField: 'tracking_id',
    year,
    data: {
      user_id: null,
      is_anonymous: isAnonymous,
      reporter_name: isAnonymous ? null : input.reporter_name || null,
      reporter_contact: isAnonymous ? null : input.reporter_contact || null,
      logged_by: staffId,
      received_via: input.received_via || 'Walk_In',
      barangay_id: input.barangay_id,
      complaint_type: input.complaint_type,
      description: input.description,
      photo_path: photoPath || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      address_details: input.address_details || null,
      submitted_at,
      observed_at: input.observed_at ?? null,
      status: 'Approved',
      sla_started_at,
      sla_deadline,
    },
    select: { complaint_id: true },
  });

  // Without this the status has no provenance: the resident's tracking timeline
  // opens blank, and a future backfill has no evidence of when the clock began.
  // Every other status change in this service writes one; a walk-in starting in
  // a non-default state must too.
  await prisma.complaintStatusHistory.create({
    data: {
      complaint_id: created.complaint_id,
      old_status: 'Pending',
      new_status: 'Approved',
      changed_by: staffId,
      note: 'Logged at the CENRO office.',
    },
  });

  await writeAuditLog({
    performedBy: staffId,
    action: 'COMPLAINT_CREATE_WALKIN',
    targetTable: 'Complaint',
    targetId: created.complaint_id,
    data: {
      complaint_type: input.complaint_type,
      barangay_id: input.barangay_id,
      received_via: input.received_via || 'Walk_In',
      anonymous: isAnonymous,
    },
    ipAddress: ctx.ipAddress || null,
  });

  return getComplaint(created.complaint_id);
}

async function updateComplaintStatus(staffId, idOrTracking, input, ctx = {}) {
  const existing = await prisma.complaint.findFirst({
    where: whereFor(idOrTracking),
    select: {
      complaint_id: true, tracking_id: true, status: true, resolved_at: true,
      sla_started_at: true, sla_deadline: true,
      user_id: true, archived_at: true,
      user: { select: { email: true, first_name: true } },
    },
  });
  if (!existing) throw new HttpError(404, 'Complaint not found.');
  // A stale tab must not update an archived report and email the resident
  // about a case they can no longer see.
  assertNotArchived(existing, 'complaint');

  const newStatus = input.status;
  const changed = newStatus !== existing.status;
  const isTerminal = TERMINAL.includes(newStatus);
  const resolved_at =
    newStatus === 'Resolved' ? existing.resolved_at || new Date() : existing.resolved_at;
  const completedAt = isTerminal ? resolved_at || new Date() : null;

  // The SLA clock starts on the FIRST move to Approved and is never recomputed.
  // `existing.sla_started_at ||` is the guard that matters: there is no state
  // machine, so a staff member can go Approved -> Pending -> Approved, and
  // without this the round trip would silently reset the deadline and erase a
  // breach. Same idiom as resolved_at above and approval_date in requests.
  const startsNow = !existing.sla_started_at && newStatus === 'Approved';
  const sla_started_at = existing.sla_started_at || (startsNow ? new Date() : null);
  const sla_deadline = existing.sla_deadline
    || (startsNow
      ? await computeSlaDeadline(sla_started_at, await getSlaMinutes('complaint_sla_minutes', 3365))
      : null);

  // Judge against the EFFECTIVE deadline, not the pre-update one. Approving and
  // resolving in a single motion would otherwise be measured against null.
  const exceeded_sla = computeExceededSla(sla_deadline, completedAt);

  await prisma.$transaction(async (tx) => {
    await tx.complaint.update({
      where: { complaint_id: existing.complaint_id },
      data: {
        status: newStatus,
        resolved_at,
        sla_started_at,
        sla_deadline,
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
      // Only present on the approval transition, so the resident is told the
      // deadline at the moment it is actually made.
      dueDate: startsNow ? sla_deadline : null,
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
    select: { complaint_id: true, tracking_id: true, archived_at: true },
  });
  if (!existing) throw new HttpError(404, 'Complaint not found.');
  assertNotArchived(existing, 'complaint');

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

module.exports = { listComplaints, getComplaint, createWalkInComplaint, updateComplaintStatus, updateComplaint };
