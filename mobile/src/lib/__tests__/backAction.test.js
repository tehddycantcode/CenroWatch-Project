const {
  BACK,
  resolveBackAction,
  resolveAuthBackAction,
} = require('../backAction');

describe('resolveBackAction (resident area)', () => {
  const at = (over = {}) => ({ sheetOpen: false, stackDepth: 1, tab: 'dashboard', ...over });

  // An open sheet is the topmost thing on screen, so back dismisses it before
  // it touches navigation - otherwise back appears to do nothing, because the
  // screen changes underneath a sheet that stays put.
  test('closes the report sheet first, whatever else is true', () => {
    expect(resolveBackAction(at({ sheetOpen: true }))).toBe(BACK.CLOSE_SHEET);
    expect(resolveBackAction(at({ sheetOpen: true, stackDepth: 3 }))).toBe(BACK.CLOSE_SHEET);
    expect(resolveBackAction(at({ sheetOpen: true, tab: 'profile' }))).toBe(BACK.CLOSE_SHEET);
  });

  // The bug this module exists for: a pushed screen (a form, a report detail)
  // must return to what opened it instead of closing the app.
  test('pops a pushed screen', () => {
    expect(resolveBackAction(at({ stackDepth: 2 }))).toBe(BACK.GO_BACK);
    expect(resolveBackAction(at({ stackDepth: 5 }))).toBe(BACK.GO_BACK);
  });

  // From a secondary tab, back goes to Home rather than straight out. Leaving
  // an app from My Reports is rarely what someone means by "back".
  test('returns to Home from another tab root', () => {
    expect(resolveBackAction(at({ tab: 'reports' }))).toBe(BACK.GO_HOME);
    expect(resolveBackAction(at({ tab: 'profile' }))).toBe(BACK.GO_HOME);
  });

  // Only here does Android get to do its default thing.
  test('exits only from the Home root with nothing open', () => {
    expect(resolveBackAction(at())).toBe(BACK.EXIT);
  });
});

describe('resolveAuthBackAction (signed out)', () => {
  // Register and Forgot password are pushed from Login, so back belongs to
  // Login. Before this, back from either one closed the app outright.
  test('returns to the sign-in screen', () => {
    expect(resolveAuthBackAction('register')).toBe(BACK.GO_LOGIN);
    expect(resolveAuthBackAction('forgot')).toBe(BACK.GO_LOGIN);
  });

  test('exits from the sign-in screen itself', () => {
    expect(resolveAuthBackAction('login')).toBe(BACK.EXIT);
  });

  test('treats an unknown screen as the sign-in screen', () => {
    expect(resolveAuthBackAction(undefined)).toBe(BACK.EXIT);
  });
});
