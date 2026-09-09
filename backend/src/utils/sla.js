// SLA helpers (Citizens Charter, Part 20). SLA durations live in SystemSetting
// (minutes) so an Admin can tune them later without a code change.
//
// The budget is spent in WORKING time: the clock advances Monday to Friday and
// stops over the weekend. See utils/workingTime.js for what that means exactly
// and why the day was kept at 24 hours rather than narrowed to office hours.

const prisma = require('./prisma');
const { addWorkingMinutes, DEFAULT_CALENDAR } = require('./workingTime');

// REMOVED: a hardcoded `request_type -> { key, fallback }` map used to live here.
// It keyed off literal enum values, so the moment an Admin added a request type
// the lookup returned undefined and that type silently got no deadline at all -
// no error, just a permanently empty SLA column. The mapping now lives on the
// RequestType row itself (sla_setting_key / sla_fallback_minutes); read it with
// categoryService.slaForRequestType(name).

async function getSlaMinutes(settingKey, fallbackMinutes) {
  const row = await prisma.systemSetting.findUnique({ where: { setting_key: settingKey } });
  const minutes = row ? parseInt(row.setting_value, 10) : NaN;
  return Number.isFinite(minutes) ? minutes : fallbackMinutes;
}

/**
 * The working calendar in force. Async and centralised on purpose: when the
 * admin-managed Holiday table lands, only this function changes - every caller
 * already awaits it, so no service file is touched to gain holiday support.
 */
async function loadCalendar() {
  return DEFAULT_CALENDAR;
}

/**
 * The deadline for a report whose clock starts at `start`, given a budget in
 * working minutes. This is the ONLY way a deadline should be produced.
 */
async function computeSlaDeadline(start, minutes) {
  const cal = await loadCalendar();
  return addWorkingMinutes(new Date(start), minutes, cal);
}

// Plain wall-clock addition. No longer used for deadlines - kept because the
// tests compare working-time results against it to prove monotonicity.
function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60_000);
}

// Whether a report breached its SLA. If completedAt is given (terminal status),
// compare the completion time; otherwise compare against now (still open).
//
// DELIBERATELY UNCHANGED by the working-time work. This compares two absolute
// instants, and that question - "did the terminal event happen after the
// promised moment?" - means exactly the same thing whether the deadline was
// computed in working time or wall-clock time. Re-expressing it as "working
// minutes elapsed vs budget" would double-count the weekend skip AND change
// what the stored sla_deadline means to the six live queries that filter on it.
// One stored instant, one comparison, one meaning.
//
// A null deadline returns false, which is now load-bearing: a complaint that
// has not been approved has no commitment yet, so it cannot have breached one.
function computeExceededSla(slaDeadline, completedAt = null) {
  if (!slaDeadline) return false;
  const ref = completedAt || new Date();
  return ref.getTime() > new Date(slaDeadline).getTime();
}

module.exports = {
  getSlaMinutes, addMinutes, computeExceededSla, computeSlaDeadline, loadCalendar,
};
