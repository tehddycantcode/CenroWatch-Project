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

// Map a status to a badge color category.
const GREEN = ['Resolved', 'Completed', 'Released', 'Approved'];
const BLUE = ['Under_Review', 'In_Progress', 'Scheduled', 'Under_Care'];
const PURPLE = ['Priority_Review', 'Transferred'];
const RED = ['Rejected', 'Deceased'];

export function statusTone(status) {
  if (GREEN.includes(status)) return 'green';
  if (BLUE.includes(status)) return 'blue';
  if (PURPLE.includes(status)) return 'purple';
  if (RED.includes(status)) return 'red';
  return 'amber'; // Pending / Pending_Review and anything new
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
