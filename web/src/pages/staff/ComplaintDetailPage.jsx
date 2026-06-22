import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { COMPLAINT_STATUSES, fmtDate } from '@/lib/staff';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';
import StatusUpdateForm from '@/components/staff/StatusUpdateForm';
import { Rows, ReporterCard, Attachment } from '@/components/staff/detail';

export default function ComplaintDetailPage() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    staffApi.complaints.get(id).then((r) => setC(r.data.complaint)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!c) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const hasGeo = c.latitude != null && c.longitude != null;

  return (
    <div className="space-y-6">
      <Link to="/staff/complaints" className="text-sm font-medium text-primary hover:underline">← Complaints</Link>

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
                ['Submitted', fmtDate(c.submitted_at)],
                ['SLA deadline', fmtDate(c.sla_deadline)],
                ['Resolved', fmtDate(c.resolved_at)],
              ]} />
            </div>

            <div className="mt-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{c.description}</p>
            </div>
            {hasGeo && <div className="mt-4 text-sm text-muted-foreground">📍 {c.latitude}, {c.longitude}</div>}
            {c.address_details && <div className="mt-1 text-sm text-muted-foreground">{c.address_details}</div>}

            {c.resolution_notes && (
              <div className="mt-6 rounded-lg bg-accent/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Resolution notes</div>
                <p className="mt-1 text-sm text-foreground">{c.resolution_notes}</p>
              </div>
            )}

            <div className="mt-6 space-y-6">
              {c.is_anonymous ? (
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
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Status history</h2>
            {(!c.status_history || c.status_history.length === 0) ? (
              <p className="mt-2 text-sm text-muted-foreground">No status changes yet.</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {c.status_history.map((h) => (
                  <li key={h.id} className="border-l-2 border-primary/30 pl-4">
                    <div className="flex items-center gap-2 text-sm">
                      <StatusBadge status={h.old_status} />
                      <span className="text-muted-foreground">→</span>
                      <StatusBadge status={h.new_status} />
                    </div>
                    {h.note && <p className="mt-1 text-sm text-foreground">{h.note}</p>}
                    <div className="mt-0.5 text-xs text-muted-foreground">{fmtDate(h.changed_at)}</div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
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
          </Card>
        </div>
      </div>
    </div>
  );
}
