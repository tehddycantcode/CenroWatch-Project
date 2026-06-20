import { useState } from 'react';
import MapView from '@/components/MapView';
import { Button } from '@/components/ui/button';

// Optional location for a report: tap the map to drop a pin, or use the device's
// current location. Stores { latitude, longitude }.
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
        setError('Could not get your location. Tap the map instead, or submit without it.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const has = value?.latitude != null && value?.longitude != null;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border">
        <MapView
          picker
          value={value}
          onPick={(lat, lng) => onChange({ latitude: lat, longitude: lng })}
          className="h-56 w-full"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          {has ? (
            <span className="text-foreground">📍 {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}</span>
          ) : (
            <span className="text-muted-foreground">Tap the map to pin a location (optional)</span>
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
