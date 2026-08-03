import { useState } from 'react';
import { MapPin, Printer } from 'lucide-react';
import { fileUrl } from '@/lib/api';
import MapView from '@/components/MapView';
import { Button } from '@/components/ui/button';
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
