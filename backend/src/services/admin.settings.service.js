// Admin system settings: list and update tunable SystemSetting rows (e.g. the
// Citizens Charter SLA durations in minutes). Every update writes an AuditLog.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');

function listSettings() {
  return prisma.systemSetting.findMany({ orderBy: { setting_key: 'asc' } });
}

async function updateSetting(adminId, key, value, ctx = {}) {
  const existing = await prisma.systemSetting.findUnique({ where: { setting_key: key } });
  if (!existing) throw new HttpError(404, 'Setting not found.');

  // Minute-based settings must be a positive integer.
  if (key.endsWith('_minutes')) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(422, 'This setting must be a positive whole number of minutes.');
  }

  const setting = await prisma.systemSetting.update({
    where: { setting_key: key },
    data: { setting_value: String(value) },
  });

  await writeAuditLog({
    performedBy: adminId,
    action: 'SETTINGS_UPDATE',
    targetTable: 'SystemSetting',
    targetId: setting.setting_id,
    data: { key, from: existing.setting_value, to: setting.setting_value },
    ipAddress: ctx.ipAddress || null,
  });

  return setting;
}

module.exports = { listSettings, updateSetting };
