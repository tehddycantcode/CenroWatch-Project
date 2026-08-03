// Human-facing metadata for the System Settings screen. The API stores raw
// keys and minute values; this map is what turns "complaint_sla_minutes: 3365"
// into something an administrator can understand and trust.
//
// Unknown keys are not an error: the page falls back to the raw key, so a
// setting seeded later still appears and stays editable.

export const SETTING_GROUPS = [
  {
    id: 'sla',
    title: 'Response time targets',
    blurb:
      'How long CENRO has to act on each kind of report. The deadline is stamped on a report when it is filed, and drives the SLA badges and the compliance figures on the dashboard.',
  },
  {
    id: 'other',
    title: 'Other settings',
    blurb: 'Values that do not belong to a group above.',
  },
];

export const SETTING_META = {
  complaint_sla_minutes: {
    group: 'sla',
    label: 'Complaint response deadline',
    description: 'Applies to every environmental complaint filed by a resident or logged as a walk-in.',
  },
  wildlife_sla_minutes: {
    group: 'sla',
    label: 'Wildlife turnover deadline',
    description: 'Applies to wildlife sightings and turnovers, including endangered species flagged for priority review.',
  },
  request_seedling_sla_minutes: {
    group: 'sla',
    label: 'Seedling request deadline',
    description: 'Applies to seedling distribution requests.',
  },
  request_env_education_sla_minutes: {
    group: 'sla',
    label: 'Environmental education request deadline',
    description: 'Applies to requests for environmental education activities.',
  },
};

export function metaFor(key) {
  return SETTING_META[key] || { group: 'other', label: key, description: '' };
}

// Minutes are the storage unit. Administrators think in days and hours, so the
// editor works in whichever unit divides cleanly and converts back on save.
export const UNITS = [
  { id: 'minutes', label: 'minutes', factor: 1 },
  { id: 'hours', label: 'hours', factor: 60 },
  { id: 'days', label: 'days', factor: 1440 },
];

// Pick the largest unit that represents the value without a remainder.
export function bestUnit(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return UNITS[0];
  if (m % 1440 === 0) return UNITS[2];
  if (m % 60 === 0) return UNITS[1];
  return UNITS[0];
}

// "3365" -> "2 days 8 hours 5 minutes"
export function humanDuration(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 0) return null;
  if (m === 0) return '0 minutes';
  const parts = [];
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d) parts.push(`${d} ${d === 1 ? 'day' : 'days'}`);
  if (h) parts.push(`${h} ${h === 1 ? 'hour' : 'hours'}`);
  if (min) parts.push(`${min} ${min === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
}

// The concrete effect of the current value, so the setting is visibly live.
export function deadlinePreview(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return null;
  return new Date(Date.now() + m * 60000).toLocaleString();
}

export const isSlaKey = (key) => key.endsWith('_minutes');
