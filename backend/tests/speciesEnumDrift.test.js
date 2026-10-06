// A drift guard between species.service.js's hardcoded value lists and the
// Prisma enums they mirror.
//
// Prisma does not export enum members in a form usable by a plain array or
// Set at runtime, so species.service.js keeps its own copy - CATEGORY_VALUES
// today, and BIOME_VALUES/INDICATOR_VALUES/HAZARD_VALUES as later tasks add
// them. Nothing keeps a copy and its enum in step: add `Amphibian` to
// SpeciesCategory in schema.prisma and a resident's correct pick is silently
// filtered to null by `CATEGORY_VALUES.includes()`, with no error anywhere -
// resolveSpecies falls back to treating it as unset, same as a typo. This
// test reads both sides from source and fails the moment they disagree,
// rather than waiting for a resident to notice their answer vanished.
//
// Modelled on tests/statusPartitions.test.js. Add a row to CASES for each new
// mirror a later task introduces, rather than writing a new test file.

jest.mock('../src/utils/prisma', () => ({}));

const fs = require('fs');
const path = require('path');

const species = require('../src/services/species.service');

function enumValues(name) {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const block = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`).exec(schema);
  expect(block).not.toBeNull();
  return block[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean);
}

// [ exported constant name, the Prisma enum it must mirror ]
const CASES = [
  ['CATEGORY_VALUES', 'SpeciesCategory'],
  ['BIOME_VALUES', 'SpeciesBiome'],
  ['INDICATOR_VALUES', 'SpeciesIndicator'],
  ['HAZARD_VALUES', 'SpeciesHazard'],
];

describe('species.service value mirrors match their Prisma enum', () => {
  test.each(CASES)('%s mirrors %s', (constName, enumName) => {
    expect(species[constName].toSorted()).toEqual(enumValues(enumName).toSorted());
  });
});
