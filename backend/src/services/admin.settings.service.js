// Admin system settings: list and update tunable SystemSetting rows (e.g. the
// Citizens Charter SLA durations in minutes). Every update writes an AuditLog.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { LAT_KEY, LNG_KEY } = require('./officeLocation.service');

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

  // The office coordinates are typed into a text box and then become map
  // geometry, so a slip has to be refused here. 141 instead of 14.1 does not
  // fail anywhere downstream - it silently moves the office to the Arctic and
  // makes every distance on every report wrong. An empty value is allowed: that
  // is how an Admin clears the office and switches the distance line back off.
  if (key === LAT_KEY || key === LNG_KEY) {
    const raw = String(value).trim();
    if (raw !== '') {
      const n = Number(raw);
      const limit = key === LAT_KEY ? 90 : 180;
      if (!Number.isFinite(n) || n < -limit || n > limit) {
        throw new HttpError(422, `This setting must be a number between -${limit} and ${limit}.`);
      }
    }
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
