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
// THE RESPONSE ALSO CARRIES THE ORIGIN, as `from`, and that matters more than it
// looks. This request sends only the DESTINATION - the server supplies the office
// end from SystemSetting - so the office the line is drawn from is the server's,
// while useOfficeLocation() holds the client's own session-cached copy. When an
// Admin edits the office on the Settings page those two disagree, and the symptom
// is a map whose route starts at the new office while the pin still sits at the
// old one. Returning `from` here lets the caller draw the marker from the same
// answer that produced the line, so they cannot drift apart.
//
// Cached per destination for the session: a pin does not move, so reopening the
// same report costs nothing and the free routing tier is spent once per report.
// The office is NOT in the cache key, deliberately - the client is not the
// authority on where it is. A cached entry therefore keeps its own `from`, so a
// stale entry is stale in BOTH halves and stays self-consistent; a reload clears
// it. That is the right trade against sending a coordinate the server would
// ignore anyway.
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
        // Carry the ORIGIN the server actually routed from, not just the shape
        // of the line. The caller draws the office marker from it, which is what
        // keeps the pin and the line from ever disagreeing - see the note at the
        // top of this file.
        const value = r?.data?.route ? { ...r.data.route, from: r.data.from ?? null } : null;
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
