import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { humanize } from '@/lib/reports';

const KEY = import.meta.env.VITE_MAPTILER_API_KEY;
const STYLE = `https://api.maptiler.com/maps/streets-v2/style.json?key=${KEY}`;
const CABUYAO = [121.1256, 14.2726]; // [lng, lat]
// Keep the map focused on Cabuyao City: maxBounds blocks panning outside the LGU
// (with a small margin) and minZoom stops zooming out to the wider region.
// Format: [[SW lng, SW lat], [NE lng, NE lat]].
const CABUYAO_BOUNDS = [[121.06, 14.19], [121.20, 14.33]];
const MIN_ZOOM = 11;

function pinColor(m) {
  if (m.kind === 'wildlife') return m.endangered ? '#7c3aed' : '#16a34a';
  return m.priority ? '#d97706' : '#dc2626';
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Reusable MapLibre map.
 * - Display mode: pass `markers` to render colored pins with popups.
 * - Picker mode: pass `picker`, `value` ({latitude, longitude}) and `onPick(lat,lng)`.
 */
export default function MapView({
  markers = [],
  picker = false,
  value = null,
  onPick,
  center = CABUYAO,
  zoom = 12,
  className = 'h-full w-full',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerObjs = useRef([]);
  const pickMarker = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Init once.
  useEffect(() => {
    if (!KEY || !containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center,
      zoom,
      maxBounds: CABUYAO_BOUNDS,
      minZoom: MIN_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    if (picker) {
      map.on('click', (e) => {
        onPickRef.current?.(Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6)));
      });
    }
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Display markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || picker) return;
    markerObjs.current.forEach((m) => m.remove());
    markerObjs.current = [];
    markers.forEach((mk) => {
      if (mk.latitude == null || mk.longitude == null) return;
      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<div style="font-size:12px;line-height:1.4">
           <strong>${escapeHtml(mk.id)}</strong><br/>
           ${escapeHtml(humanize(mk.category))}<br/>
           <span style="color:#64748b">${escapeHtml(mk.barangay || '')} · ${escapeHtml(humanize(mk.status))}</span>
         </div>`
      );
      const marker = new maplibregl.Marker({ color: pinColor(mk) })
        .setLngLat([mk.longitude, mk.latitude])
        .setPopup(popup)
        .addTo(map);
      markerObjs.current.push(marker);
    });
  }, [markers, picker]);

  // Picker marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !picker) return;
    const has = value?.latitude != null && value?.longitude != null;
    if (has) {
      if (!pickMarker.current) pickMarker.current = new maplibregl.Marker({ color: '#22a050' }).addTo(map);
      pickMarker.current.setLngLat([value.longitude, value.latitude]);
    } else if (pickMarker.current) {
      pickMarker.current.remove();
      pickMarker.current = null;
    }
  }, [value, picker]);

  if (!KEY) {
    return (
      <div className={`flex items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground ${className}`}>
        Map unavailable — set VITE_MAPTILER_API_KEY in web/.env
      </div>
    );
  }
  return <div ref={containerRef} className={className} />;
}
