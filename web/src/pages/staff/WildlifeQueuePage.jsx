import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { WILDLIFE_STATUSES, fmtDate, fmtRelative } from '@/lib/staff';
import StaffQueue from '@/components/staff/StaffQueue';
import { StatusBadge } from '@/components/ui/badge';

const columns = [
  {
    header: 'Reference',
    render: (r) => (
      <span className="font-mono text-xs">
        {r.reference_id}
        {r.is_endangered && <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">ENDANGERED</span>}
      </span>
    ),
  },
  { header: 'Species', render: (r) => r.species_name },
  { header: 'Condition', render: (r) => humanize(r.animal_condition) },
  { header: 'Barangay', render: (r) => r.barangay?.name || '—' },
  { header: 'Reporter', render: (r) => `${r.resident?.first_name || ''} ${r.resident?.last_name || ''}`.trim() || '—' },
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

export default function WildlifeQueuePage() {
  return (
    <StaffQueue
      title="Wildlife Turnovers"
      subtitle="Process turnovers — endangered species get priority"
      kind="wildlife"
      resource={staffApi.wildlife}
      statuses={WILDLIFE_STATUSES}
      columns={columns}
      rowKey={(r) => r.turnover_id}
      rowLink={(r) => `/staff/wildlife/${r.reference_id}`}
    />
  );
}
