const {
  DECISION,
  ALLOW_ACTION,
  shouldPrompt,
  allowAction,
  preferenceKey,
} = require('../pushDecision');

describe('shouldPrompt', () => {
  test('prompts when undecided and permission not granted', () => {
    expect(shouldPrompt({ osStatus: 'undetermined', decision: DECISION.UNDECIDED })).toBe(true);
    expect(shouldPrompt({ osStatus: 'denied', decision: DECISION.UNDECIDED })).toBe(true);
  });

  test('never prompts once permission is granted', () => {
    expect(shouldPrompt({ osStatus: 'granted', decision: DECISION.UNDECIDED })).toBe(false);
    expect(shouldPrompt({ osStatus: 'granted', decision: DECISION.ALLOWED })).toBe(false);
  });

  // The whole point of decision 3 in the spec: declining stops the prompt for
  // good. The Profile toggle is the way back, not another launch prompt.
  test('never prompts after an explicit decline', () => {
    expect(shouldPrompt({ osStatus: 'denied', decision: DECISION.DECLINED })).toBe(false);
    expect(shouldPrompt({ osStatus: 'undetermined', decision: DECISION.DECLINED })).toBe(false);
  });

  // Tapping Allow and then refusing the OS dialog still counts as decided:
  // re-prompting every launch after that is the nagging the spec rules out.
  test('does not prompt again after Allow, even if the OS dialog was refused', () => {
    expect(shouldPrompt({ osStatus: 'denied', decision: DECISION.ALLOWED })).toBe(false);
  });
});

describe('allowAction', () => {
  test('asks the OS while the dialog is still available', () => {
    expect(allowAction({ canAskAgain: true })).toBe(ALLOW_ACTION.ASK_OS);
  });

  test('sends the person to settings once the dialog is spent', () => {
    expect(allowAction({ canAskAgain: false })).toBe(ALLOW_ACTION.OPEN_SETTINGS);
  });
});

describe('preferenceKey', () => {
  // Review Focus 1: two residents sharing one phone. A single shared key would
  // let the first person's "declined" silence the prompt for the second, who
  // would then never be asked and never learn their report had moved.
  test('is scoped per user', () => {
    expect(preferenceKey(9)).not.toEqual(preferenceKey(10));
  });

  test('is stable for the same user', () => {
    expect(preferenceKey(9)).toEqual(preferenceKey(9));
  });

  // SecureStore keys must be alphanumeric plus ".-_"; anything else throws.
  test('produces a SecureStore-legal key', () => {
    expect(preferenceKey(9)).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
