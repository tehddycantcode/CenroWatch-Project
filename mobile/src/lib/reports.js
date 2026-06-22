// Shared report metadata: enum options (value/label), status styling, and the
// tracking-id → report-kind mapping. Mirrors web/src/lib/reports.js and the
// Prisma enums — keep the values in sync with the backend validators.

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

// Common wildlife species for the report dropdown. `value` is the species name
// submitted to the API (species_name is free text). `group` auto-fills the
// category. Mirrors web/src/lib/species.js; "__other__" reveals a free-text field.
export const WILDLIFE_SPECIES = [
  { value: 'Asian Palm Civet', label: 'Asian Palm Civet', group: 'Mammal' },
  { value: 'Asian Water Monitor', label: 'Asian Water Monitor', group: 'Reptile' },
  { value: 'Black-crowned Night Heron', label: 'Black-crowned Night Heron', group: 'Bird' },
  { value: 'Collared Kingfisher', label: 'Collared Kingfisher', group: 'Bird' },
  { value: 'Large Flying Fox', label: 'Large Flying Fox', group: 'Mammal' },
  { value: 'Philippine Cobra', label: 'Philippine Cobra', group: 'Reptile' },
  { value: 'Philippine Duck', label: 'Philippine Duck', group: 'Bird' },
  { value: 'Philippine Eagle-Owl', label: 'Philippine Eagle-Owl', group: 'Bird' },
  { value: 'Reticulated Python', label: 'Reticulated Python', group: 'Reptile' },
  { value: 'Southeast Asian Box Turtle', label: 'Southeast Asian Box Turtle', group: 'Reptile' },
  { value: '__other__', label: 'Other (specify)…' },
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

// Map a status to a badge color tone -> { bg, fg }.
const GREEN = ['Resolved', 'Completed', 'Released', 'Approved'];
const BLUE = ['Under_Review', 'In_Progress', 'Scheduled', 'Under_Care'];
const PURPLE = ['Priority_Review', 'Transferred'];
const RED = ['Rejected', 'Deceased'];

const TONES = {
  green: { bg: '#dcfce7', fg: '#15803d' },
  blue: { bg: '#dbeafe', fg: '#1d4ed8' },
  purple: { bg: '#ede9fe', fg: '#6d28d9' },
  red: { bg: '#fee2e2', fg: '#b91c1c' },
  amber: { bg: '#fef3c7', fg: '#b45309' },
};

export function statusTone(status) {
  if (GREEN.includes(status)) return TONES.green;
  if (BLUE.includes(status)) return TONES.blue;
  if (PURPLE.includes(status)) return TONES.purple;
  if (RED.includes(status)) return TONES.red;
  return TONES.amber; // Pending / Pending_Review and anything new
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
