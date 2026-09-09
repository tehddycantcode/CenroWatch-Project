// Approximate barangay boundaries (Thiessen / Voronoi polygons).
//
// EXTRACTED from prisma/seed.js so the admin barangay CRUD can re-derive the
// same polygons the seed produces. This matters more than it looks: a Voronoi
// cell is defined RELATIVE to every other site, so adding, moving or retiring
// one barangay reshapes its neighbours. Every mutation must recompute the whole
// set, not just the row that changed - two implementations of this would drift
// and leave the choropleth with overlapping or gapped polygons.

const BBOX = { minLng: 121.098, minLat: 14.249, maxLng: 121.147, maxLat: 14.293 };

// Clip a convex polygon to the half-plane of points closer to si than to sj
// (Sutherland–Hodgman against a single perpendicular-bisector edge).
function clipHalfPlane(poly, si, sj) {
  // Keep p where |p-si|² ≤ |p-sj|²  ⇔  p·(sj-si) ≤ (|sj|²-|si|²)/2.
  const ax = sj[0] - si[0];
  const ay = sj[1] - si[1];
  const c = (sj[0] ** 2 + sj[1] ** 2 - si[0] ** 2 - si[1] ** 2) / 2;
  const f = (p) => p[0] * ax + p[1] * ay - c; // keep where f ≤ 0
  const out = [];
  for (let k = 0; k < poly.length; k++) {
    const A = poly[k];
    const B = poly[(k + 1) % poly.length];
    const fA = f(A);
    const fB = f(B);
    if (fA <= 0) out.push(A);
    if ((fA < 0 && fB > 0) || (fA > 0 && fB < 0)) {
      const t = fA / (fA - fB);
      out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
    }
  }
  return out;
}

// Voronoi cell for site i: start from the bbox rectangle, clip by every other site.
function voronoiCell(sites, i, bbox) {
  let poly = [
    [bbox.minLng, bbox.minLat],
    [bbox.maxLng, bbox.minLat],
    [bbox.maxLng, bbox.maxLat],
    [bbox.minLng, bbox.maxLat],
  ];
  for (let j = 0; j < sites.length && poly.length; j++) {
    if (j !== i) poly = clipHalfPlane(poly, sites[i], sites[j]);
  }
  return poly;
}

// Build the GeoJSON Feature stored in Barangay.geojson_boundary.
function boundaryFeature(name, sites, i) {
  const ring = voronoiCell(sites, i, BBOX);
  if (ring.length < 3) return null;
  const closed = [...ring, ring[0]].map(([lng, lat]) => [
    Math.round(lng * 1e6) / 1e6,
    Math.round(lat * 1e6) / 1e6,
  ]);
  return {
    type: 'Feature',
    properties: { name },
    geometry: { type: 'Polygon', coordinates: [closed] },
  };
}

module.exports = { BBOX, boundaryFeature, voronoiCell };
