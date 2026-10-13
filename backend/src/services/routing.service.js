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
// A FAILURE is remembered too, but only for a minute.
//
// The two TTLs answer different questions. A successful route is a fact about
// geography and keeps for a day. A failure is a fact about OpenRouteService
// right now - quota exhausted, timing out, down - and must expire quickly, or
// one bad minute would cost every report its route for the rest of the day.
//
// Without this the client retries on every report view, and during an outage
// that is one upstream call per view, each waiting out the 6s timeout, against
// a free quota. With it, a burst costs ONE call. The client deliberately does
// not cache a null (see web/src/lib/useRoadRoute.js), so this is the only place
// protecting the quota - do not remove both.
const FAILURE_TTL_MS = 60 * 1000;
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

// Returns { route } on a hit - including a remembered failure, whose route is
// null - and null when there is nothing usable. The wrapper matters: it is what
// lets a caller tell "we know there is no route" from "we have not asked".
function readCache(k) {
  const hit = cache.get(k);
  if (!hit) return null;
  const ttl = hit.route ? CACHE_TTL_MS : FAILURE_TTL_MS;
  if (Date.now() - hit.at > ttl) {
    cache.delete(k);
    return null;
  }
  return hit;
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
  if (cached) return cached.route;

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
      writeCache(k, null);
      return null;
    }
    body = await res.json();
  } catch (e) {
    console.warn(`[routing] openrouteservice unreachable (${e.name}: ${e.message}); falling back to a straight line`);
    writeCache(k, null);
    return null;
  }

  const feature = body?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    console.warn('[routing] openrouteservice returned no usable geometry');
    writeCache(k, null);
    return null;
  }

  const route = {
    geometry: coordinates,
    distance_m: Number(summary?.distance) || 0,
    duration_s: Number(summary?.duration) || 0,
  };
  // Kept for a day; a failure above is kept for a minute. Both are cached, with
  // very different lifetimes - see FAILURE_TTL_MS. This used to cache successes
  // only, which meant an outage was re-asked on every single report view.
  writeCache(k, route);
  return route;
}

// Tests only: the cache is process-wide and would otherwise leak between them.
const __clearCache = () => cache.clear();

module.exports = { getRoute, isConfigured, isWithinServiceArea, __clearCache, SERVICE_AREA };
