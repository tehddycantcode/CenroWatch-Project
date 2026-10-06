// Pre-migration audit. Reports which values already in WildlifeTurnover have no
// home in the new schema, BEFORE a migration that would fail or silently
// corrupt them.
//
// Two questions:
//   1. Which species_name values have no Species row? Each one blocks the
//      foreign key. Fix by adding an INACTIVE Species row per name - that
//      preserves history without offering it on new forms. Never edit a
//      historical species_name.
//   2. Which species_category values are outside Bird/Mammal/Reptile? The old
//      column was free text with an editable input, so anything is possible.
//      Each becomes NULL rather than a guessed enum value.
//
// RUN THIS ON ALL THREE DATABASES - native 3306, Docker 3307, Railway. They hold
// different data, and the Docker one has previously been found missing rows
// entirely.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CATEGORIES = ['Bird', 'Mammal', 'Reptile'];

const turnovers = await prisma.wildlifeTurnover.findMany({
  select: { turnover_id: true, reference_id: true, species_name: true, species_category: true },
});
const known = new Set((await prisma.species.findMany({ select: { name: true } })).map((s) => s.name));

const orphanNames = new Map();
const badCategories = new Map();
for (const t of turnovers) {
  if (!known.has(t.species_name)) {
    if (!orphanNames.has(t.species_name)) orphanNames.set(t.species_name, []);
    orphanNames.get(t.species_name).push(t.reference_id);
  }
  const c = t.species_category;
  if (c && !CATEGORIES.includes(c)) {
    if (!badCategories.has(c)) badCategories.set(c, []);
    badCategories.get(c).push(t.reference_id);
  }
}

console.log(`Reports: ${turnovers.length}   Catalogue rows: ${known.size}`);
console.log(`\n1. species_name values with NO catalogue row: ${orphanNames.size}`);
for (const [name, refs] of orphanNames) {
  console.log(`   ${JSON.stringify(name)}  (${refs.length}): ${refs.slice(0, 5).join(', ')}${refs.length > 5 ? ' …' : ''}`);
}
if (orphanNames.size) {
  console.log('\n   Add each as an INACTIVE species before adding the foreign key:');
  for (const name of orphanNames.keys()) {
    console.log(`   await prisma.species.create({ data: { name: ${JSON.stringify(name)}, is_active: false, is_endangered: true } });`);
  }
}

console.log(`\n2. species_category values outside ${CATEGORIES.join('/')}: ${badCategories.size}`);
for (const [cat, refs] of badCategories) {
  console.log(`   ${JSON.stringify(cat)}  (${refs.length}): ${refs.slice(0, 5).join(', ')}${refs.length > 5 ? ' …' : ''}`);
}

console.log(orphanNames.size === 0 ? '\nSafe to add the foreign key.' : '\nFOREIGN KEY WILL FAIL. Resolve item 1 first.');
await prisma.$disconnect();
