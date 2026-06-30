import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { COMPLAINT_STATUSES, fmtDate, fmtRelative } from '@/lib/staff';
import StaffQueue from '@/components/staff/StaffQueue';
import { StatusBadge } from '@/components/ui/badge';

const columns = [
  {
    header: 'Tracking',
    render: (r) => (
      <span className="font-mono text-xs">
        {r.tracking_id}
        {r.priority && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">PRIORITY</span>}
      </span>
    ),
  },
  { header: 'Type', render: (r) => humanize(r.complaint_type) },
  { header: 'Barangay', render: (r) => r.barangay?.name || '—' },
  {
    header: 'Reporter',
    render: (r) =>
      r.is_anonymous ? (
        <span className="italic text-muted-foreground">Anonymous</span>
      ) : (
        `${r.user?.first_name || ''} ${r.user?.last_name || ''}`.trim() || '—'
      ),
  },
  {
    header: 'Submitted',
    render: (r) => (
      <span className="whitespace-nowrap text-muted-foreground" title={fmtDate(r.submitted_at)}>
        {fmtRelative(r.submitted_at)}
      </span>
    ),
  },
  {
    header: 'Status',
    render: (r) => (
      <span className="flex items-center gap-2">
        <StatusBadge status={r.status} />
        {r.exceeded_sla && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">SLA</span>}
      </span>
    ),
  },
];

export default function ComplaintsQueuePage() {
  return (
    <StaffQueue
      title="Complaints"
      subtitle="Triage and resolve resident environmental complaints"
      kind="complaint"
      resource={staffApi.complaints}
      statuses={COMPLAINT_STATUSES}
      columns={columns}
      rowKey={(r) => r.complaint_id}
      rowLink={(r) => `/staff/complaints/${r.tracking_id}`}
    />
  );
}
