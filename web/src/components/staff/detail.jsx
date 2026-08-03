import { useState } from 'react';
import { MapPin, Printer, Archive, RotateCcw } from 'lucide-react';
import { fileUrl, adminApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import MapView from '@/components/MapView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/icons';

// Small presentational helpers shared by the three staff detail pages.

// Downloads the printable PDF of this report for CENRO hardcopy files.
// `download` is the matching staffApi resource method (e.g.
// staffApi.complaints.downloadReport).
export function PrintReportButton({ download, id }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setError('');
    setBusy(true);
    try {
      await download(id);
    } catch (e) {
      setError(e.message || 'Could not generate the PDF.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={run} disabled={busy}>
        {busy ? <Spinner className="h-4 w-4" /> : <Printer className="h-4 w-4" aria-hidden="true" />}
        Download PDF
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

// Where the resident pinned the report: coordinates + a mini-map with the pin
// (single marker, camera centered on it). Renders nothing without geo/address;
// requests never have coordinates, so only complaint/wildlife pages use this.
export function LocationBlock({ marker, address }) {
  const hasGeo = marker?.latitude != null && marker?.longitude != null;
  if (!hasGeo && !address) return null;
  return (
    <div className="mt-6">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Location</div>
      {address && <div className="mt-1 text-sm text-foreground">{address}</div>}
      {hasGeo && (
        <>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="tabular-nums">{marker.latitude}, {marker.longitude}</span>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg img-outline">
            <MapView markers={[marker]} fitToMarkers className="h-64 w-full" />
          </div>
        </>
      )}
    </div>
  );
}

// Archive / restore, Admin only. Archiving hides a report from the working
// system without deleting it, so it needs a reason for the audit log and a
// deliberate confirm step rather than a one-click action.
export function ArchiveControl({ kind, id, archivedAt, archiveReason, onChanged }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user?.role !== 'Admin') return null;

  async function run(action) {
    setError('');
    setBusy(true);
    try {
      if (action === 'archive') await adminApi.archive.archive(kind, id, reason.trim());
      else await adminApi.archive.restore(kind, id);
      setOpen(false);
      setReason('');
      onChanged();
    } catch (e) {
      setError(e.message || 'Could not update the archive.');
    } finally {
      setBusy(false);
    }
  }

  if (archivedAt) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Archived</div>
        <p className="mt-1 text-sm text-foreground">
          Hidden from queues, dashboards, analytics, the public map, and the resident&apos;s own list
          on {new Date(archivedAt).toLocaleString()}.
        </p>
        {archiveReason && <p className="mt-1 text-sm text-muted-foreground">Reason: {archiveReason}</p>}
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run('restore')}>
            {busy ? <Spinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
            Restore report
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Archive className="h-4 w-4" aria-hidden="true" />
        Archive report
      </Button>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm font-semibold text-foreground">Archive this report?</div>
      <p className="mt-1 text-sm text-muted-foreground">
        It stays on record with its full history and can be restored, but it leaves the queues,
        dashboards, analytics, public map, and the resident&apos;s own list. The reason is recorded
        in the audit log.
      </p>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required), e.g. duplicate of CMP-2026-00004"
        maxLength={255}
        className="mt-3"
      />
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={busy || !reason.trim()} onClick={() => run('archive')}>
          {busy && <Spinner className="h-4 w-4" />}
          Archive
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setOpen(false); setReason(''); setError(''); }}>
          Cancel
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}

export function Rows({ rows }) {
  return (
    <dl className="grid grid-cols-2 gap-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm text-foreground">{value === 0 ? 0 : value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReporterCard({ user }) {
  if (!user) return null;
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">Reporter</div>
      <div className="mt-1 font-medium text-foreground">{user.first_name} {user.last_name}</div>
      {user.email && <div className="text-sm text-muted-foreground">{user.email}</div>}
      {user.contact_number && <div className="text-sm text-muted-foreground">{user.contact_number}</div>}
    </div>
  );
}

export function Attachment({ path }) {
  const url = fileUrl(path);
  if (!url) return null;
  const isPdf = /\.pdf$/i.test(path);
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Attachment</div>
      {isPdf ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
          View document (PDF)
        </a>
      ) : (
        <img src={url} alt="attachment" className="max-h-80 rounded-lg img-outline" />
      )}
    </div>
  );
}
