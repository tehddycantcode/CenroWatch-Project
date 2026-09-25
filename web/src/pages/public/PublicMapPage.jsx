import { useEffect, useState } from 'react';
import { gisApi } from '@/lib/api';
import MapView from '@/components/MapView';
import PublicHeader from '@/components/public/PublicHeader';
import { cn } from '@/lib/utils';

const DENSITY = 'density';
const PINS = 'pins';

// The pin palette is MapView's pinColor(), restated for the legend. A colour
// nobody can read is decoration, so the two have to be kept in step.
const PIN_LEGEND = [
  { color: '#dc2626', label: 'Complaint' },
  { color: '#d97706', label: 'Priority complaint' },
  { color: '#16a34a', label: 'Wildlife sighting' },
  { color: '#7c3aed', label: 'Endangered species (location approximate)' },
];

export default function PublicMapPage() {
  const [markers, setMarkers] = useState([]);
  const [error, setError] = useState('');
  const [view, setView] = useState(DENSITY);

  useEffect(() => {
    gisApi
      .map()
      .then((r) => setMarkers(r.data.markers))
      .catch((e) => setError(e.message));
  }, []);

  const placed = markers.filter((m) => m.latitude != null && m.longitude != null);
  const complaintCount = placed.filter((m) => m.kind === 'complaint').length;
  const wildlifeCount = placed.filter((m) => m.kind === 'wildlife').length;
  const density = view === DENSITY;

  return (
    <div className="flex h-screen flex-col">
      <PublicHeader />
      <div className="relative flex-1">
        {/* Heat density and individual pins are mutually exclusive modes of the
            same map, so this switches one mounted MapView rather than swapping
            components - remounting would throw away the visitor's pan/zoom. */}
        <MapView markers={markers} heatmap={density} className="absolute inset-0" />

        {/* Top-LEFT, deliberately: MapLibre's zoom control sits top-right, and
            an overlay there is drawn underneath it. */}
        <div className="absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-lg border bg-background/95 p-1 shadow-md">
          <div role="group" aria-label="Map view" className="flex gap-1">
            <ViewButton active={density} onClick={() => setView(DENSITY)}>
              Heat map
            </ViewButton>
            <ViewButton active={!density} onClick={() => setView(PINS)}>
              Markers
            </ViewButton>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-lg border bg-background/95 p-3 text-xs shadow-md">
          {density ? (
            <>
              <div className="mb-1.5 font-semibold">Complaint density</div>
              <div
                className="h-2.5 w-40 rounded-full"
                style={{ background: 'linear-gradient(to right, #8fe8ae, #2dc568, #f2c94c, #f2994a, #dc2626)' }}
              />
              <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>Low</span>
                <span>High</span>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {complaintCount} complaint{complaintCount === 1 ? '' : 's'} mapped
              </div>
            </>
          ) : (
            <>
              <div className="mb-1.5 font-semibold">Report markers</div>
              <ul className="space-y-1">
                {PIN_LEGEND.map((p) => (
                  <li key={p.label} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: p.color }}
                    />
                    <span className="text-[11px] text-muted-foreground">{p.label}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {complaintCount} complaint{complaintCount === 1 ? '' : 's'}, {wildlifeCount} wildlife
                sighting{wildlifeCount === 1 ? '' : 's'} &mdash; select a pin for details
              </div>
            </>
          )}
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

// aria-pressed rather than a pair of radios: these are two buttons that change
// the map in place, and a screen reader needs to hear which one is currently on.
function ViewButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      {children}
    </button>
  );
}
