// Distance between two points, and a link that hands navigation to a maps app.
//
// Both are deliberately dependency-free. The straight-line distance answers
// "how far out is this report" without a routing service; the link answers "get
// me there" by handing off to the app the person already has, with live traffic
// and turn-by-turn, instead of this project owning a navigation feature.

const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

// Haversine. Straight-line ("as the crow flies") distance in kilometres, so a
// real drive is always longer - see formatDistance, which says so out loud
// rather than letting the number be read as a travel distance.
export function distanceKm(from, to) {
  if (from?.lat == null || from?.lng == null) return null;
  if (to?.lat == null || to?.lng == null) return null;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Metres below 1 km, because "0.4 km from the office" reads worse than "400 m"
// for somewhere you could walk to.
export function formatDistance(km) {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// Driving time from the routing provider, in seconds. Rounded up to the minute
// and hedged with "about" by the caller: a travel estimate presented to the
// second would claim a precision it does not have.
export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// Google Maps' documented cross-platform URL: it opens the native app on a
// phone and the website on a desktop, so one link covers both without sniffing
// the user agent.
export function directionsUrl(from, to) {
  if (from?.lat == null || from?.lng == null) return null;
  if (to?.lat == null || to?.lng == null) return null;
  const origin = `${from.lat},${from.lng}`;
  const destination = `${to.lat},${to.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
