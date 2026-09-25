// What Android's back button should do, given what is currently on screen.
//
// This app navigates with its own stack held in React state rather than
// react-navigation, so nothing tells the OS about that stack. Left alone,
// Android treats every back press as "leave the activity" and closes the app -
// from a report form, from a detail screen, from Register, from anywhere. The
// navigators feed their state in here and act on the answer.
//
// Pure and import-free on purpose, so the rules can be tested without a device;
// the wiring that calls it cannot be. module.exports for the same reason as
// pushDecision.js - a plain node jest with no babel step.

const BACK = {
  CLOSE_SHEET: 'close-sheet',
  GO_BACK: 'go-back',
  GO_HOME: 'go-home',
  GO_LOGIN: 'go-login',
  EXIT: 'exit',
};

const HOME_TAB = 'dashboard';

/**
 * Signed-in area.
 * @param {{sheetOpen: boolean, stackDepth: number, tab: string}} state
 */
function resolveBackAction({ sheetOpen, stackDepth, tab } = {}) {
  // Topmost first. A sheet that stays put while the screen changes behind it
  // reads as the back button being broken.
  if (sheetOpen) return BACK.CLOSE_SHEET;
  // Anything pushed on top of a tab root returns to what opened it.
  if (stackDepth > 1) return BACK.GO_BACK;
  // From a secondary tab, Home is the expected destination - dropping someone
  // out of the app from My Reports is rarely what they meant by back.
  if (tab && tab !== HOME_TAB) return BACK.GO_HOME;
  return BACK.EXIT;
}

/**
 * Signed-out area: Register and Forgot password are opened from Login.
 * @param {string} screen
 */
function resolveAuthBackAction(screen) {
  return screen && screen !== 'login' ? BACK.GO_LOGIN : BACK.EXIT;
}

module.exports = { BACK, HOME_TAB, resolveBackAction, resolveAuthBackAction };
