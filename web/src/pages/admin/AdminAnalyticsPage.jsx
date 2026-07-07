import { useEffect, useState } from 'react';
import { adminApi, gisApi } from '@/lib/api';
import DensityMap from '@/components/admin/DensityMap';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/icons';

// Individual-report marker colors (clustered layer).
const markerLegend = [
  { color: '#dc2626', label: 'Complaint' },
  { color: '#d97706', label: 'Priority complaint' },
  { color: '#16a34a', label: 'Wildlife' },
  { color: '#7c3aed', label: 'Endangered (approx.)' },
];

// Choropleth bins — must mirror FILL_COLOR in DensityMap.jsx.
const densityLegend = [
  { color: '#eef2f6', label: '0' },
  { color: '#fee391', label: '1' },
  { color: '#fec44f', label: '2' },
  { color: '#fe9929', label: '3-4' },
  { color: '#ec7014', label: '5-7' },
  { color: '#cc4c02', label: '8-11' },
  { color: '#8c2d04', label: '12+' },
];

export default function AdminAnalyticsPage() {
  const [markers, setMarkers] = useState([]);
  const [barangays, setBarangays] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([gisApi.map(), adminApi.analytics()])
      .then(([m, a]) => {
        setMarkers(m.data.markers);
        setBarangays([...a.data.analytics.by_barangay].sort((x, y) => y.total - x.total));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!barangays) return <div className="flex justify-center py-16"><Spinner className="h-7 w-7 text-primary" /></div>;

  const maxTotal = Math.max(1, ...barangays.map((b) => b.total));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Geographic Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          Two-tier density view: barangay choropleth with clustered report markers across Cabuyao&apos;s 18 barangays
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="relative h-[480px]">
          <DensityMap boundaries={barangays} markers={markers} className="absolute inset-0" />

          {/* Choropleth scale */}
          <div className="absolute bottom-3 left-3 rounded-lg border bg-background/95 p-3 text-xs shadow-md">
            <div className="mb-1.5 font-semibold">Report density</div>
            <div className="flex items-center gap-1">
              {densityLegend.map((l) => (
                <span key={l.label} className="h-3 w-5" style={{ backgroundColor: l.color }} title={l.label} />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>fewer</span>
              <span>more</span>
            </div>
          </div>

          {/* Marker colors */}
          <div className="absolute bottom-3 right-3 rounded-lg border bg-background/95 p-3 text-xs shadow-md">
            <div className="mb-1.5 font-semibold">Markers</div>
            <ul className="space-y-1">
              {markerLegend.map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
      <p className="-mt-2 text-xs text-muted-foreground">
        Barangay boundaries are approximate (Thiessen polygons around each centroid) pending LGU-issued shapefiles.
      </p>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Barangay</th>
              <th className="px-4 py-3 font-medium">Complaints</th>
              <th className="px-4 py-3 font-medium">Wildlife</th>
              <th className="px-4 py-3 font-medium">Requests</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {barangays.map((b) => (
              <tr key={b.barangay_id}>
                <td className="px-4 py-2.5 font-medium text-foreground">{b.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{b.complaints}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{b.wildlife}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{b.requests}</td>
                <td className="px-4 py-2.5 font-semibold">{b.total}</td>
                <td className="px-4 py-2.5">
                  <div className="h-2 w-24 overflow-hidden rounded bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${(b.total / maxTotal) * 100}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
