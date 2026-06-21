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
