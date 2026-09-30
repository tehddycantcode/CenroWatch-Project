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
  // Point A for the distance line on the staff report detail page. Inside Cabuyao
  // City Hall. Clear either value to switch that line off; an Admin can correct
  // both from the Settings page without a deploy.
  { setting_key: 'cenro_office_lat', setting_value: '14.271764542862766', description: 'Latitude of the CENRO Cabuyao office. Used to measure how far a report is from the office' },
  { setting_key: 'cenro_office_lng', setting_value: '121.12434099651512', description: 'Longitude of the CENRO Cabuyao office. Used to measure how far a report is from the office' },
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

// Wildlife species catalogue. Migrated from web/src/lib/species.js, which was a
// frozen array compiled into the web bundle and invisible to mobile.
//
// biome and is_endangered are NEW judgements - they were not in the old array.
// is_endangered decides public-map coordinate obfuscation, so it is a legal
// DENR/protected-species call rather than an IUCN label: `indicator` carries the
// IUCN-flavoured standing separately. The values below are the conservative
// reading and are flagged for verification in the spec (section 10, item 5).
const species = [
  {
    name: 'Philippine Duck', scientific_name: 'Anas luzonica',
    category: 'Bird', biome: 'Lakeshore_Wetland', indicator: 'Vulnerable',
    hazard: 'None', is_endangered: true, sort_order: 1,
    photo_credit: 'Ken Billington, CC BY-SA 3.0',
    body_description: 'A medium-sized dabbling duck with a cinnamon head, black crown and stripe through the eye, and a blue-grey bill. Endemic to the Philippines.',
    handling_note: 'Do not capture. Report sightings so CENRO can monitor wetland populations.',
  },
  {
    name: 'Philippine Eagle-Owl', scientific_name: 'Bubo philippensis',
    category: 'Bird', biome: 'Forest', indicator: 'Endemic',
    hazard: 'Powerful_Bite_Or_Talons', is_endangered: true, sort_order: 2,
    photo_credit: 'Aimee Valencia, CC BY-SA 4.0',
    body_description: "The country's largest owl. Rufous-brown plumage, prominent ear tufts, large orange eyes. Found only in the Philippines, near rivers and forest edges.",
    handling_note: 'If found grounded or injured, keep your distance and arrange a turnover. Talons are powerful.',
  },
  {
    name: 'Large Flying Fox', scientific_name: 'Pteropus vampyrus',
    category: 'Mammal', biome: 'Forest', indicator: 'Near_Threatened',
    hazard: 'Disease_Risk', is_endangered: true, sort_order: 3,
    photo_credit: 'NobbiP, CC BY-SA 3.0',
    body_description: 'A very large fruit bat with a fox-like reddish-brown head, dark wings and a wingspan up to 1.5 m. Roosts in colonies in tall trees.',
    handling_note: 'Never handle bats with bare hands (rabies risk). Report roosts or grounded individuals.',
  },
  {
    name: 'Asian Palm Civet', scientific_name: 'Paradoxurus hermaphroditus',
    local_name: 'musang',
    category: 'Mammal', biome: 'Urban', indicator: 'Native',
    hazard: 'Aggressive', is_endangered: false, sort_order: 4,
    photo_credit: 'Bernard DUPONT, CC BY-SA 2.0',
    body_description: 'A cat-sized nocturnal mammal, shaggy grey-brown coat with dark spots and stripes, a black mask across the face and a long tail.',
    handling_note: 'Do not keep as a pet. It may bite if cornered. Turn over to CENRO for safe release.',
  },
  {
    name: 'Asian Water Monitor', scientific_name: 'Varanus salvator',
    local_name: 'bayawak',
    category: 'Reptile', biome: 'Freshwater', indicator: 'Native',
    hazard: 'Powerful_Bite_Or_Talons', is_endangered: false, sort_order: 5,
    photo_credit: 'Carlos Delgado, CC BY-SA 4.0',
    body_description: 'A large semi-aquatic lizard, up to 2 m, dark grey-brown with yellow spots and bands, a long forked tongue and a strong flattened tail.',
    handling_note: 'Usually harmless if left alone, but it can bite and lash with its tail. If trapped in a property, request a turnover rather than harming it.',
  },
  {
    name: 'Reticulated Python', scientific_name: 'Malayopython reticulatus',
    local_name: 'sawa',
    category: 'Reptile', biome: 'Freshwater', indicator: 'Native',
    hazard: 'Aggressive', is_endangered: false, sort_order: 6,
    photo_credit: 'Mariluna, CC BY-SA 3.0',
    body_description: "The world's longest snake. Olive to tan with a bold black net-like (reticulated) pattern and a thin dark line along the top of the head. Non-venomous.",
    handling_note: 'Do not attempt to catch large individuals. Keep people and pets back and call for a turnover.',
  },
  {
    name: 'Philippine Cobra', scientific_name: 'Naja philippinensis',
    local_name: 'ulupong',
    category: 'Reptile', biome: 'Agricultural', indicator: 'Native',
    hazard: 'Venomous', is_endangered: false, sort_order: 7,
    photo_credit: 'Mario Lutz, CC BY-SA 3.0',
    body_description: 'A stocky snake, uniform light to medium brown, about 1 m long. Rears up and spreads a hood when threatened. HIGHLY VENOMOUS and able to spit venom.',
    handling_note: 'Do NOT approach. Move people away, keep it in sight from a safe distance, and report immediately.',
  },
  {
    name: 'Black-crowned Night Heron', scientific_name: 'Nycticorax nycticorax',
    category: 'Bird', biome: 'Lakeshore_Wetland', indicator: 'Common',
    hazard: 'None', is_endangered: false, sort_order: 8,
    photo_credit: 'ramidos, CC BY 4.0',
    body_description: 'A stocky, short-necked wading bird with a black crown and back, pale grey wings, white underparts and red eyes. Often seen at dusk.',
    handling_note: 'A healthy part of the wetland ecosystem. Report only if injured or entangled.',
  },
  {
    name: 'Collared Kingfisher', scientific_name: 'Todiramphus chloris',
    category: 'Bird', biome: 'Lakeshore_Wetland', indicator: 'Common',
    hazard: 'None', is_endangered: false, sort_order: 9,
    photo_credit: 'JJ Harrison, CC BY-SA 3.0',
    body_description: 'A bright turquoise-blue and white kingfisher with a broad white collar, a heavy black bill and a white stripe above the eye.',
    handling_note: 'Protect creekside vegetation where they nest. Report injured birds.',
  },
  {
    name: 'Southeast Asian Box Turtle', scientific_name: 'Cuora amboinensis',
    local_name: 'pagong',
    category: 'Reptile', biome: 'Freshwater', indicator: 'Vulnerable',
    hazard: 'None', is_endangered: true, sort_order: 10,
    photo_credit: 'Cuora (English Wikipedia), CC BY-SA 3.0',
    body_description: 'A semi-aquatic turtle with a high domed dark-olive shell and three yellow stripes on each side of a black head. The shell closes fully.',
    handling_note: 'Never buy or sell. Turn over to CENRO for assessment and release.',
  },
  // THE SENTINEL ROW. species_name is a required foreign key, so a name a
  // resident types cannot be stored in it - the same problem ComplaintType
  // solves with a real "Other" category and otherCategory.js folding the typed
  // detail into the description's first line. Wildlife follows that.
  //
  // No category/biome/indicator: an unidentified animal has no taxonomy.
  // is_endangered is TRUE, which is what makes the fail-safe for an unknown
  // animal a property of this row rather than a branch in the service - it is
  // routed to Priority_Review and its location is obfuscated on the public map.
  //
  // DO NOT rename or retire this row. species.service.js refuses both, because
  // the specify box and resolveSpecies()'s fallback both key off this literal
  // name.
  {
    name: 'Other', category: null, biome: null, indicator: null,
    hazard: 'None', is_endangered: true, sort_order: 999,
    body_description: null,
    handling_note: 'Treat any unidentified animal as potentially dangerous and possibly protected. Keep your distance, keep children and pets away, and do not attempt to handle it.',
  },
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

  for (const s of species) {
    await prisma.species.upsert({
      where: { name: s.name },
      // CREATE-ONLY, deliberately. The seed runs on every deploy, and unlike a
      // barangay, EVERY species field is the Admin's to edit from the Species
      // screen - including is_endangered, which decides whether a report's
      // coordinates are hidden on the public map. `update: s` would silently
      // revert their work on the next deploy, with nothing in the log to
      // distinguish "unchanged" from "reverted". It is the same reason the
      // complaintType loop above hand-picks the fields it updates.
      //
      // To change the seeded content of a species that already exists, edit it
      // in the admin screen - not here.
      update: {},
      create: s,
    });
  }
  console.log(`  ${species.length} species seeded (including the "Other" sentinel).`);

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
