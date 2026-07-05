import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { REQUEST_STATUSES, fmtDate, fmtDay, useSectionBase } from '@/lib/staff';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';
import StatusUpdateForm from '@/components/staff/StatusUpdateForm';
import StatusHistory from '@/components/staff/StatusHistory';
import { Rows, ReporterCard, Attachment } from '@/components/staff/detail';

export default function RequestDetailPage() {
  const { id } = useParams();
  const base = useSectionBase();
  const [q, setQ] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    staffApi.requests.get(id).then((r) => setQ(r.data.request)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!q) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  return (
    <div className="space-y-6">
      <Link to={`${base}/requests`} className="text-sm font-medium text-primary hover:underline">← Requests</Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Service Request · {q.tracking_id}</div>
                <h1 className="mt-1 font-display text-2xl">{humanize(q.request_type)}</h1>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={q.status} />
                {q.exceeded_sla && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">SLA past due</span>}
              </div>
            </div>

            <div className="mt-6">
              <Rows rows={[
                ['Barangay', q.barangay?.name],
                ['Quantity', q.requested_quantity],
                ['Preferred date', fmtDay(q.preferred_schedule)],
                ['Scheduled', fmtDate(q.scheduled_date)],
                ['Completed', fmtDate(q.completion_date)],
                ['Submitted', fmtDate(q.submitted_at)],
                ['SLA deadline', fmtDate(q.sla_deadline)],
                ['CENRO-head approved', q.approved_by_cenro_head ? 'Yes' : 'No'],
                ['Processed by', q.processor ? `${q.processor.first_name} ${q.processor.last_name}` : '—'],
              ]} />
            </div>

            <div className="mt-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{q.description}</p>
            </div>

            {q.staff_notes && (
              <div className="mt-6 rounded-lg bg-accent/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Staff notes</div>
                <p className="mt-1 text-sm text-foreground">{q.staff_notes}</p>
              </div>
            )}

            <div className="mt-6 space-y-6">
              <ReporterCard user={q.user} />
              {q.document_path && <Attachment path={q.document_path} />}
            </div>
          </Card>

          <StatusHistory history={q.status_history} />
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Update status</h2>
            <StatusUpdateForm
              statuses={REQUEST_STATUSES}
              current={q.status}
              extraFields={[
                { name: 'scheduled_date', label: 'Scheduled date', type: 'date', visibleFor: ['Scheduled'], hint: 'When the service will be carried out.' },
              ]}
              onSubmit={async (payload) => { await staffApi.requests.updateStatus(id, payload); load(); }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
