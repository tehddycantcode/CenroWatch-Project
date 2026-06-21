// Admin audit-log viewer: paginated, filterable read of the AuditLog trail.
// Read-only (viewing the log does not itself write a log entry).

const prisma = require('../utils/prisma');

async function listAuditLogs(filters = {}) {
  // Express 5 req.query is read-only — coerce here.
  const { action, search } = filters;
  const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
  const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 30;
  const performed_by = filters.performed_by ? Number(filters.performed_by) : undefined;

  const where = {};
  if (action) where.action = { contains: action };
  if (performed_by) where.performed_by = performed_by;
  if (filters.from || filters.to) {
    where.performed_at = {};
    if (filters.from) where.performed_at.gte = new Date(filters.from);
    if (filters.to) where.performed_at.lte = new Date(filters.to);
  }
  if (search) {
    where.OR = [{ action: { contains: search } }, { target_table: { contains: search } }];
  }

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { performed_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        log_id: true,
        action: true,
        target_table: true,
        target_id: true,
        data_generated_json: true,
        ip_address: true,
        performed_at: true,
        performed_by: true,
        user: { select: { first_name: true, last_name: true, email: true, role: true } },
      },
    }),
  ]);

  return { items, total, page, limit };
}

module.exports = { listAuditLogs };
