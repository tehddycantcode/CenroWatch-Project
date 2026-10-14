import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPin, ArrowLeft, Download, FileCheck2 } from 'lucide-react';
import { complaintApi, wildlifeApi, requestApi, fileUrl, isPdfPath } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { trackingKind, KIND, humanize, turnoverMethodLabel } from '@/lib/reports';
import { KIND_TL, COPY_TL } from '@/lib/tagalog';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { StatusTimeline } from '@/components/resident/StatusTimeline';
import { ReportUpdates } from '@/components/resident/ReportUpdates';
import FeedbackForm from '@/components/resident/FeedbackForm';
import { Spinner } from '@/components/ui/icons';

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

// Keyed by the same `kind` the tracking number resolves to, so the button can
// never ask the wrong endpoint for a reference it will not recognise.
const DOWNLOADERS = {
  complaint: (ref) => complaintApi.downloadReport(ref),
  wildlife: (ref) => wildlifeApi.downloadReport(ref),
  request: (ref) => requestApi.downloadReport(ref),
};

// Keyed the same way, so the feedback form can never be pointed at the wrong
// endpoint for the reference it is showing.
const FEEDBACK_APIS = {
  complaint: complaintApi.feedback,
  wildlife: wildlifeApi.feedback,
  request: requestApi.feedback,
};

function buildView(kind, d) {
  if (kind === 'complaint') {
    return {
      id: d.tracking_id,
      title: humanize(d.complaint_type),
      media: d.photo_path,
      mediaAll: d.photo_paths,
      rows: [
        ['Type', humanize(d.complaint_type)],
        ['Barangay', d.barangay?.name],
        ['Priority', d.priority ? 'Yes' : 'No'],
        ['Submitted', fmt(d.submitted_at)],
        ...(d.observed_at ? [['Date observed', fmt(d.observed_at)]] : []),
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
      mediaAll: d.photo_paths,
      rows: [
        ['Species', d.species_name],
        ['Category', d.species_category || '—'],
        ['Condition', humanize(d.animal_condition)],
        // Shown back to the reporter because it is the one row here that is a
        // commitment THEY made - someone who said they would walk the animal in
        // needs to be able to check that is still what the record says.
        ...(d.turnover_method ? [['Turnover method', turnoverMethodLabel(d.turnover_method)]] : []),
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
    mediaAll: d.document_paths,
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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

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
          <Link to="/resident/my-reports" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to My Reports
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

  // Every attached file, not just the first. The fallback to the single path
  // is load-bearing rather than defensive: every report filed before
  // multi-upload (2026-10-12) has a photo_path and a NULL photo_paths, so a
  // reader that only looked at the list would show nothing for the whole
  // existing archive.
  const mediaList = Array.isArray(view.mediaAll) && view.mediaAll.length
    ? view.mediaAll
    : (view.media ? [view.media] : []);
  const hasGeo = view.latitude != null && view.longitude != null;

  // Timestamps for the status timeline (only set when the source date exists).
  const times = {};
  if (view.submitted_at) times.Submitted = fmt(view.submitted_at);
  if (view.scheduled_date) times.Scheduled = fmt(view.scheduled_date);
  if (view.resolved_at) {
    const f = fmt(view.resolved_at);
    times.Resolved = f;
    times.Completed = f;
    times.Released = f;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/resident/my-reports" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          My Reports
        </Link>
        {/* The resident's own copy of their own case. It prints exactly what
            this page shows them - no staff notes beyond these, no SLA breach
            flag, no assignment - so downloading it can never reveal more than
            they are already looking at. */}
        <Button
          variant="outline"
          size="sm"
          loading={pdfBusy}
          onClick={async () => {
            setPdfBusy(true);
            setPdfError('');
            try {
              await DOWNLOADERS[kind](view.id);
            } catch (e) {
              setPdfError(e.message || 'Could not download the copy.');
            } finally {
              setPdfBusy(false);
            }
          }}
        >
          <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Download PDF copy
        </Button>
      </div>
      {pdfError && <p className="text-sm text-destructive">{pdfError}</p>}

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide tabular-nums text-muted-foreground">
              {KIND[kind].label} · {view.id}
            </div>
            <h1 className="mt-1 font-display text-2xl">{view.title}</h1>
            <div className="text-sm text-muted-foreground">{KIND_TL[kind]}</div>
          </div>
          <StatusBadge status={view.status} stage />
        </div>

        {/* One column on a phone: values like "Improper Hazardous Waste
            Storage" have nowhere to go in a 2-up grid at 320px. */}
        <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {view.rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm tabular-nums text-foreground">{value || '—'}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Description <span className="normal-case tracking-normal">/ {COPY_TL.description}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{view.description}</p>
        </div>

        {(hasGeo || view.address_details) && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Location</div>
            {view.address_details && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{view.address_details}</p>
            )}
            {hasGeo && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
                {view.latitude}, {view.longitude}
              </div>
            )}
          </div>
        )}

        {view.notes && (
          <div className="mt-6 rounded-lg bg-accent/50 p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              CENRO notes <span className="normal-case tracking-normal">/ {COPY_TL.cenroNotes}</span>
            </div>
            <p className="mt-1 text-sm text-foreground">{view.notes}</p>
          </div>
        )}

        {/* The staff-signed document that closes the case. Shown only when one
            has been filed - it is optional, because the signed paper often
            comes back from another office days after the work is done. */}
        {view.closure_certificate_path && (
          <div className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  Signed closure document{' '}
                  <span className="font-normal text-muted-foreground">/ {COPY_TL.signedDocument}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  CENRO Cabuyao has signed and filed the document for this case. Keep a copy for your records.
                </p>
                <a
                  href={view.closure_certificate_path}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {isPdfPath(view.closure_certificate_path) ? 'Download the signed document (PDF)' : 'Open the signed document'}
                </a>
              </div>
            </div>
          </div>
        )}

        {mediaList.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              {mediaList.length > 1 ? `Attachments (${mediaList.length})` : 'Attachment'}
            </div>
            <div className="flex flex-wrap items-start gap-3">
              {mediaList.map((m, i) => {
                const url = fileUrl(m);
                if (!url) return null;
                return isPdfPath(m) ? (
                  <a key={`${m}-${i}`} href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                    View document {mediaList.length > 1 ? i + 1 : ''} (PDF)
                  </a>
                ) : (
                  <a key={`${m}-${i}`} href={url} target="_blank" rel="noreferrer" title="Open full size">
                    <img src={url} alt={`attachment ${i + 1}`} className="max-h-80 rounded-lg img-outline" />
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Progress <span className="normal-case tracking-normal">/ {COPY_TL.progress}</span>
        </div>
        <div className="mt-4">
          <StatusTimeline kind={kind} status={view.status} times={times} />
        </div>

        {view.status_history?.length > 0 && (
          <div className="mt-6 border-t pt-5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Updates from CENRO{' '}
              <span className="normal-case tracking-normal">/ {COPY_TL.updatesFromCenro}</span>
            </div>
            <div className="mt-4">
              <ReportUpdates history={view.status_history} />
            </div>
          </div>
        )}

        {/* Renders nothing unless the server says this person may rate this
            case - owner, closed, not already rated. See FeedbackForm. */}
        <FeedbackForm api={FEEDBACK_APIS[kind]} reference={view.id} />
      </Card>
    </div>
  );
}
