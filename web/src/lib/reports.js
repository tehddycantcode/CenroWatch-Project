// Shared report metadata: enum options (value/label), status styling, and the
// tracking-id → report-kind mapping. Keep in sync with the Prisma enums.

export const COMPLAINT_TYPES = [
  { value: 'Illegal_Dumping', label: 'Illegal Dumping' },
  { value: 'Open_Burning', label: 'Open Burning' },
  { value: 'Noise_Disturbance', label: 'Noise Disturbance' },
  { value: 'Improper_Hazardous_Waste_Storage', label: 'Improper Hazardous Waste Storage' },
  { value: 'Drainage_Blockage', label: 'Drainage Blockage' },
  { value: 'Air_Pollution', label: 'Air Pollution' },
  { value: 'Water_Pollution', label: 'Water Pollution' },
  { value: 'Other', label: 'Other' },
];

export const ANIMAL_CONDITIONS = [
  { value: 'Healthy', label: 'Healthy' },
  { value: 'Injured', label: 'Injured' },
  { value: 'Sick', label: 'Sick' },
  { value: 'Dead', label: 'Dead' },
];

export const REQUEST_TYPES = [
  { value: 'Garbage_Hauling', label: 'Garbage Hauling' },
  { value: 'Creek_River_Cleaning', label: 'Creek / River Cleaning' },
  { value: 'Seedling_Distribution', label: 'Seedling Distribution' },
  { value: 'Environmental_Education', label: 'Environmental Education' },
  { value: 'Other_Service', label: 'Other Service' },
];

// Human-friendly label for any enum value ("Open_Burning" -> "Open Burning").
export function humanize(value) {
  return value ? String(value).replace(/_/g, ' ') : '';
}

// Three-stage lifecycle (adviser model: input -> process -> output). Every
// status belongs to one stage, and badge COLOR encodes the stage everywhere:
//   Submitted (amber)  - filed, staff have not acknowledged it yet
//   Under review (blue) - staff acknowledged / actively working
//   Finished (green)    - closed with an outcome
// Rejected/Deceased are terminal exceptions: they keep a red badge with their
// own label (self-explanatory), and count as closed. Staff surfaces keep the
// precise status label; resident surfaces show the stage label (StatusBadge
// `stage` prop). The DB enum is untouched - this is presentation only.
const STAGE_REVIEW = ['Under_Review', 'In_Progress', 'Scheduled', 'Under_Care', 'Approved'];
const STAGE_FINISHED = ['Resolved', 'Completed', 'Released', 'Transferred'];
const STAGE_CLOSED = ['Rejected', 'Deceased'];

export function statusStage(status) {
  if (STAGE_REVIEW.includes(status)) return { key: 'review', label: 'Under review' };
  if (STAGE_FINISHED.includes(status)) return { key: 'finished', label: 'Finished' };
  if (STAGE_CLOSED.includes(status)) return { key: 'closed', label: humanize(status) };
  // Pending / Pending_Review / Priority_Review and anything new
  return { key: 'submitted', label: 'Submitted' };
}

export function statusTone(status) {
  const stage = statusStage(status).key;
  if (stage === 'review') return 'blue';
  if (stage === 'finished') return 'green';
  if (stage === 'closed') return 'red';
  return 'amber'; // submitted and anything new
}

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
