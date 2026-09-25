// When to show the notification permission prompt, and what its Allow button
// should do.
//
// Deliberately pure and import-free: this is the only part of push that can be
// reasoned about without a device, so it is the only part that gets unit tests.
// It uses module.exports rather than `export` so a plain node jest can require
// it with no babel step; Metro handles both, so the app's ESM import still works.
//
// `decision` is what the resident tapped in OUR modal, which is NOT the same as
// the OS permission state. Tapping Allow counts as decided even if they then
// refused the system dialog - otherwise the modal returns on every launch,
// which is the nagging the design rules out. The Profile toggle is the way back.

const DECISION = { UNDECIDED: 'undecided', ALLOWED: 'allowed', DECLINED: 'declined' };
const ALLOW_ACTION = { ASK_OS: 'ask-os', OPEN_SETTINGS: 'open-settings' };

function shouldPrompt({ osStatus, decision }) {
  if (osStatus === 'granted') return false;
  return decision === DECISION.UNDECIDED;
}

// Android allows roughly two system dialogs and iOS exactly one. Once
// canAskAgain is false the dialog will never appear again, so the app's
// notification settings screen is the only remaining route - asking the OS
// would return "denied" instantly with nothing shown to the person.
function allowAction({ canAskAgain }) {
  return canAskAgain ? ALLOW_ACTION.ASK_OS : ALLOW_ACTION.OPEN_SETTINGS;
}

// Scoped per user: two residents can share a phone, and one person's decline
// must not silence the prompt for the next person to sign in - they would never
// be asked, and never learn their report had moved.
function preferenceKey(userId) {
  return `cenrowatch_push_decision_${userId}`;
}

module.exports = { DECISION, ALLOW_ACTION, shouldPrompt, allowAction, preferenceKey };
