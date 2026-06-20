// Audit logging helper. Per project rule, every data mutation writes an
// AuditLog entry. Call this from services after a successful mutation.
//
// IMPORTANT: never put secrets or full personal records in data_generated_json.
// Store identifiers and a summary of what changed.

const prisma = require('./prisma');

/**
 * @param {Object} entry
 * @param {number|null} entry.performedBy  user_id of the actor (null = system)
 * @param {string}      entry.action       e.g. 'USER_REGISTER', 'USER_LOGIN'
 * @param {string}      entry.targetTable  e.g. 'User'
 * @param {number|null} [entry.targetId]   affected row id
 * @param {Object}      [entry.data]       JSON summary (no secrets / no PII dumps)
 * @param {string|null} [entry.ipAddress]
 */
async function writeAuditLog({
  performedBy = null,
  action,
  targetTable,
  targetId = null,
  data = {},
  ipAddress = null,
}) {
  return prisma.auditLog.create({
    data: {
      performed_by: performedBy,
      action,
      target_table: targetTable,
      target_id: targetId,
      data_generated_json: data,
      ip_address: ipAddress,
    },
  });
}

module.exports = { writeAuditLog };
