// Geospatial helpers. Used to obfuscate endangered-species coordinates on PUBLIC
// endpoints (project rule + R.A. 10173 intent): the true location is shifted by
// ~0.001° (~110 m) in a direction derived deterministically from the record id,
// so the point is fuzzed but stable across requests.

const OFFSET_DEG = 0.001;

// Stable 0..1 value from a string (FNV-1a).
function hashUnit(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function obfuscatePoint(latitude, longitude, seed) {
  const angle = hashUnit(String(seed)) * 2 * Math.PI;
  return {
    latitude: Number((latitude + Math.cos(angle) * OFFSET_DEG).toFixed(6)),
    longitude: Number((longitude + Math.sin(angle) * OFFSET_DEG).toFixed(6)),
  };
}

module.exports = { obfuscatePoint, OFFSET_DEG };
