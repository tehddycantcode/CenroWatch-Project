// Admin archive: hide a report from the working system without destroying it.
//
// This is the ONLY service that deliberately reads archived rows (see the
// exception list in utils/archive.js). Archiving is Admin-only: it looks
// destructive even though it is reversible, so it carries the narrower blast
// radius, and it matches where the Archive screen already lives.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { ARCHIVED_ONLY } = require('../utils/archive');

// One dispatch table so all three kinds share a single audited code path.
const KINDS = {
  complaints: {
    model: 'complaint',
    idField: 'complaint_id',
    refField: 'tracking_id',
    label: 'Complaint',
    targetTable: 'Complaint',
    select: {
      complaint_id: true, tracking_id: true, complaint_type: true, status: true,
      submitted_at: true, archived_at: true, archived_by: true, archive_reason: true,
      barangay: { select: { name: true } },
    },
  },
  wildlife: {
    model: 'wildlifeTurnover',
    idField: 'turnover_id',
    refField: 'reference_id',
    label: 'Wildlife turnover',
    targetTable: 'WildlifeTurnover',
    select: {
      turnover_id: true, reference_id: true, species_name: true, status: true,
      submitted_at: true, archived_at: true, archived_by: true, archive_reason: true,
      barangay: { select: { name: true } },
    },
  },
  requests: {
    model: 'environmentalRequest',
    idField: 'request_id',
    refField: 'tracking_id',
    label: 'Service request',
    targetTable: 'EnvironmentalRequest',
    select: {
      request_id: true, tracking_id: true, request_type: true, status: true,
      submitted_at: true, archived_at: true, archived_by: true, archive_reason: true,
      barangay: { select: { name: true } },
    },
  },
};

function configFor(kind) {
  const cfg = KINDS[kind];
  if (!cfg) throw new HttpError(422, 'Unknown report kind.');
  return cfg;
}

// Match either the numeric id or the human reference.
function whereFor(cfg, idOrRef) {
  return /^\d+$/.test(String(idOrRef))
    ? { [cfg.idField]: Number(idOrRef) }
    : { [cfg.refField]: String(idOrRef) };
}

// Everything currently archived, newest first, across all three kinds.
async function listArchived() {
  const entries = await Promise.all(
    Object.entries(KINDS).map(async ([kind, cfg]) => {
      const rows = await prisma[cfg.model].findMany({
        where: ARCHIVED_ONLY,
        orderBy: { archived_at: 'desc' },
        select: cfg.select,
      });
      return rows.map((r) => ({
        kind,
        label: cfg.label,
        id: r[cfg.idField],
        reference: r[cfg.refField],
        title: r.complaint_type || r.species_name || r.request_type || cfg.label,
        status: r.status,
        barangay: r.barangay?.name || null,
        submitted_at: r.submitted_at,
        archived_at: r.archived_at,
        archived_by: r.archived_by,
        archive_reason: r.archive_reason,
      }));
    })
  );

  const items = entries.flat().sort((a, b) => new Date(b.archived_at) - new Date(a.archived_at));

  // Resolve the archiving staff names in one query rather than per row.
  const ids = [...new Set(items.map((i) => i.archived_by).filter(Boolean))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { user_id: { in: ids } }, select: { user_id: true, first_name: true, last_name: true } })
    : [];
  const nameOf = Object.fromEntries(users.map((u) => [u.user_id, `${u.first_name} ${u.last_name}`]));

  return items.map((i) => ({ ...i, archived_by_name: i.archived_by ? nameOf[i.archived_by] || null : null }));
}

async function archiveReport(adminId, kind, idOrRef, reason, ctx = {}) {
  const cfg = configFor(kind);
  const existing = await prisma[cfg.model].findFirst({
    where: whereFor(cfg, idOrRef),
    select: { [cfg.idField]: true, [cfg.refField]: true, archived_at: true },
  });
  if (!existing) throw new HttpError(404, `${cfg.label} not found.`);
  if (existing.archived_at) throw new HttpError(409, 'This report is already archived.');

  const updated = await prisma[cfg.model].update({
    where: { [cfg.idField]: existing[cfg.idField] },
    data: { archived_at: new Date(), archived_by: adminId, archive_reason: reason },
    select: cfg.select,
  });

  // The row is hidden, not deleted, but the log records why and by whom.
  await writeAuditLog({
    performedBy: adminId,
    action: 'REPORT_ARCHIVE',
    targetTable: cfg.targetTable,
    targetId: existing[cfg.idField],
    data: { kind, reference: existing[cfg.refField], reason },
    ipAddress: ctx.ipAddress || null,
  });

  return updated;
}

async function restoreReport(adminId, kind, idOrRef, ctx = {}) {
  const cfg = configFor(kind);
  const existing = await prisma[cfg.model].findFirst({
    where: whereFor(cfg, idOrRef),
    select: { [cfg.idField]: true, [cfg.refField]: true, archived_at: true, archive_reason: true },
  });
  if (!existing) throw new HttpError(404, `${cfg.label} not found.`);
  if (!existing.archived_at) throw new HttpError(409, 'This report is not archived.');

  const updated = await prisma[cfg.model].update({
    where: { [cfg.idField]: existing[cfg.idField] },
    data: { archived_at: null, archived_by: null, archive_reason: null },
    select: cfg.select,
  });

  await writeAuditLog({
    performedBy: adminId,
    action: 'REPORT_RESTORE',
    targetTable: cfg.targetTable,
    targetId: existing[cfg.idField],
    data: { kind, reference: existing[cfg.refField], previous_reason: existing.archive_reason },
    ipAddress: ctx.ipAddress || null,
  });

  return updated;
}

module.exports = { listArchived, archiveReport, restoreReport, KINDS };
