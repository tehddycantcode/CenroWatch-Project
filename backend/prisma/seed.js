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

const settings = [
  { setting_key: 'complaint_sla_minutes', setting_value: '3365', description: 'Citizens Charter complaint SLA: 2d 8h 5m in minutes' },
  { setting_key: 'wildlife_sla_minutes', setting_value: '3218', description: 'Citizens Charter wildlife SLA: 2d 5h 38m in minutes' },
  { setting_key: 'request_seedling_sla_minutes', setting_value: '25', description: 'Seedling request SLA: 25 minutes' },
  { setting_key: 'request_env_education_sla_minutes', setting_value: '187', description: 'Environmental education request SLA: 3h 7m in minutes' },
];

async function main() {
  console.log('Seeding barangays...');
  for (const b of barangays) {
    await prisma.barangay.upsert({
      where: { name: b.name },
      update: { latitude: b.latitude, longitude: b.longitude },
      create: b,
    });
  }
  console.log(`  ${barangays.length} barangays seeded.`);

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
