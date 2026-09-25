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
// The office-to-report line: { from, to, geometry? }.
//
// `geometry` is the driving route from OpenRouteService, an array of [lng, lat]
// along real roads. It is OPTIONAL on purpose. The routing key may be missing
// and the provider is free, third-party and allowed to be down, so when there is
// no geometry this still draws the straight line between the two points - the
// map degrades to what it showed before routing existed rather than to nothing.
//
// The two are drawn differently because they mean different things: a dashed
// line is "these two points are this far apart", a solid one is "this is the way
// there". Reading a straight line as a road would send someone across a field.
function routePoints(route) {
  const from = route?.from;
  const to = route?.to;
  if (from?.lat == null || from?.lng == null) return null;
  if (to?.lat == null || to?.lng == null) return null;
  const geometry = Array.isArray(route?.geometry) && route.geometry.length > 1 ? route.geometry : null;
  return { from, to, geometry };
}

const ROUTE_SOURCE = 'office-route';
const ROUTE_LAYER = 'office-route-line';

export default function MapView({
  markers = EMPTY_MARKERS,
  heatmap = false,
  picker = false,
  value = null,
  onPick,
  center = CABUYAO,
  zoom = 12,
  fitToMarkers = false,
  route = null,
  className = 'h-full w-full',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerObjs = useRef([]);
  const pickMarker = useRef(null);
  const officeMarker = useRef(null);
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

  // Keep the heat GeoJSON current whether or not the layer is showing. Building
  // it is cheap, and skipping it while `heatmap` is false would leave stale data
  // to be handed to addHeatLayer the moment someone toggles density back on.
  useEffect(() => {
    const fc = complaintFeatureCollection(markers);
    heatData.current = fc;
    const src = mapRef.current?.getSource('complaints-heat');
    if (src) src.setData(fc);
  }, [markers]);

  // Add/remove the heat layer as `heatmap` changes, rather than only at mount.
  // The public map toggles between density and pins on one mounted map, so this
  // has to be reversible: adding it at init would strand the layer under the
  // pins the first time someone switched away from density.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const apply = () => {
      // The map can be torn down while this waits for `load`.
      const m = mapRef.current;
      if (!m) return;
      if (heatmap) {
        if (!m.getSource('complaints-heat')) addHeatLayer(m, heatData.current);
        return;
      }
      if (m.getLayer('complaints-heat-layer')) m.removeLayer('complaints-heat-layer');
      if (m.getSource('complaints-heat')) m.removeSource('complaints-heat');
    };

    // A layer cannot be added before the style exists.
    if (styleLoaded.current) {
      apply();
      return undefined;
    }
    map.once('load', apply);
    return () => map.off('load', apply);
  }, [heatmap]);

  // Display markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Clear BEFORE the mode check, not after it. These pins belong to this
    // component, so switching to density has to take them with it; returning
    // early first would leave the previous mode's pins sitting on top of the
    // heat layer with nothing left holding a reference to remove them.
    markerObjs.current.forEach((m) => m.remove());
    markerObjs.current = [];
    if (picker || heatmap) return;
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
    //
    // With a route, the framing has to include the office too, so the route
    // effect below owns it - otherwise this eases to zoom 14 on the report and
    // the other end of the line sits off-screen.
    if (fitToMarkers && !routePoints(route)) {
      const placed = markers.filter((m) => m.latitude != null && m.longitude != null);
      if (placed.length === 1) {
        map.easeTo({ center: [placed[0].longitude, placed[0].latitude], zoom: 14, duration: 400 });
      } else if (placed.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        placed.forEach((m) => bounds.extend([m.longitude, m.latitude]));
        map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 400 });
      }
    }
  }, [markers, picker, heatmap, fitToMarkers, route]);

  // Office -> report line, plus a pin on the office end.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const points = routePoints(route);

    const clear = (m) => {
      if (m.getLayer(ROUTE_LAYER)) m.removeLayer(ROUTE_LAYER);
      if (m.getSource(ROUTE_SOURCE)) m.removeSource(ROUTE_SOURCE);
      if (officeMarker.current) {
        officeMarker.current.remove();
        officeMarker.current = null;
      }
    };

    const draw = () => {
      // The map can be torn down while this waits for `load`.
      const m = mapRef.current;
      if (!m) return;
      if (!points) {
        clear(m);
        return;
      }
      const { from, to, geometry } = points;
      const coordinates = geometry || [[from.lng, from.lat], [to.lng, to.lat]];
      const data = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      };
      const src = m.getSource(ROUTE_SOURCE);
      if (src) {
        src.setData(data);
      } else {
        m.addSource(ROUTE_SOURCE, { type: 'geojson', data });
        m.addLayer({
          id: ROUTE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#0f766e',
            'line-width': 4,
            'line-opacity': 0.85,
          },
        });
      }
      // Dashed means "this is how far apart they are", solid means "this is the
      // way there". The route arrives after the straight line is already drawn,
      // so this has to be set on every draw, not only when the layer is created.
      m.setPaintProperty(ROUTE_LAYER, 'line-dasharray', geometry ? [1, 0] : [2, 1.5]);
      m.setPaintProperty(ROUTE_LAYER, 'line-width', geometry ? 4 : 3);
      if (officeMarker.current) {
        officeMarker.current.setLngLat([from.lng, from.lat]);
      } else {
        officeMarker.current = new maplibregl.Marker({ color: '#0f766e' })
          .setLngLat([from.lng, from.lat])
          .addTo(m);
      }
      if (fitToMarkers) {
        const bounds = new maplibregl.LngLatBounds();
        // Fit the whole line, not just its ends: a road route can bow well
        // outside the two points, and framing only the endpoints would crop the
        // middle of the very thing being drawn.
        coordinates.forEach((c) => bounds.extend(c));
        markers.forEach((mk) => {
          if (mk.latitude != null && mk.longitude != null) bounds.extend([mk.longitude, mk.latitude]);
        });
        map.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 400 });
      }
    };

    // A layer cannot be added before the style exists. Draw now if it is
    // already up, otherwise wait - the office location arrives from its own
    // request, so it can land on either side of the style loading.
    if (styleLoaded.current) {
      draw();
      return undefined;
    }
    map.once('load', draw);
    return () => map.off('load', draw);
  }, [route, fitToMarkers, markers]);

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
