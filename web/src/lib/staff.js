// Staff workflow metadata — the valid status values per report kind, used by the
// queue filters and the status-update dropdowns. Keep in sync with the Prisma
// enums and backend/src/validators/staff.validators.js.

import { useLocation } from 'react-router-dom';

// The current app section prefix — '/admin' or '/staff'. The complaint / wildlife
// / request queue and detail pages are shared: Staff reaches them under /staff and
// Admin under /admin. Links must stay within the current section, otherwise an
// Admin row-click navigates to a /staff route and the whole app flips into the
// Staff layout (and vice-versa). Use this to build in-section links.
export function useSectionBase() {
  const { pathname } = useLocation();
  return pathname.startsWith('/admin') ? '/admin' : '/staff';
}

export const COMPLAINT_STATUSES = ['Pending', 'Under_Review', 'Approved', 'In_Progress', 'Resolved', 'Rejected'];
export const WILDLIFE_STATUSES = ['Pending_Review', 'Priority_Review', 'Under_Care', 'Released', 'Transferred', 'Deceased'];
export const REQUEST_STATUSES = ['Pending', 'Approved', 'Scheduled', 'Completed', 'Rejected'];

export const KIND_META = {
  complaint: { label: 'Complaint', plural: 'Complaints', statuses: COMPLAINT_STATUSES, base: '/staff/complaints' },
  wildlife: { label: 'Wildlife', plural: 'Wildlife', statuses: WILDLIFE_STATUSES, base: '/staff/wildlife' },
  request: { label: 'Service Request', plural: 'Requests', statuses: REQUEST_STATUSES, base: '/staff/requests' },
};

// Has this report actually breached its SLA?
//
// exceeded_sla is a CACHE: it is recomputed only when staff change a status, and
// there is no scheduled job, so an open report that quietly sailed past its
// deadline still reads false in the database. Trusting the stored flag alone
// would print "on time" on a report shown as overdue elsewhere on the same
// screen. The dashboards already compensate with a live sla_deadline < now
// query; this puts the badges on the same footing.
//
// A null deadline is not a breach: the clock has not started yet.
export const isBreached = (r) =>
  Boolean(r?.exceeded_sla) || Boolean(r?.sla_deadline && new Date(r.sla_deadline) < new Date());

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
