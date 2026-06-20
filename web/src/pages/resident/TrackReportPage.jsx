import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { complaintApi, wildlifeApi, requestApi, fileUrl } from '@/lib/api';
import { trackingKind, KIND, humanize } from '@/lib/reports';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/icons';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

function buildView(kind, d) {
  if (kind === 'complaint') {
    return {
      id: d.tracking_id,
      title: humanize(d.complaint_type),
      media: d.photo_path,
      rows: [
        ['Type', humanize(d.complaint_type)],
        ['Barangay', d.barangay?.name],
        ['Priority', d.priority ? 'Yes' : 'No'],
        ['Submitted', fmt(d.submitted_at)],
        ['SLA deadline', fmt(d.sla_deadline)],
        ['Resolved', fmt(d.resolved_at)],
      ],
      notes: d.resolution_notes || d.staff_notes,
      ...d,
    };
  }
  if (kind === 'wildlife') {
    return {
      id: d.reference_id,
      title: d.species_name,
      media: d.photo_path,
      rows: [
        ['Species', d.species_name],
        ['Category', d.species_category || '—'],
        ['Condition', humanize(d.animal_condition)],
        ['Endangered', d.is_endangered ? 'Yes (priority review)' : 'No'],
        ['Barangay', d.barangay?.name],
        ['Submitted', fmt(d.submitted_at)],
        ['SLA deadline', fmt(d.sla_deadline)],
      ],
      notes: d.staff_notes,
      ...d,
    };
  }
  return {
    id: d.tracking_id,
    title: humanize(d.request_type),
    media: d.document_path,
    rows: [
      ['Service', humanize(d.request_type)],
      ['Barangay', d.barangay?.name],
      ['Quantity', d.requested_quantity ?? '—'],
      ['Preferred date', d.preferred_schedule ? new Date(d.preferred_schedule).toLocaleDateString() : '—'],
      ['Scheduled', fmt(d.scheduled_date)],
      ['Submitted', fmt(d.submitted_at)],
      ['SLA deadline', fmt(d.sla_deadline)],
    ],
    notes: d.staff_notes,
    ...d,
  };
}

export default function TrackReportPage() {
  const { trackingId } = useParams();
  const kind = trackingKind(trackingId);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchers = {
      complaint: () => complaintApi.get(trackingId).then((r) => r.data.complaint),
      wildlife: () => wildlifeApi.get(trackingId).then((r) => r.data.turnover),
      request: () => requestApi.get(trackingId).then((r) => r.data.request),
    };
    if (!kind) {
      setError('Unrecognized tracking number.');
      return;
    }
    fetchers[kind]()
      .then((d) => setView(buildView(kind, d)))
      .catch((e) => setError(e.message));
  }, [trackingId, kind]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-8 text-center">
          <p className="text-destructive">{error}</p>
          <Link to="/resident/my-reports" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
            ← Back to My Reports
          </Link>
        </Card>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7 text-primary" />
      </div>
    );
  }

  const mediaUrl = fileUrl(view.media);
  const isPdf = view.media && /\.pdf$/i.test(view.media);
  const hasGeo = view.latitude != null && view.longitude != null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to="/resident/my-reports" className="text-sm font-medium text-primary hover:underline">
        ← My Reports
      </Link>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {KIND[kind].label} · {view.id}
            </div>
            <h1 className="mt-1 font-display text-2xl">{view.title}</h1>
          </div>
          <StatusBadge status={view.status} />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4">
          {view.rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm text-foreground">{value || '—'}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{view.description}</p>
        </div>

        {hasGeo && (
          <div className="mt-4 text-sm text-muted-foreground">
            📍 {view.latitude}, {view.longitude}
          </div>
        )}

        {view.notes && (
          <div className="mt-6 rounded-lg bg-accent/50 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">CENRO notes</div>
            <p className="mt-1 text-sm text-foreground">{view.notes}</p>
          </div>
        )}

        {mediaUrl && (
          <div className="mt-6">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Attachment</div>
            {isPdf ? (
              <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                View document (PDF)
              </a>
            ) : (
              <img src={mediaUrl} alt="attachment" className="max-h-80 rounded-lg border" />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
