import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { COMPLAINT_STATUSES, fmtDate, useSectionBase } from '@/lib/staff';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';
import StatusUpdateForm from '@/components/staff/StatusUpdateForm';
import StatusHistory from '@/components/staff/StatusHistory';
import { Rows, ReporterCard, Attachment, LocationBlock, PrintReportButton, ArchiveControl } from '@/components/staff/detail';
import { CHART_COLORS } from '@/components/admin/chart-colors';

export default function ComplaintDetailPage() {
  const { id } = useParams();
  const base = useSectionBase();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    staffApi.complaints.get(id).then((r) => setC(r.data.complaint)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!c) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link to={`${base}/complaints`} className="text-sm font-medium text-primary hover:underline">← Complaints</Link>
        <PrintReportButton download={staffApi.complaints.downloadReport} id={id} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Complaint · {c.tracking_id}</div>
                <h1 className="mt-1 font-display text-2xl">{humanize(c.complaint_type)}</h1>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={c.status} />
                {c.is_anonymous && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">Anonymous</span>}
                {c.exceeded_sla && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">SLA past due</span>}
              </div>
            </div>

            <div className="mt-6">
              <Rows rows={[
                ['Barangay', c.barangay?.name],
                ['Priority', c.priority ? 'Yes' : 'No'],
                ['Assigned to', c.assigned_staff ? `${c.assigned_staff.first_name} ${c.assigned_staff.last_name}` : 'Unassigned'],
                ['Filed', fmtDate(c.submitted_at)],
                ['Date observed', c.observed_at ? fmtDate(c.observed_at) : '—'],
                ['SLA deadline', fmtDate(c.sla_deadline)],
                ['Resolved', fmtDate(c.resolved_at)],
              ]} />
            </div>

            <div className="mt-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{c.description}</p>
            </div>
            <LocationBlock
              marker={{
                id: c.tracking_id,
                kind: 'complaint',
                category: c.complaint_type,
                status: c.status,
                barangay: c.barangay?.name,
                latitude: c.latitude,
                longitude: c.longitude,
                color: CHART_COLORS.complaints,
              }}
              address={c.address_details}
            />

            {c.resolution_notes && (
              <div className="mt-6 rounded-lg bg-accent/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Resolution notes</div>
                <p className="mt-1 text-sm text-foreground">{c.resolution_notes}</p>
              </div>
            )}

            <div className="mt-6 space-y-6">
              {c.logged_by ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Walk-in report</div>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      {humanize(c.received_via || 'Walk_In')}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Reporter: </span>
                      <span className="font-medium text-foreground">
                        {c.is_anonymous ? 'Anonymous walk-in' : c.reporter_name || 'Not recorded'}
                      </span>
                    </div>
                    {!c.is_anonymous && c.reporter_contact && (
                      <div>
                        <span className="text-muted-foreground">Contact: </span>
                        <span className="text-foreground">{c.reporter_contact}</span>
                      </div>
                    )}
                    {c.logged_by_staff && (
                      <div>
                        <span className="text-muted-foreground">Logged by: </span>
                        <span className="text-foreground">{c.logged_by_staff.first_name} {c.logged_by_staff.last_name}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : c.is_anonymous ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Reporter</div>
                  <div className="mt-1 font-medium text-foreground">Anonymous (whistleblower)</div>
                  <p className="text-sm text-muted-foreground">
                    No identity was collected. CENRO cannot contact this reporter; status updates are not emailed.
                  </p>
                </div>
              ) : (
                <ReporterCard user={c.user} />
              )}
              {c.photo_path && <Attachment path={c.photo_path} />}
            </div>
          </Card>

          {/* Status history */}
          <StatusHistory history={c.status_history} />
        </div>

        {/* Actions */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Update status</h2>
            <StatusUpdateForm
              statuses={COMPLAINT_STATUSES}
              current={c.status}
              extraFields={[
                { name: 'resolution_notes', label: 'Resolution notes', type: 'textarea', visibleFor: ['Resolved'], hint: 'Recorded on the complaint.' },
              ]}
              onSubmit={async (payload) => { await staffApi.complaints.updateStatus(id, payload); load(); }}
            />
          </Card>

          <Card className="p-6">
            <h2 className="mb-3 text-lg font-semibold">Triage</h2>
            <Button
              variant={c.priority ? 'outline' : 'default'}
              onClick={async () => { await staffApi.complaints.update(id, { priority: !c.priority }); load(); }}
            >
              {c.priority ? 'Remove priority flag' : 'Flag as priority'}
            </Button>
            <div className="mt-4 border-t pt-4">
              <ArchiveControl
                kind="complaints"
                id={id}
                archivedAt={c.archived_at}
                archiveReason={c.archive_reason}
                onChanged={load}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
