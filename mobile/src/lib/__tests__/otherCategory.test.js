const {
  OTHER_DETAIL_MAX,
  DESCRIPTION_MAX,
  isOtherCategory,
  withOtherDetail,
} = require('../otherCategory');

describe('isOtherCategory', () => {
  test('recognises the seeded catch-all categories', () => {
    expect(isOtherCategory('Other')).toBe(true);
    expect(isOtherCategory('Other_Service')).toBe(true);
  });

  test('ignores case and surrounding space', () => {
    expect(isOtherCategory('other')).toBe(true);
    expect(isOtherCategory('  Other_Service  ')).toBe(true);
  });

  test('leaves real categories alone', () => {
    expect(isOtherCategory('Illegal_Dumping')).toBe(false);
    expect(isOtherCategory('Tree_Cutting_Permit')).toBe(false);
  });

  // An Administrator adding "Other_Waste" has created a real category with its
  // own meaning, not a prompt to type something. Exact match, not a prefix.
  test('does not match a category that merely starts with Other', () => {
    expect(isOtherCategory('Other_Waste')).toBe(false);
  });

  test('survives an empty or missing value', () => {
    expect(isOtherCategory('')).toBe(false);
    expect(isOtherCategory(undefined)).toBe(false);
    expect(isOtherCategory(null)).toBe(false);
  });
});

describe('withOtherDetail', () => {
  // The detail goes FIRST: the queue still shows only "Other", so this line is
  // the earliest point at which staff learn what was actually reported.
  test('folds the typed detail in as the first line', () => {
    expect(withOtherDetail('There are dead fish.', 'Dead fish in the creek')).toBe(
      'Other: Dead fish in the creek\n\nThere are dead fish.'
    );
  });

  test('trims the typed detail', () => {
    expect(withOtherDetail('Body.', '  Dead fish  ')).toBe('Other: Dead fish\n\nBody.');
  });

  // A normal category, or Other with nothing typed, must not gain a prefix.
  test('returns the description untouched when nothing was typed', () => {
    expect(withOtherDetail('Body.', '')).toBe('Body.');
    expect(withOtherDetail('Body.', '   ')).toBe('Body.');
    expect(withOtherDetail('Body.', undefined)).toBe('Body.');
  });
});

describe('limits', () => {
  // The server validates description at 10-5000 characters. The form has to
  // respect that itself, or a resident who writes a long description gets a
  // 422 about a field they did not touch.
  test('exposes the caps the forms enforce', () => {
    expect(OTHER_DETAIL_MAX).toBe(100);
    expect(DESCRIPTION_MAX).toBe(5000);
  });

  test('the folded result can be measured against the server limit', () => {
    const description = 'x'.repeat(DESCRIPTION_MAX);
    expect(withOtherDetail(description, 'something').length).toBeGreaterThan(DESCRIPTION_MAX);
  });
});
