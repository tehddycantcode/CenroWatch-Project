import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Captures an optional lat/long for a report. Uses the browser's geolocation
// ("Use my location"); an interactive MapLibre pin-picker lands with the map slice.
export default function LocationField({ value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function locate() {
    setError('');
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        });
        setBusy(false);
      },
      () => {
        setError('Could not get your location. You can submit without it.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const has = value?.latitude != null && value?.longitude != null;

  return (
    <div className="rounded-lg border border-input bg-muted/30 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          {has ? (
            <span className="text-foreground">
              📍 {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
            </span>
          ) : (
            <span className="text-muted-foreground">No location pinned (optional)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {has && (
            <button
              type="button"
              onClick={() => onChange({ latitude: null, longitude: null })}
              className="text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              Clear
            </button>
          )}
          <Button type="button" size="sm" variant="outline" loading={busy} onClick={locate}>
            Use my location
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
