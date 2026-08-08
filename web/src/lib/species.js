// Curated wildlife reference content for the public Wildlife & Biodiversity
// module. Educational only — species commonly encountered in the Laguna de Bay /
// Cabuyao area. Conservation labels follow IUCN/DENR categories at a high level.
//
// ADDING A PHOTO
// Drop the image in `web/public/species/` and set `photo` to its path, e.g.
// `photo: '/species/philippine-duck.jpg'`. Cards without a photo fall back to
// a text-only layout, so the grid stays correct while photos are collected.
//
// Use only public-domain or CC-licensed images and fill in `credit` so the
// attribution renders under the species guide. An academic deliverable should
// not ship photos it has no right to use. Aim for landscape shots around
// 800px wide and under ~120KB so the page stays fast.

export const CONSERVATION_TONE = {
  Endemic: { bg: 'bg-purple-100', fg: 'text-purple-800' },
  Vulnerable: { bg: 'bg-amber-100', fg: 'text-amber-800' },
  'Near Threatened': { bg: 'bg-orange-100', fg: 'text-orange-800' },
  Native: { bg: 'bg-emerald-100', fg: 'text-emerald-800' },
  Common: { bg: 'bg-slate-100', fg: 'text-slate-700' },
  'Caution: Venomous': { bg: 'bg-red-100', fg: 'text-red-800' },
};

export const SPECIES = [
  {
    name: 'Philippine Duck',
    scientific: 'Anas luzonica',
    group: 'Bird',
    status: 'Vulnerable',
    photo: '/species/philippine-duck.jpg',
    credit: 'Ken Billington, CC BY-SA 3.0',
    blurb:
      'An endemic dabbling duck of Philippine wetlands, including the marshes around Laguna de Bay. Populations have declined from hunting and habitat loss.',
    note: 'Do not capture. Report sightings so CENRO can monitor wetland populations.',
  },
  {
    name: 'Philippine Eagle-Owl',
    scientific: 'Bubo philippensis',
    group: 'Bird',
    status: 'Endemic',
    photo: '/species/philippine-eagle-owl.jpg',
    credit: 'Aimee Valencia, CC BY-SA 4.0',
    blurb:
      "The country's largest owl, found only in the Philippines. It hunts at night near rivers and forest edges.",
    note: 'If found grounded or injured, keep your distance and arrange a turnover. Talons are powerful.',
  },
  {
    name: 'Large Flying Fox',
    scientific: 'Pteropus vampyrus',
    group: 'Mammal',
    status: 'Near Threatened',
    photo: '/species/large-flying-fox.jpg',
    credit: 'NobbiP, CC BY-SA 3.0',
    blurb:
      'A large fruit bat important for pollination and seed dispersal. Roosts in colonies and forages on fruit trees at night.',
    note: 'Never handle bats with bare hands (rabies risk). Report roosts or grounded individuals.',
  },
  {
    name: 'Asian Palm Civet',
    scientific: 'Paradoxurus hermaphroditus',
    group: 'Mammal',
    status: 'Native',
    photo: '/species/asian-palm-civet.jpg',
    credit: 'Bernard DUPONT, CC BY-SA 2.0',
    blurb:
      'Locally known as "musang," a small nocturnal mammal that helps disperse seeds. Sometimes strays into urban barangays.',
    note: 'Do not keep as a pet. Turn over to CENRO for safe release.',
  },
  {
    name: 'Asian Water Monitor',
    scientific: 'Varanus salvator',
    group: 'Reptile',
    status: 'Native',
    photo: '/species/asian-water-monitor.jpg',
    credit: 'Carlos Delgado, CC BY-SA 4.0',
    blurb:
      'A large semi-aquatic lizard common near creeks, rivers and the lakeshore. Generally shy and beneficial as a scavenger.',
    note: 'Usually harmless if left alone. If trapped in a property, request a turnover rather than harming it.',
  },
  {
    name: 'Reticulated Python',
    scientific: 'Malayopython reticulatus',
    group: 'Reptile',
    status: 'Native',
    photo: '/species/reticulated-python.jpg',
    credit: 'Mariluna, CC BY-SA 3.0',
    blurb:
      "The world's longest snake, native to the Philippines. Non-venomous; controls rodent populations.",
    note: 'Do not attempt to catch large individuals. Keep people and pets back and call for a turnover.',
  },
  {
    name: 'Philippine Cobra',
    scientific: 'Naja philippinensis',
    group: 'Reptile',
    status: 'Caution: Venomous',
    photo: '/species/philippine-cobra.jpg',
    credit: 'Mario Lutz, CC BY-SA 3.0',
    blurb:
      'A highly venomous spitting cobra endemic to the northern Philippines. Found in fields and near water.',
    note: 'Do NOT approach. Move people away, keep it in sight from a safe distance, and report immediately.',
  },
  {
    name: 'Black-crowned Night Heron',
    scientific: 'Nycticorax nycticorax',
    group: 'Bird',
    status: 'Common',
    photo: '/species/black-crowned-night-heron.jpg',
    credit: 'ramidos, CC BY 4.0',
    blurb:
      'A stocky wading bird often seen at dusk around Laguna de Bay fishponds and creeks, feeding on fish and frogs.',
    note: 'A healthy part of the wetland ecosystem. Report only if injured or entangled.',
  },
  {
    name: 'Collared Kingfisher',
    scientific: 'Todiramphus chloris',
    group: 'Bird',
    status: 'Common',
    photo: '/species/collared-kingfisher.jpg',
    credit: 'JJ Harrison, CC BY-SA 3.0',
    blurb:
      'A bright blue-and-white kingfisher common along waterways and mangroves; an indicator of healthy creeks.',
    note: 'Protect creekside vegetation where they nest. Report injured birds.',
  },
  {
    name: 'Southeast Asian Box Turtle',
    scientific: 'Cuora amboinensis',
    group: 'Reptile',
    status: 'Vulnerable',
    photo: '/species/southeast-asian-box-turtle.jpg',
    credit: 'Cuora (English Wikipedia), CC BY-SA 3.0',
    blurb:
      'A semi-aquatic turtle threatened by the pet and wildlife trade. Sometimes surrendered or found in flooded areas.',
    note: 'Never buy or sell. Turn over to CENRO for assessment and release.',
  },
];

// "What to do if you find wildlife" — quick guidance shown on the page.
export const FIELD_GUIDANCE = [
  {
    title: 'Keep a safe distance',
    text: 'Do not corner, chase, or handle the animal, especially snakes, raptors, and bats. Keep children and pets away.',
  },
  {
    title: 'Do not keep or sell it',
    text: 'Possessing or trading protected wildlife is illegal (R.A. 9147). Native species belong in the wild.',
  },
  {
    title: 'Report a turnover',
    text: 'File a wildlife turnover so CENRO can document species, condition, and chain-of-custody, then arrange rescue or release.',
  },
  {
    title: 'Endangered species are protected',
    text: 'Exact locations of endangered species are obfuscated on public maps to deter poaching.',
  },
];
