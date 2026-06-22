// CENROWATCH — database seed
// Seeds the 18 barangays of Cabuyao City (Part 15) and baseline system settings.
// Run AFTER a successful migration:  node prisma/seed.js
// Idempotent: uses upsert keyed on the unique barangay name.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const barangays = [
  { name: 'Baclaran', latitude: 14.2561, longitude: 121.1189 },
  { name: 'Banay-Banay', latitude: 14.2634, longitude: 121.1231 },
  { name: 'Banlic', latitude: 14.2701, longitude: 121.1098 },
  { name: 'Bigaa', latitude: 14.2789, longitude: 121.1312 },
  { name: 'Butong', latitude: 14.2823, longitude: 121.1187 },
  { name: 'Casile', latitude: 14.2612, longitude: 121.1401 },
  { name: 'Diezmo', latitude: 14.2734, longitude: 121.1054 },
  { name: 'Gulod', latitude: 14.2867, longitude: 121.1289 },
  { name: 'Mamatid', latitude: 14.2698, longitude: 121.1356 },
  { name: 'Marinig', latitude: 14.2756, longitude: 121.1245 },
  { name: 'Niugan', latitude: 14.2812, longitude: 121.1167 },
  { name: 'Pittland', latitude: 14.2645, longitude: 121.1078 },
  { name: 'Poblacion Dos', latitude: 14.2778, longitude: 121.1334 },
  { name: 'Poblacion Tres', latitude: 14.2801, longitude: 121.1312 },
  { name: 'Poblacion Uno', latitude: 14.2756, longitude: 121.1289 },
  { name: 'Pulo', latitude: 14.2723, longitude: 121.1178 },
  { name: 'Sala', latitude: 14.2812, longitude: 121.1267 }, // CENRO office location
  { name: 'San Isidro', latitude: 14.2845, longitude: 121.1223 },
];

// --- Approximate barangay boundaries (Thiessen / Voronoi polygons) ----------
// Official LGU shapefiles for Cabuyao aren't bundled, and the centroids above
// are themselves approximate. We derive each barangay's extent as its Voronoi
// cell — the area closer to that centroid than to any other — clipped to the
// city's bounding box. This yields 18 contiguous, non-overlapping polygons that
// drive the GIS density choropleth. Swap in surveyed boundaries later without
// touching any rendering code (the column already holds a GeoJSON Feature).
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

const settings = [
  { setting_key: 'complaint_sla_minutes', setting_value: '3365', description: 'Citizens Charter complaint SLA: 2d 8h 5m in minutes' },
  { setting_key: 'wildlife_sla_minutes', setting_value: '3218', description: 'Citizens Charter wildlife SLA: 2d 5h 38m in minutes' },
  { setting_key: 'request_seedling_sla_minutes', setting_value: '25', description: 'Seedling request SLA: 25 minutes' },
  { setting_key: 'request_env_education_sla_minutes', setting_value: '187', description: 'Environmental education request SLA: 3h 7m in minutes' },
];

async function main() {
  console.log('Seeding barangays...');
  const sites = barangays.map((b) => [b.longitude, b.latitude]);
  for (let i = 0; i < barangays.length; i++) {
    const b = barangays[i];
    const geojson_boundary = boundaryFeature(b.name, sites, i);
    await prisma.barangay.upsert({
      where: { name: b.name },
      update: { latitude: b.latitude, longitude: b.longitude, geojson_boundary },
      create: { ...b, geojson_boundary },
    });
  }
  console.log(`  ${barangays.length} barangays seeded (with Voronoi boundaries).`);

  console.log('Seeding system settings...');
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { setting_key: s.setting_key },
      update: { setting_value: s.setting_value, description: s.description },
      create: s,
    });
  }
  console.log(`  ${settings.length} settings seeded.`);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
