import { useEffect, useState } from 'react';
import { staffApi } from '@/lib/api';

// The driving route from the CENRO office to a report's pin.
//
// Returns null until (and unless) a route arrives. Null is the ordinary answer
// in three cases that the caller cannot and need not tell apart: routing is not
// configured (no ORS_API_KEY), the provider is unavailable, or the request is
// still in flight. In all of them the map keeps the straight line it already
// drew, so this hook never surfaces an error state - a missing road route is a
// less precise map, not a broken page.
//
// Cached per destination for the session: a pin does not move, so reopening the
// same report costs nothing and the free routing tier is spent once per report.
const cache = new Map();

const keyFor = (to) => `${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;

export function useRoadRoute(to) {
  const k = to ? keyFor(to) : null;
  const [route, setRoute] = useState(() => (k ? cache.get(k) ?? null : null));

  useEffect(() => {
    if (!k || !to) {
      setRoute(null);
      return undefined;
    }
    if (cache.has(k)) {
      setRoute(cache.get(k));
      return undefined;
    }
    let cancelled = false;
    staffApi
      .route(to)
      .then((r) => {
        const value = r?.data?.route ?? null;
        cache.set(k, value);
        if (!cancelled) setRoute(value);
      })
      .catch(() => {
        // Deliberately not cached: a blip now should not cost this report its
        // route for the rest of the session.
        if (!cancelled) setRoute(null);
      });
    return () => {
      cancelled = true;
    };
    // `to` is a fresh object every render; the rounded key is the real identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);

  return route;
}
