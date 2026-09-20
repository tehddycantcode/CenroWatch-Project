import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { humanize } from '@/lib/reports';
import { cn } from '@/lib/utils';

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

// GeoJSON of complaint points for the density heatmap (priority weighted higher).
function complaintFeatureCollection(markers) {
  return {
    type: 'FeatureCollection',
    features: markers.flatMap((m) =>
      m.kind === 'complaint' && m.latitude != null && m.longitude != null
        ? [{
            type: 'Feature',
            properties: { weight: m.priority ? 2 : 1 },
            geometry: { type: 'Point', coordinates: [m.longitude, m.latitude] },
          }]
        : []
    ),
  };
}

// Add the heatmap source + layer. Green (low) -> red (hot) keeps the nature theme
// at low density while making complaint hotspots obvious.
function addHeatLayer(map, data) {
  map.addSource('complaints-heat', { type: 'geojson', data });
  map.addLayer({
    id: 'complaints-heat-layer',
    type: 'heatmap',
    source: 'complaints-heat',
    paint: {
      'heatmap-weight': ['coalesce', ['get', 'weight'], 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 3],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 11, 18, 16, 45],
      'heatmap-opacity': 0.85,
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.2, '#8fe8ae',
        0.4, '#2dc568',
        0.6, '#f2c94c',
        0.8, '#f2994a',
        1, '#dc2626',
      ],
    },
  });
}

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Stable default so a render without `markers` doesn't re-trigger the effects
// that list it in their dependency arrays.
const EMPTY_MARKERS = [];

/**
 * Reusable MapLibre map.
 * - Display mode: pass `markers` to render colored pins with popups.
 * - Heatmap mode: pass `heatmap` to render complaint density instead of pins.
 * - Picker mode: pass `picker`, `value` ({latitude, longitude}) and `onPick(lat,lng)`.
 */
export default function MapView({
  markers = EMPTY_MARKERS,
  heatmap = false,
  picker = false,
  value = null,
  onPick,
  center = CABUYAO,
  zoom = 12,
  fitToMarkers = false,
  className = 'h-full w-full',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerObjs = useRef([]);
  const pickMarker = useRef(null);
  const heatReady = useRef(false);
  const heatData = useRef({ type: 'FeatureCollection', features: [] });
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // A style that never loads leaves an empty container, and an empty container
  // looks exactly like a map of nowhere - no error, no spinner, just white.
  // That is worth a message rather than a guess: see the `error` handler below.
  const [styleError, setStyleError] = useState(null);
  const styleLoaded = useRef(false);

  // Init once.
  useEffect(() => {
    if (!KEY || !containerRef.current) return;
    styleLoaded.current = false;
    setStyleError(null);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center,
      zoom,
      maxBounds: CABUYAO_BOUNDS,
      minZoom: MIN_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      styleLoaded.current = true;
    });

    // MapLibre reports network failures here instead of throwing, and with no
    // handler at all it logs to the console and renders nothing - which is how
    // a rejected API key turns into a blank white rectangle.
    //
    // Only a failure BEFORE the style loads is fatal: after that the map is
    // usable and a missing tile is a gap, not a dead map, so covering it with
    // an overlay would be worse than the gap. A 401/403 here is almost always
    // the key's allowed-origins list rather than a wrong key - MapTiler
    // rejects per origin, so the same key works on localhost and is refused on
    // a LAN address or a new production domain until that origin is added.
    map.on('error', (e) => {
      if (styleLoaded.current) return;
      const status = e?.error?.status;
      setStyleError(
        status === 401 || status === 403
          ? 'The map provider refused this website (HTTP ' + status + '). Add this exact address to the allowed origins of the MapTiler key, then reload.'
          : 'The map could not be loaded. Check the network connection and that the MapTiler key is valid.'
      );
    });

    if (picker) {
      map.on('click', (e) => {
        onPickRef.current?.(Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6)));
      });
    }
    if (heatmap) {
      // The heatmap layer needs the style loaded before it can be added.
      map.on('load', () => {
        addHeatLayer(map, heatData.current);
        heatReady.current = true;
      });
    }
    mapRef.current = map;
    return () => {
      // map.remove() is MapLibre's owner teardown - it removes the controls,
      // destroys the painter/handlers, unsets the style and drops the WebGL
      // context. The map.on(...) handlers above are stored on this instance
      // (Evented._listeners), so they go with it; none needs its own .off().
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feed the heatmap source whenever markers change.
  useEffect(() => {
    if (!heatmap) return;
    const fc = complaintFeatureCollection(markers);
    heatData.current = fc;
    const src = mapRef.current?.getSource('complaints-heat');
    if (src) src.setData(fc);
  }, [markers, heatmap]);

  // Display markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || picker || heatmap) return;
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
      const marker = new maplibregl.Marker({ color: mk.color || pinColor(mk) })
        .setLngLat([mk.longitude, mk.latitude])
        .setPopup(popup)
        .addTo(map);
      markerObjs.current.push(marker);
    });

    // Frame the camera around the pins (e.g. the staff dashboard map) instead
    // of relying on the default center/zoom to happen to show them.
    if (fitToMarkers) {
      const placed = markers.filter((m) => m.latitude != null && m.longitude != null);
      if (placed.length === 1) {
        map.easeTo({ center: [placed[0].longitude, placed[0].latitude], zoom: 14, duration: 400 });
      } else if (placed.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        placed.forEach((m) => bounds.extend([m.longitude, m.latitude]));
        map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 400 });
      }
    }
  }, [markers, picker, heatmap, fitToMarkers]);

  // Picker marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !picker) return;
    const has = value?.latitude != null && value?.longitude != null;
    if (has) {
      if (!pickMarker.current) {
        // Set the position BEFORE addTo: MapLibre positions the marker as soon
        // as it is added, and adding it without a lngLat throws
        // "Cannot read properties of undefined (reading 'lng')" and unmounts the app.
        pickMarker.current = new maplibregl.Marker({ color: '#22a050' })
          .setLngLat([value.longitude, value.latitude])
          .addTo(map);
      } else {
        pickMarker.current.setLngLat([value.longitude, value.latitude]);
      }
    } else if (pickMarker.current) {
      pickMarker.current.remove();
      pickMarker.current = null;
    }
  }, [value, picker]);

  if (!KEY) {
    return (
      <div className={`flex items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground ${className}`}>
        Map unavailable. Set VITE_MAPTILER_API_KEY in web/.env
      </div>
    );
  }
  // The wrapper carries the caller's sizing/positioning classes and the map
  // container fills it, so the overlay has something to position against.
  // `className` comes last so a caller passing `absolute inset-0` still wins
  // over the default `relative`.
  return (
    <div className={cn('relative', className)}>
      <div ref={containerRef} className="h-full w-full" />
      {styleError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/95 p-6">
          <p className="max-w-sm text-balance text-center text-sm text-muted-foreground">
            {styleError}
          </p>
        </div>
      )}
    </div>
  );
}
