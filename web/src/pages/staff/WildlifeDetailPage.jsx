import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '@/lib/api';
import { humanize } from '@/lib/reports';
import { WILDLIFE_STATUSES, fmtDate } from '@/lib/staff';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';
import StatusUpdateForm from '@/components/staff/StatusUpdateForm';
import StatusHistory from '@/components/staff/StatusHistory';
import { Rows, ReporterCard, Attachment } from '@/components/staff/detail';
import CustodyPhotos from '@/components/staff/CustodyPhotos';

export default function WildlifeDetailPage() {
  const { id } = useParams();
  const [w, setW] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    staffApi.wildlife.get(id).then((r) => setW(r.data.turnover)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!w) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const hasGeo = w.latitude != null && w.longitude != null;

  return (
    <div className="space-y-6">
      <Link to="/staff/wildlife" className="text-sm font-medium text-primary hover:underline">← Wildlife</Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Wildlife · {w.reference_id}</div>
                <h1 className="mt-1 font-display text-2xl">{w.species_name}</h1>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge status={w.status} />
                {w.is_endangered && <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">Endangered</span>}
                {w.exceeded_sla && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">SLA past due</span>}
              </div>
            </div>

            <div className="mt-6">
              <Rows rows={[
                ['Category', w.species_category],
                ['Condition', humanize(w.animal_condition)],
                ['Endangered', w.is_endangered ? 'Yes (priority review)' : 'No'],
                ['Barangay', w.barangay?.name],
                ['Submitted', fmtDate(w.submitted_at)],
                ['SLA deadline', fmtDate(w.sla_deadline)],
                ['Intake', fmtDate(w.intake_date)],
                ['Released', fmtDate(w.release_date)],
                ['Transfer to', w.transfer_destination],
                ['Processed by', w.staff ? `${w.staff.first_name} ${w.staff.last_name}` : '—'],
              ]} />
            </div>

            <div className="mt-6">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{w.description}</p>
            </div>
            {hasGeo && <div className="mt-4 text-sm text-muted-foreground">📍 {w.latitude}, {w.longitude}</div>}

            {w.staff_notes && (
              <div className="mt-6 rounded-lg bg-accent/50 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Staff notes</div>
                <p className="mt-1 text-sm text-foreground">{w.staff_notes}</p>
              </div>
            )}

            <div className="mt-6 space-y-6">
              <ReporterCard user={w.resident} />
              {w.photo_path && <Attachment path={w.photo_path} />}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold">Chain-of-custody documentation</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Photographic record of the animal&apos;s condition, handling, and transfer — kept for legal and
              conservation accountability.
            </p>
            <CustodyPhotos id={id} photos={w.chain_of_custody_photos || []} onChange={load} />
          </Card>

          <StatusHistory history={w.status_history} />
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 text-lg font-semibold">Update status</h2>
            <StatusUpdateForm
              statuses={WILDLIFE_STATUSES}
              current={w.status}
              extraFields={[
                { name: 'transfer_destination', label: 'Transfer destination', type: 'text', visibleFor: ['Transferred'], hint: 'e.g. DENR–CALABARZON, Wildlife Rescue Center' },
              ]}
              onSubmit={async (payload) => { await staffApi.wildlife.updateStatus(id, payload); load(); }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
