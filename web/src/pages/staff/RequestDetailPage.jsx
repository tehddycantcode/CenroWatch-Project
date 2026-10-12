import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { REQUEST_STATUSES, fmtDate, fmtDay, useSectionBase, isBreached } from '@/lib/staff';
import { CHART_COLORS } from '@/components/admin/chart-colors';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';
import StatusUpdateForm from '@/components/staff/StatusUpdateForm';
import StatusHistory from '@/components/staff/StatusHistory';
import { Rows, ReporterCard, Attachment, LocationBlock, PrintReportButton, ArchiveControl } from '@/components/staff/detail';

const todayStr = () => new Date().toLocaleDateString('en-CA');

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
      <div className="flex items-center justify-between gap-4">
        <Link to={`${base}/requests`} className="text-sm font-medium text-primary hover:underline">← Requests</Link>
        <PrintReportButton download={staffApi.requests.downloadReport} id={id} />
      </div>

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
                {isBreached(q) && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">SLA past due</span>}
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
              {q.document_path && <Attachment path={q.document_path} paths={q.document_paths} label="Documents" />}
              {q.photo_path && <Attachment path={q.photo_path} paths={q.photo_paths} label="Photos" />}
              {q.completion_proof_path && <Attachment path={q.completion_proof_path} label="Proof of delivery" />}
            </div>
            <LocationBlock
              marker={{
                id: q.tracking_id,
                kind: 'request',
                category: q.request_type,
                status: q.status,
                barangay: q.barangay?.name,
                latitude: q.latitude,
                longitude: q.longitude,
                color: CHART_COLORS.requests,
              }}
              address={q.address_details}
            />
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
                { name: 'scheduled_date', label: 'Scheduled date', type: 'date', min: todayStr(), visibleFor: ['Scheduled'], hint: 'When the service will be carried out. Cannot be in the past.' },
                // Required only when the record has no proof yet. The API
                // accepts a stored one (`input || existing`), so a stricter form
                // would block adding a note to an already-closed request without
                // re-uploading.
                { name: 'completion_proof', label: 'Proof of delivery', type: 'file', required: !q.completion_proof_path, visibleFor: ['Completed'], hint: q.completion_proof_path ? 'A photo is already attached. Upload another only to replace it.' : 'A photo showing the service was delivered. Required before this request can be Completed.' },
              ]}
              onSubmit={async (payload) => { await staffApi.requests.updateStatus(id, payload); load(); }}
            />
            <div className="mt-4 border-t pt-4">
              <ArchiveControl
                kind="requests"
                id={id}
                archivedAt={q.archived_at}
                archiveReason={q.archive_reason}
                onChanged={load}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
