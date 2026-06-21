// SLA helpers (Citizens Charter, Part 20). SLA durations live in SystemSetting
// (minutes) so an Admin can tune them later without a code change.

const prisma = require('./prisma');

async function getSlaMinutes(settingKey, fallbackMinutes) {
  const row = await prisma.systemSetting.findUnique({ where: { setting_key: settingKey } });
  const minutes = row ? parseInt(row.setting_value, 10) : NaN;
  return Number.isFinite(minutes) ? minutes : fallbackMinutes;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

// Whether a report breached its SLA. If completedAt is given (terminal status),
// compare the completion time; otherwise compare against now (still open).
function computeExceededSla(slaDeadline, completedAt = null) {
  if (!slaDeadline) return false;
  const ref = completedAt || new Date();
  return ref.getTime() > new Date(slaDeadline).getTime();
}

module.exports = { getSlaMinutes, addMinutes, computeExceededSla };
