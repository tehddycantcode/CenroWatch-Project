import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { REQUEST_STATUSES, fmtDate, fmtRelative } from '@/lib/staff';
import StaffQueue from '@/components/staff/StaffQueue';
import { StatusBadge } from '@/components/ui/badge';

const columns = [
  { header: 'Tracking', render: (r) => <span className="font-mono text-xs">{r.tracking_id}</span> },
  { header: 'Service', render: (r) => humanize(r.request_type) },
  { header: 'Qty', render: (r) => r.requested_quantity ?? '—' },
  { header: 'Barangay', render: (r) => r.barangay?.name || '—' },
  { header: 'Reporter', render: (r) => `${r.user?.first_name || ''} ${r.user?.last_name || ''}`.trim() || '—' },
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

export default function RequestsQueuePage() {
  return (
    <StaffQueue
      title="Service Requests"
      subtitle="Review, approve, and schedule resident service requests"
      kind="request"
      resource={staffApi.requests}
      statuses={REQUEST_STATUSES}
      columns={columns}
      rowKey={(r) => r.request_id}
      rowLink={(r) => `/staff/requests/${r.tracking_id}`}
    />
  );
}
