// Staff workflow metadata — the valid status values per report kind, used by the
// queue filters and the status-update dropdowns. Keep in sync with the Prisma
// enums and backend/src/validators/staff.validators.js.

export const COMPLAINT_STATUSES = ['Pending', 'Under_Review', 'In_Progress', 'Resolved', 'Rejected'];
export const WILDLIFE_STATUSES = ['Pending_Review', 'Priority_Review', 'Under_Care', 'Released', 'Transferred', 'Deceased'];
export const REQUEST_STATUSES = ['Pending', 'Approved', 'Scheduled', 'Completed', 'Rejected'];

export const KIND_META = {
  complaint: { label: 'Complaint', plural: 'Complaints', statuses: COMPLAINT_STATUSES, base: '/staff/complaints' },
  wildlife: { label: 'Wildlife', plural: 'Wildlife', statuses: WILDLIFE_STATUSES, base: '/staff/wildlife' },
  request: { label: 'Service Request', plural: 'Requests', statuses: REQUEST_STATUSES, base: '/staff/requests' },
};

export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');
export const fmtDay = (d) => (d ? new Date(d).toLocaleDateString() : '—');

// Compact relative time ("just now", "8m ago", "3h ago", "9d ago"). Used in the
// queue tables; pair with a title={fmtDate(d)} tooltip for the exact timestamp.
export function fmtRelative(d) {
  if (!d) return '—';
  const sec = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
