// Admin-managed report categories (complaint types and request types).
//
// These were Prisma enums until 2026-09-09, which meant adding a category was a
// schema migration and a redeploy. They are rows now, and this is the only place
// that reads or writes them.
//
// Reports store the category NAME, with a foreign key to it, so the database
// guarantees a report can never name a category that does not exist. That makes
// the validators' job a referential check rather than a membership test against
// a hardcoded array.
//
// Categories are RETIRED (is_active = false), never deleted. A category with
// reports against it cannot be removed without making that history unreadable,
// and the FK is set to RESTRICT so the database refuses it outright.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');

// The two category kinds, and everything that differs between them. Written as
// a table so the CRUD below is one implementation rather than two that drift.
const KINDS = {
  complaint: {
    model: 'complaintType',
    idField: 'complaint_type_id',
    table: 'ComplaintType',
    label: 'Complaint type',
    // Request types carry SLA wiring; complaint types do not.
    slaFields: false,
  },
  request: {
    model: 'requestType',
    idField: 'request_type_id',
    table: 'RequestType',
    label: 'Request type',
    slaFields: true,
  },
};

function kindOf(kind) {
  const k = KINDS[kind];
  if (!k) throw new HttpError(404, 'Unknown category kind.');
  return k;
}

const PUBLIC_FIELDS = { name: true, label: true, sort_order: true };

/**
 * Active categories, for the report forms on web and mobile.
 * Zero personal data, so this is safe on a public endpoint (R.A. 10173).
 */
async function listActive() {
  const [complaint_types, request_types] = await Promise.all([
    prisma.complaintType.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: PUBLIC_FIELDS,
    }),
    prisma.requestType.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: PUBLIC_FIELDS,
    }),
  ]);
  return { complaint_types, request_types };
}

/**
 * Admin view: every category including retired ones, each with the number of
 * reports using it. The count is what tells an Admin whether retiring a category
 * will affect existing records, so it is worth the extra query.
 */
async function listAll() {
  const [complaintTypes, requestTypes] = await Promise.all([
    prisma.complaintType.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { complaints: true } } },
    }),
    prisma.requestType.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { requests: true } } },
    }),
  ]);

  const shape = (rows, countKey) =>
    rows.map(({ _count, ...row }) => ({ ...row, in_use: _count[countKey] }));

  return {
    complaint_types: shape(complaintTypes, 'complaints'),
    request_types: shape(requestTypes, 'requests'),
  };
}

/**
 * Is this category name usable on a NEW report? Used by the report validators.
 * A retired category stays valid on the reports that already reference it, but
 * must not be selectable for a new one.
 */
async function isSelectable(kind, name) {
  const k = kindOf(kind);
  if (!name) return false;
  const row = await prisma[k.model].findUnique({ where: { name: String(name) }, select: { is_active: true } });
  return Boolean(row && row.is_active);
}

/**
 * The SLA budget for a request type, or null when it has no Citizens Charter
 * commitment. Replaces the hardcoded REQUEST_SLA_BY_TYPE map, which keyed off
 * literal enum values and would have silently returned undefined - meaning no
 * deadline at all - for any category an Admin added.
 */
async function slaForRequestType(name) {
  if (!name) return null;
  const row = await prisma.requestType.findUnique({
    where: { name: String(name) },
    select: { sla_setting_key: true, sla_fallback_minutes: true },
  });
  if (!row || !row.sla_setting_key) return null;
  return { key: row.sla_setting_key, fallback: row.sla_fallback_minutes ?? 0 };
}

// The name is written onto every report and rendered by humanize(), which turns
// underscores into spaces. Anything outside this shape renders badly and cannot
// round-trip through a URL, so it is rejected rather than silently mangled.
const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

async function createType(kind, adminId, input, ctx = {}) {
  const k = kindOf(kind);
  const name = String(input.name || '').trim();

  if (!NAME_RE.test(name)) {
    throw new HttpError(422, 'Use letters, numbers and underscores only, starting with a letter (e.g. Illegal_Dumping).');
  }
  const clash = await prisma[k.model].findUnique({ where: { name } });
  if (clash) throw new HttpError(409, 'A category with that name already exists.');

  const data = {
    name,
    label: input.label ? String(input.label).trim() : null,
    sort_order: Number.isInteger(input.sort_order) ? input.sort_order : 0,
  };
  if (k.slaFields) {
    data.sla_setting_key = input.sla_setting_key ? String(input.sla_setting_key).trim() : null;
    data.sla_fallback_minutes = data.sla_setting_key ? Number(input.sla_fallback_minutes) || null : null;
  }

  const row = await prisma[k.model].create({ data });

  await writeAuditLog({
    performedBy: adminId,
    action: 'CATEGORY_CREATE',
    targetTable: k.table,
    targetId: row[k.idField],
    data: { kind, name: row.name },
    ipAddress: ctx.ipAddress || null,
  });

  return row;
}

async function updateType(kind, adminId, id, input, ctx = {}) {
  const k = kindOf(kind);
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) throw new HttpError(404, `${k.label} not found.`);

  const existing = await prisma[k.model].findUnique({ where: { [k.idField]: targetId } });
  if (!existing) throw new HttpError(404, `${k.label} not found.`);

  const data = {};
  // The name is deliberately NOT editable. It is the foreign key every report
  // stores; ON UPDATE CASCADE would rewrite them, but the name also appears in
  // exported PDFs and audit-log payloads that cannot be rewritten, so a rename
  // would silently split one category's history in two. Retire it and add a
  // replacement instead - that keeps both halves legible.
  if (input.label !== undefined) data.label = input.label ? String(input.label).trim() : null;
  if (input.sort_order !== undefined) data.sort_order = Number(input.sort_order) || 0;
  if (input.is_active !== undefined) data.is_active = Boolean(input.is_active);
  if (k.slaFields) {
    if (input.sla_setting_key !== undefined) {
      data.sla_setting_key = input.sla_setting_key ? String(input.sla_setting_key).trim() : null;
    }
    if (input.sla_fallback_minutes !== undefined) {
      data.sla_fallback_minutes =
        input.sla_fallback_minutes === null || input.sla_fallback_minutes === ''
          ? null
          : Number(input.sla_fallback_minutes) || null;
    }
  }

  if (Object.keys(data).length === 0) throw new HttpError(422, 'Nothing to change.');

  // Retiring the last active category would leave the report form with no
  // options and no way for a resident to file anything - refused rather than
  // discovered by a resident staring at an empty dropdown.
  if (data.is_active === false && existing.is_active) {
    const remaining = await prisma[k.model].count({ where: { is_active: true } });
    if (remaining <= 1) {
      throw new HttpError(422, `This is the last active ${k.label.toLowerCase()}. Add another one before retiring it.`);
    }
  }

  const row = await prisma[k.model].update({ where: { [k.idField]: targetId }, data });

  await writeAuditLog({
    performedBy: adminId,
    action: 'CATEGORY_UPDATE',
    targetTable: k.table,
    targetId: targetId,
    data: { kind, name: existing.name, fields: Object.keys(data) },
    ipAddress: ctx.ipAddress || null,
  });

  return row;
}

module.exports = {
  listActive,
  listAll,
  isSelectable,
  slaForRequestType,
  createType,
  updateType,
  KINDS,
};
