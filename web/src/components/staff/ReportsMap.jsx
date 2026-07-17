import { useEffect, useMemo, useState } from 'react';
import { staffApi } from '@/lib/api';
import { statusStage } from '@/lib/reports';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/icons';
import { CHART_COLORS } from '@/components/admin/chart-colors';
import MapView from '@/components/MapView';

// Where residents pinned their reports. Staff endpoints return true coordinates
// (RBAC-protected; the public-endpoint obfuscation rule does not apply here) so
// responders can find the actual spot. Service requests carry no map pin by
// design (barangay-scoped), so the map covers complaints + wildlife.
//
// This is an OPERATIONAL map: only open reports appear. Once a report reaches
// a terminal stage (finished: resolved/completed/released/transferred, or
// closed: rejected/deceased) its pin drops off automatically. The detail-page
// mini-map still shows a closed report's spot for case review.
const isOpen = (status) => !['finished', 'closed'].includes(statusStage(status).key);
const KINDS = [
  { key: 'complaint', label: 'Complaints', color: CHART_COLORS.complaints },
  { key: 'wildlife', label: 'Wildlife', color: CHART_COLORS.wildlife },
];

export default function ReportsMap() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(() => new Set(KINDS.map((k) => k.key)));

  useEffect(() => {
    Promise.all([staffApi.complaints.list({ limit: 100 }), staffApi.wildlife.list({ limit: 100 })])
      .then(([c, w]) => {
        const complaints = (c.data.items || []).map((r) => ({
          id: r.tracking_id,
          kind: 'complaint',
          category: r.complaint_type,
          status: r.status,
          barangay: r.barangay?.name,
          latitude: r.latitude,
          longitude: r.longitude,
          color: CHART_COLORS.complaints,
        }));
        const wildlife = (w.data.items || []).map((r) => ({
          id: r.reference_id,
          kind: 'wildlife',
          category: r.species_name,
          status: r.status,
          barangay: r.barangay?.name,
          latitude: r.latitude,
          longitude: r.longitude,
          color: CHART_COLORS.wildlife,
        }));
        setRows([...complaints, ...wildlife]);
      })
      .catch((e) => setError(e.message));
  }, []);

  const open = useMemo(() => (rows || []).filter((r) => isOpen(r.status)), [rows]);
  const pinned = useMemo(() => open.filter((r) => r.latitude != null && r.longitude != null), [open]);
  const markers = useMemo(() => pinned.filter((r) => shown.has(r.kind)), [pinned, shown]);
  const countFor = (kind) => pinned.filter((r) => r.kind === kind).length;

  function toggle(kind) {
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      // Never allow an empty map by accident: re-enable the other kind instead.
      if (next.size === 0) KINDS.forEach((k) => k.key !== kind && next.add(k.key));
      return next;
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4 sm:p-6 sm:pb-4">
        <div>
          <h2 className="text-lg font-semibold">Report locations</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Where residents pinned their concerns. Click a pin for details.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => toggle(k.key)}
              aria-pressed={shown.has(k.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                shown.has(k.key)
                  ? 'border-transparent bg-accent text-foreground'
                  : 'border-border text-muted-foreground opacity-60 hover:opacity-100'
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: k.color }} />
              {k.label}
              <span className="tabular-nums text-muted-foreground">{countFor(k.key)}</span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="px-6 pb-6 text-sm text-destructive">{error}</p>
      ) : rows === null ? (
        <div className="flex h-80 items-center justify-center">
          <Spinner className="h-7 w-7 text-primary" />
        </div>
      ) : pinned.length === 0 ? (
        <div className="flex h-80 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          No open reports carry a map pin right now. Pins appear when residents attach a
          location and drop off once a report is finished.
        </div>
      ) : (
        <MapView markers={markers} fitToMarkers className="h-80 w-full sm:h-96" />
      )}

      <div className="border-t px-5 py-2.5 text-xs text-muted-foreground sm:px-6">
        {rows !== null && !error && (
          <>
            {pinned.length} of {open.length} open reports have a pin (location is optional when
            filing). Pins drop off once a report is finished; service requests are
            barangay-level and are not mapped.
          </>
        )}
      </div>
    </Card>
  );
}
