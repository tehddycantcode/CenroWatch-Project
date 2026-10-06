// Direct unit tests for species.validators.js's express-validator chains - run
// against a bare req object and inspected with validationResult(), the
// documented way to exercise a validation chain without an HTTP server. This
// backend has no supertest and none is being added for this.
//
// One regression, two tests: category is now REQUIRED on create and stays
// OPTIONAL on update. It matters because species.service.resolveSpecies()
// auto-assigns `category` onto every report filed against a species, only
// falling back to a client-sent category for a row whose own category is
// null - a real species saved with no category would reopen that
// client-controlled path. biome/indicator are merely descriptive and are not
// covered here; omitting one only thins the identification card.

const { validationResult } = require('express-validator');
const { createSpeciesRules, updateSpeciesRules } = require('../src/validators/species.validators');

async function runRules(rules, body) {
  const req = { body };
  await Promise.all(rules.map((rule) => rule.run(req)));
  return validationResult(req);
}

describe('species.validators - category required on create, optional on update', () => {
  test('create rejects a payload with no category', async () => {
    const result = await runRules(createSpeciesRules, { name: 'Test Frog' });
    expect(result.isEmpty()).toBe(false);
    expect(result.array().some((e) => e.path === 'category')).toBe(true);
  });

  // The functional/descriptive split from the schema.prisma comment: create
  // still accepts an omitted biome and indicator, because those two are not
  // part of this guard.
  test('create accepts a payload with category but no biome or indicator', async () => {
    const result = await runRules(createSpeciesRules, { name: 'Test Frog', category: 'Mammal' });
    expect(result.isEmpty()).toBe(true);
  });

  // An update sends only the fields that changed. Requiring category here
  // would reject every edit that does not touch it - fixing a typo in
  // handling_note, retiring a species, flipping is_endangered - none of which
  // has anything to do with category.
  test('update accepts a payload that omits category entirely', async () => {
    const result = await runRules(updateSpeciesRules, { local_name: 'bakaw' });
    expect(result.isEmpty()).toBe(true);
  });
});
