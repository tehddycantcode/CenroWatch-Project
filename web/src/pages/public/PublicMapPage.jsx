import { useEffect, useState } from 'react';
import { gisApi } from '@/lib/api';
import MapView from '@/components/MapView';
import PublicHeader from '@/components/public/PublicHeader';

export default function PublicMapPage() {
  const [markers, setMarkers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    gisApi
      .map()
      .then((r) => setMarkers(r.data.markers))
      .catch((e) => setError(e.message));
  }, []);

  const complaintCount = markers.filter(
    (m) => m.kind === 'complaint' && m.latitude != null && m.longitude != null
  ).length;

  return (
    <div className="flex h-screen flex-col">
      <PublicHeader />
      <div className="relative flex-1">
        <MapView markers={markers} heatmap className="absolute inset-0" />

        {/* Density scale legend */}
        <div className="absolute bottom-4 left-4 rounded-lg border bg-background/95 p-3 text-xs shadow-md">
          <div className="mb-1.5 font-semibold">Complaint density</div>
          <div
            className="h-2.5 w-40 rounded-full"
            style={{ background: 'linear-gradient(to right, #8fe8ae, #2dc568, #f2c94c, #f2994a, #dc2626)' }}
          />
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        <div className="absolute right-4 top-4 rounded-md border bg-background/95 px-3 py-1.5 text-xs font-medium shadow">
          {complaintCount} complaint{complaintCount === 1 ? '' : 's'} mapped
        </div>

        {error && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
