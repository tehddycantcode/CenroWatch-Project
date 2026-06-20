import { useEffect, useState } from 'react';
import { gisApi } from '@/lib/api';
import MapView from '@/components/MapView';
import PublicHeader from '@/components/public/PublicHeader';

const legend = [
  { color: '#dc2626', label: 'Complaint' },
  { color: '#d97706', label: 'Priority complaint' },
  { color: '#16a34a', label: 'Wildlife' },
  { color: '#7c3aed', label: 'Endangered (location approximate)' },
];

export default function PublicMapPage() {
  const [markers, setMarkers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    gisApi
      .map()
      .then((r) => setMarkers(r.data.markers))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <PublicHeader />
      <div className="relative flex-1">
        <MapView markers={markers} className="absolute inset-0" />

        <div className="absolute bottom-4 left-4 rounded-lg border bg-background/95 p-3 text-xs shadow-md">
          <div className="mb-1.5 font-semibold">Legend</div>
          <ul className="space-y-1">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color }} />
                {l.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="absolute right-4 top-4 rounded-md border bg-background/95 px-3 py-1.5 text-xs font-medium shadow">
          {markers.length} report{markers.length === 1 ? '' : 's'} on the map
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
