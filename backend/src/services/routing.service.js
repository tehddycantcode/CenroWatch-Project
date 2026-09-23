// Road routing from the CENRO office to a report pin, via OpenRouteService.
//
// This is the ONLY outbound HTTP call in this backend, and it goes to a free
// third-party service. Treat it as something that will be unavailable at the
// worst possible moment: every failure - no key, bad key, quota exhausted,
// timeout, malformed answer - returns null, and the web app falls back to the
// straight line it drew before this existed. Nothing here throws.
//
// The key is read from the environment at CALL time, not at module load, so a
// key added to .env takes effect on the next request rather than needing a
// restart, and so tests can toggle it.
//
// Why the key is server-side: VITE_MAPTILER_API_KEY is necessarily public (the
// browser fetches tiles itself), but nothing about routing requires the browser
// to hold this one, and a key in the bundle is a key on someone else's quota.

// HeiGIT (who run OpenRouteService) are retiring api.openrouteservice.org in
// favour of api.heigit.org - the notice is on the key dashboard. The new host
// does NOT serve the same path: /v2/... is a 404 there, the prefix is
// /openrouteservice/v2/.... Both were tested with a real key on 2026-09-23 and
// returned byte-identical routes (1580.8 m, 42 points), so this uses the
// successor. ORS_ENDPOINT overrides it without a code change if the migration
// turns out to be bumpy.
const DEFAULT_ENDPOINT = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson';
const endpoint = () => process.env.ORS_ENDPOINT || DEFAULT_ENDPOINT;

// A third party that never answers must not hold a request open behind it.
const TIMEOUT_MS = 6000;

// Cabuyao City, the same box the maps are clamped to (MapView.jsx
// CABUYAO_BOUNDS). Without this check any authenticated staff account could use
// the endpoint as a general-purpose routing proxy on our quota and our key.
const SERVICE_AREA = { west: 121.06, south: 14.19, east: 121.2, north: 14.33 };

// Neither end of this route moves: the office is a setting and a report's pin is
// fixed when it is submitted. Caching means opening the same report ten times
// costs one request instead of ten.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();

const isConfigured = () => Boolean(process.env.ORS_API_KEY);

function isWithinServiceArea(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= SERVICE_AREA.south &&
    lat <= SERVICE_AREA.north &&
    lng >= SERVICE_AREA.west &&
    lng <= SERVICE_AREA.east
  );
}

// 5 decimal places is about a metre - far finer than a map pin is placed, and
// coarse enough that the same report keeps hitting the same cache entry.
const key = (from, to) =>
  [from.lat, from.lng, to.lat, to.lng].map((n) => Number(n).toFixed(5)).join(',');

function readCache(k) {
  const hit = cache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(k);
    return null;
  }
  return hit.route;
}

function writeCache(k, route) {
  if (cache.size >= CACHE_MAX) {
    // Map preserves insertion order, so the first key is the oldest.
    cache.delete(cache.keys().next().value);
  }
  cache.set(k, { at: Date.now(), route });
}

async function getRoute(from, to) {
  if (!isConfigured()) return null;
  if (!isWithinServiceArea(from) || !isWithinServiceArea(to)) return null;

  const k = key(from, to);
  const cached = readCache(k);
  if (cached) return cached;

  let body;
  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        Authorization: process.env.ORS_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json',
      },
      // ORS takes [longitude, latitude]. Swapped, a Cabuyao route is computed
      // in the Indian Ocean and still comes back 200 - so this order is tested.
      body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[routing] openrouteservice answered ${res.status}; falling back to a straight line`);
      return null;
    }
    body = await res.json();
  } catch (e) {
    console.warn(`[routing] openrouteservice unreachable (${e.name}: ${e.message}); falling back to a straight line`);
    return null;
  }

  const feature = body?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    console.warn('[routing] openrouteservice returned no usable geometry');
    return null;
  }

  const route = {
    geometry: coordinates,
    distance_m: Number(summary?.distance) || 0,
    duration_s: Number(summary?.duration) || 0,
  };
  // Only a real answer is cached. Caching a failure would leave that report
  // without a route until the process restarted.
  writeCache(k, route);
  return route;
}

// Tests only: the cache is process-wide and would otherwise leak between them.
const __clearCache = () => cache.clear();

module.exports = { getRoute, isConfigured, isWithinServiceArea, __clearCache, SERVICE_AREA };
