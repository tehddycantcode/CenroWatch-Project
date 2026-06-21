// Staff-facing wildlife turnover logic: queue, detail, status transitions (with
// intake/release/transfer side effects + resident email), and notes. Wildlife has
// no status-history table, so transitions are recorded via AuditLog. Authenticated
// + role-gated, so staff may see the reporter's contact info.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { computeExceededSla } = require('../utils/sla');
const { notifyReportStatus } = require('../utils/notify');

const TERMINAL = ['Released', 'Transferred', 'Deceased'];

const QUEUE_SELECT = {
  turnover_id: true,
  reference_id: true,
  species_name: true,
  animal_condition: true,
  is_endangered: true,
  is_priority_review: true,
  status: true,
  submitted_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  processed_by: true,
  barangay: { select: { name: true } },
  resident: { select: { first_name: true, last_name: true } },
};

const DETAIL_SELECT = {
  turnover_id: true,
  reference_id: true,
  species_name: true,
  species_category: true,
  is_endangered: true,
  is_priority_review: true,
  animal_condition: true,
  description: true,
  photo_path: true,
  latitude: true,
  longitude: true,
  address_details: true,
  status: true,
  intake_date: true,
  release_date: true,
  transfer_destination: true,
  staff_notes: true,
  submitted_at: true,
  updated_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  processed_by: true,
  barangay: { select: { barangay_id: true, name: true } },
  resident: { select: { user_id: true, first_name: true, last_name: true, email: true, contact_number: true } },
  staff: { select: { user_id: true, first_name: true, last_name: true } },
};

function whereFor(idOrRef) {
  return /^\d+$/.test(String(idOrRef))
    ? { turnover_id: Number(idOrRef) }
    : { reference_id: String(idOrRef) };
}

async function listTurnovers(filters = {}) {
  // Express 5 makes req.query read-only, so coerce the query values here.
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
  if (typeof priority === 'boolean') where.is_priority_review = priority;
  if (search) {
    where.OR = [{ reference_id: { contains: search } }, { species_name: { contains: search } }];
  }

  const [total, items] = await Promise.all([
    prisma.wildlifeTurnover.count({ where }),
    prisma.wildlifeTurnover.findMany({
      where,
      orderBy: [{ is_priority_review: 'desc' }, { submitted_at: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: QUEUE_SELECT,
    }),
  ]);

  return { items, total, page, limit };
}

async function getTurnover(idOrRef) {
  const turnover = await prisma.wildlifeTurnover.findFirst({ where: whereFor(idOrRef), select: DETAIL_SELECT });
  if (!turnover) throw new HttpError(404, 'Wildlife record not found.');
  return turnover;
}

async function updateTurnoverStatus(staffId, idOrRef, input, ctx = {}) {
  const existing = await prisma.wildlifeTurnover.findFirst({
    where: whereFor(idOrRef),
    select: {
      turnover_id: true, reference_id: true, status: true, sla_deadline: true,
      intake_date: true, release_date: true,
      resident: { select: { email: true, first_name: true } },
    },
  });
  if (!existing) throw new HttpError(404, 'Wildlife record not found.');

  const newStatus = input.status;
  const changed = newStatus !== existing.status;
  const isTerminal = TERMINAL.includes(newStatus);

  const intake_date =
    newStatus === 'Under_Care' ? existing.intake_date || new Date() : existing.intake_date;
  const release_date =
    newStatus === 'Released' ? existing.release_date || new Date() : existing.release_date;
  const completedAt = isTerminal ? release_date || new Date() : null;
  const exceeded_sla = computeExceededSla(existing.sla_deadline, completedAt);

  const data = {
    status: newStatus,
    processed_by: staffId,
    intake_date,
    release_date,
    exceeded_sla,
  };
  if (newStatus === 'Transferred' && input.transfer_destination) {
    data.transfer_destination = input.transfer_destination;
  }

  await prisma.wildlifeTurnover.update({ where: { turnover_id: existing.turnover_id }, data });

  await writeAuditLog({
    performedBy: staffId,
    action: 'WILDLIFE_STATUS_UPDATE',
    targetTable: 'WildlifeTurnover',
    targetId: existing.turnover_id,
    data: { reference_id: existing.reference_id, from: existing.status, to: newStatus },
    ipAddress: ctx.ipAddress || null,
  });

  if (changed) {
    await notifyReportStatus({
      to: existing.resident?.email,
      name: existing.resident?.first_name,
      kind: 'wildlife',
      trackingId: existing.reference_id,
      status: newStatus,
      note: input.note,
    });
  }

  return getTurnover(existing.turnover_id);
}

async function updateTurnover(staffId, idOrRef, input, ctx = {}) {
  const existing = await prisma.wildlifeTurnover.findFirst({
    where: whereFor(idOrRef),
    select: { turnover_id: true, reference_id: true },
  });
  if (!existing) throw new HttpError(404, 'Wildlife record not found.');

  const data = {};
  if (input.staff_notes !== undefined) data.staff_notes = input.staff_notes || null;
  if (input.transfer_destination !== undefined) data.transfer_destination = input.transfer_destination || null;

  await prisma.wildlifeTurnover.update({ where: { turnover_id: existing.turnover_id }, data });

  await writeAuditLog({
    performedBy: staffId,
    action: 'WILDLIFE_UPDATE',
    targetTable: 'WildlifeTurnover',
    targetId: existing.turnover_id,
    data: { reference_id: existing.reference_id, fields: Object.keys(data) },
    ipAddress: ctx.ipAddress || null,
  });

  return getTurnover(existing.turnover_id);
}

module.exports = { listTurnovers, getTurnover, updateTurnoverStatus, updateTurnover };
