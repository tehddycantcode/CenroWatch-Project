import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { humanize } from '@/lib/reports';

// Two-tier wildlife/report density map (manuscript GIS scope):
//   Tier 1 — barangay choropleth: each barangay polygon shaded by its total
//            report count (yellow → dark red).
//   Tier 2 — marker clustering: individual reports grouped into clusters that
//            split apart as you zoom in.
// Self-contained (its own sources/layers) so it never affects the shared
// MapView used by the pickers and public map.

const KEY = import.meta.env.VITE_MAPTILER_API_KEY;
const STYLE = `https://api.maptiler.com/maps/streets-v2/style.json?key=${KEY}`;
const CABUYAO = [121.1235, 14.271]; // [lng, lat]
// Lock the view to Cabuyao City (small margin) so the GIS map stays on the LGU.
// Format: [[SW lng, SW lat], [NE lng, NE lat]].
const CABUYAO_BOUNDS = [[121.06, 14.19], [121.20, 14.33]];
const MIN_ZOOM = 11;

// Choropleth color ramp, binned for the small counts typical of this dataset.
const FILL_COLOR = [
  'step', ['coalesce', ['get', 'total'], 0],
  '#eef2f6', // 0 — no reports
  1, '#fee391',
  2, '#fec44f',
  3, '#fe9929',
  5, '#ec7014',
  8, '#cc4c02',
  12, '#8c2d04',
];

function escapeHtml(s = '') {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function pinColor(m) {
  if (m.kind === 'wildlife') return m.endangered ? '#7c3aed' : '#16a34a';
  return m.priority ? '#d97706' : '#dc2626';
}

export default function DensityMap({ boundaries = [], markers = [], className = 'h-full w-full' }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // Latest data, read inside the one-time load handler.
  const dataRef = useRef({ boundaries, markers });
  dataRef.current = { boundaries, markers };

  useEffect(() => {
    if (!KEY || !containerRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: CABUYAO,
      zoom: 12.2,
      maxBounds: CABUYAO_BOUNDS,
      minZoom: MIN_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      const { boundaries: bgys, markers: mks } = dataRef.current;

      // --- Tier 1: barangay choropleth ---
      const bgyFC = {
        type: 'FeatureCollection',
        features: bgys
          .filter((b) => b.geojson_boundary)
          .map((b) => {
            const g = b.geojson_boundary;
            return {
              type: 'Feature',
              geometry: g.type === 'Feature' ? g.geometry : g,
              properties: {
                name: b.name,
                total: b.total,
                complaints: b.complaints,
                wildlife: b.wildlife,
                requests: b.requests,
              },
            };
          }),
      };
      map.addSource('barangays', { type: 'geojson', data: bgyFC });
      map.addLayer({
        id: 'barangay-fill',
        type: 'fill',
        source: 'barangays',
        paint: { 'fill-color': FILL_COLOR, 'fill-opacity': 0.55 },
      });
      map.addLayer({
        id: 'barangay-outline',
        type: 'line',
        source: 'barangays',
        paint: { 'line-color': '#475569', 'line-width': 1, 'line-opacity': 0.6 },
      });

      const bgyPopup = new maplibregl.Popup({ closeButton: false, offset: 8 });
      map.on('mousemove', 'barangay-fill', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const p = e.features[0].properties;
        bgyPopup
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px;line-height:1.5">
               <strong>${escapeHtml(p.name)}</strong><br/>
               <span style="color:#64748b">Total reports: <strong>${p.total}</strong></span><br/>
               Complaints ${p.complaints} · Wildlife ${p.wildlife} · Requests ${p.requests}
             </div>`
          )
          .addTo(map);
      });
      map.on('mouseleave', 'barangay-fill', () => {
        map.getCanvas().style.cursor = '';
        bgyPopup.remove();
      });

      // --- Tier 2: clustered report markers ---
      const pointsFC = {
        type: 'FeatureCollection',
        features: mks
          .filter((m) => m.latitude != null && m.longitude != null)
          .map((m) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [m.longitude, m.latitude] },
            properties: {
              id: m.id,
              label: humanize(m.category || ''),
              status: humanize(m.status || ''),
              barangay: m.barangay || '',
              color: pinColor(m),
            },
          })),
      };
      map.addSource('reports', { type: 'geojson', data: pointsFC, cluster: true, clusterMaxZoom: 16, clusterRadius: 45 });
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'reports',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1d4ed8',
          'circle-opacity': 0.85,
          'circle-radius': ['step', ['get', 'point_count'], 15, 5, 20, 15, 26],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'reports',
        filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'reports',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Click a cluster to zoom to its expansion level.
      map.on('click', 'clusters', async (e) => {
        const feats = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
        const clusterId = feats[0].properties.cluster_id;
        try {
          const zoom = await map.getSource('reports').getClusterExpansionZoom(clusterId);
          map.easeTo({ center: feats[0].geometry.coordinates, zoom });
        } catch {
          /* ignore */
        }
      });

      // Popup for an individual report.
      map.on('click', 'unclustered', (e) => {
        const p = e.features[0].properties;
        new maplibregl.Popup({ offset: 12 })
          .setLngLat(e.features[0].geometry.coordinates)
          .setHTML(
            `<div style="font-size:12px;line-height:1.4">
               <strong>${escapeHtml(p.id)}</strong><br/>
               ${escapeHtml(p.label)}<br/>
               <span style="color:#64748b">${escapeHtml(p.barangay)} · ${escapeHtml(p.status)}</span>
             </div>`
          )
          .addTo(map);
      });

      for (const layer of ['clusters', 'unclustered']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!KEY) {
    return (
      <div className={`flex items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground ${className}`}>
        Map unavailable. Set VITE_MAPTILER_API_KEY in web/.env
      </div>
    );
  }
  return <div ref={containerRef} className={className} />;
}
