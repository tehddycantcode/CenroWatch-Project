// Shared report metadata: enum options (value/label), status styling, and the
// tracking-id → report-kind mapping. Mirrors web/src/lib/reports.js and the
// Prisma enums — keep the values in sync with the backend validators.

// COMPLAINT_TYPES and REQUEST_TYPES lived here as frozen arrays, hand-synced
// with a Prisma enum and the web copy. They are admin-managed rows now: fetch
// them with useCategories(). ANIMAL_CONDITIONS stays hardcoded because it is
// still a real enum describing an animal's clinical state, not a filing
// category an office should redefine.

export const ANIMAL_CONDITIONS = [
  { value: 'Healthy', label: 'Healthy' },
  { value: 'Injured', label: 'Injured' },
  { value: 'Sick', label: 'Sick' },
  { value: 'Dead', label: 'Dead' },
];

// WILDLIFE_SPECIES has been REMOVED. Species come from GET /species now (see
// lib/useSpecies.js), so adding one no longer needs an app release, and the
// category and endangered flag are derived server-side from the catalogue rather
// than from this array's `group` field and a resident's checkbox.

// Human-friendly label for any enum value ("Open_Burning" -> "Open Burning").
export function humanize(value) {
  return value ? String(value).replace(/_/g, ' ') : '';
}

// Three-stage lifecycle (adviser model: input -> process -> output). Mirrors
// web/src/lib/reports.js - keep in sync. Every status belongs to one stage and
// badge COLOR encodes the stage: Submitted (amber), Under review (blue),
// Finished (green). Rejected/Deceased are terminal exceptions: red badge with
// their own label. The DB enum is untouched - presentation only.
const STAGE_REVIEW = ['Under_Review', 'In_Progress', 'Scheduled', 'Under_Care', 'Approved'];
const STAGE_FINISHED = ['Resolved', 'Completed', 'Released', 'Transferred'];
const STAGE_CLOSED = ['Rejected', 'Deceased'];

const TONES = {
  green: { bg: '#dcfce7', fg: '#15803d' },
  blue: { bg: '#dbeafe', fg: '#1d4ed8' },
  red: { bg: '#fee2e2', fg: '#b91c1c' },
  amber: { bg: '#fef3c7', fg: '#b45309' },
};

export function statusStage(status) {
  if (STAGE_REVIEW.includes(status)) return { key: 'review', label: 'Under review' };
  if (STAGE_FINISHED.includes(status)) return { key: 'finished', label: 'Finished' };
  if (STAGE_CLOSED.includes(status)) return { key: 'closed', label: humanize(status) };
  // Pending / Pending_Review / Priority_Review and anything new
  return { key: 'submitted', label: 'Submitted' };
}

export function statusTone(status) {
  const stage = statusStage(status).key;
  if (stage === 'review') return TONES.blue;
  if (stage === 'finished') return TONES.green;
  if (stage === 'closed') return TONES.red;
  return TONES.amber; // submitted and anything new
}

// Kind identity colors, shared with the web app (complaint amber, wildlife
// violet, request green). These say WHAT a report is; the status tones above
// say WHERE it is. Keeping the two palettes separate is deliberate - a resident
// should never have to work out whether a color means type or progress.
export const KIND_TONES = {
  complaint: { bg: '#fef3c7', fg: '#b45309' },
  wildlife: { bg: '#ede9fe', fg: '#6d28d9' },
  request: { bg: '#dcfce7', fg: '#15803d' },
};

// The three things a resident can file. One list, used by the dashboard cards
// and the Report button's sheet, so the two can never offer different options.
// `kind` doubles as the navigator screen name and as the ACTION_TL key.
// `icon` is an Ionicons name, rendered through components/Icon.
export const REPORT_ACTIONS = [
  {
    kind: 'complaint',
    icon: 'trash-outline',
    title: 'Report a Complaint',
    desc: 'Illegal dumping, burning, noise, pollution…',
  },
  {
    kind: 'wildlife',
    icon: 'paw-outline',
    title: 'Wildlife Turnover',
    desc: 'Report or turn over rescued wildlife.',
  },
  {
    kind: 'request',
    icon: 'leaf-outline',
    title: 'Request a Service',
    desc: 'Seedlings, hauling, creek cleaning…',
  },
];

// The three report kinds, keyed by tracking-id prefix.
export const KIND = {
  complaint: { label: 'Complaint', prefix: 'CMP', idField: 'tracking_id' },
  wildlife: { label: 'Wildlife', prefix: 'WLD', idField: 'reference_id' },
  request: { label: 'Service Request', prefix: 'REQ', idField: 'tracking_id' },
};

export function trackingKind(id = '') {
  if (id.startsWith('CMP')) return 'complaint';
  if (id.startsWith('WLD')) return 'wildlife';
  if (id.startsWith('REQ')) return 'request';
  return null;
}
