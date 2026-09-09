// CENROWATCH — database seed
// Seeds the 18 barangays of Cabuyao City (Part 15) and baseline system settings.
// Run AFTER a successful migration:  node prisma/seed.js
// Idempotent: uses upsert keyed on the unique barangay name.

// The SHARED client, not a fresh PrismaClient: src/utils/prisma.js is wrapped in
// the field-encryption extension, and a client built here would bypass it and
// seed personal fields in plaintext with nothing to show for it.
const prisma = require('../src/utils/prisma');

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
// Moved to src/utils/barangayBoundaries.js so the admin barangay CRUD derives
// boundaries with the SAME code. A cell is defined relative to every other
// site, so any mutation must recompute the whole set; two copies would drift.
const { boundaryFeature } = require('../src/utils/barangayBoundaries');

const settings = [
  { setting_key: 'complaint_sla_minutes', setting_value: '3365', description: 'Complaint response budget in WORKING minutes (Mon-Fri). Clock starts on approval. 3365 = the Citizens Charter figure' },
  { setting_key: 'wildlife_sla_minutes', setting_value: '3218', description: 'Wildlife response budget in WORKING minutes (Mon-Fri). Clock starts at submission' },
  { setting_key: 'request_seedling_sla_minutes', setting_value: '25', description: 'Seedling request budget in WORKING minutes. Clock starts on approval' },
  { setting_key: 'request_env_education_sla_minutes', setting_value: '187', description: 'Environmental education budget in WORKING minutes. Clock starts on approval' },
];

// The eight complaint categories that were the ComplaintType enum. `label` is
// left null wherever humanize(name) already reads correctly.
const complaintTypes = [
  { name: 'Illegal_Dumping', sort_order: 1 },
  { name: 'Open_Burning', sort_order: 2 },
  { name: 'Noise_Disturbance', sort_order: 3 },
  { name: 'Improper_Hazardous_Waste_Storage', sort_order: 4 },
  { name: 'Drainage_Blockage', sort_order: 5 },
  { name: 'Air_Pollution', sort_order: 6 },
  { name: 'Water_Pollution', sort_order: 7 },
  { name: 'Other', sort_order: 8 },
];

// sla_setting_key names the SystemSetting holding this type's Citizens Charter
// budget. NULL means the type has no charter SLA and never gets a deadline -
// true of hauling, cleaning and Other_Service, and unchanged from the hardcoded
// map this replaces.
const requestTypes = [
  { name: 'Garbage_Hauling', sort_order: 1, sla_setting_key: null, sla_fallback_minutes: null },
  { name: 'Creek_River_Cleaning', label: 'Creek / River Cleaning', sort_order: 2, sla_setting_key: null, sla_fallback_minutes: null },
  { name: 'Seedling_Distribution', sort_order: 3, sla_setting_key: 'request_seedling_sla_minutes', sla_fallback_minutes: 25 },
  { name: 'Environmental_Education', sort_order: 4, sla_setting_key: 'request_env_education_sla_minutes', sla_fallback_minutes: 187 },
  { name: 'Other_Service', sort_order: 5, sla_setting_key: null, sla_fallback_minutes: null },
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

  // Report categories. These were Prisma enums until 2026-09-09; they are now
  // rows so an Admin can add or retire one from the UI. Seeding is the ONLY
  // thing that creates the originals - a fresh database has no categories, and
  // without them the report forms are empty and every submission fails its
  // foreign key. `update` deliberately does not touch is_active or label: those
  // are the Admin's to change, and re-running the seed must not undo their work.
  console.log('Seeding report categories...');
  for (const t of complaintTypes) {
    await prisma.complaintType.upsert({
      where: { name: t.name },
      update: { sort_order: t.sort_order },
      create: t,
    });
  }
  for (const t of requestTypes) {
    await prisma.requestType.upsert({
      where: { name: t.name },
      update: {
        sort_order: t.sort_order,
        sla_setting_key: t.sla_setting_key,
        sla_fallback_minutes: t.sla_fallback_minutes,
      },
      create: t,
    });
  }
  console.log(`  ${complaintTypes.length} complaint types, ${requestTypes.length} request types seeded.`);
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
