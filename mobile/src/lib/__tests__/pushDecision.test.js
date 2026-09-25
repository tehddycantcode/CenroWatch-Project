const {
  DECISION,
  ALLOW_ACTION,
  shouldPrompt,
  allowAction,
  preferenceKey,
  trackingIdFromResponse,
  responseKey,
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

describe('trackingIdFromResponse', () => {
  const response = (data) => ({ notification: { request: { content: { data } } } });

  test('reads the reference the server put in data', () => {
    expect(trackingIdFromResponse(response({ trackingId: 'CMP-2026-00055', kind: 'complaint' }))).toBe(
      'CMP-2026-00055'
    );
  });

  // The banner deliberately carries no reference, so this nested path is the
  // ONLY thing that gets a resident to the right report. Every level of it is
  // optional in Expo's types, and a silent undefined here looks exactly like
  // "tapping the notification does nothing".
  test('returns null rather than throwing on a malformed or empty response', () => {
    expect(trackingIdFromResponse(undefined)).toBeNull();
    expect(trackingIdFromResponse(null)).toBeNull();
    expect(trackingIdFromResponse({})).toBeNull();
    expect(trackingIdFromResponse({ notification: {} })).toBeNull();
    expect(trackingIdFromResponse(response(undefined))).toBeNull();
    expect(trackingIdFromResponse(response({ kind: 'complaint' }))).toBeNull();
  });
});

describe('responseKey', () => {
  // A cold start reads the pending response AND the listener may deliver the
  // same tap, so both paths have to agree on an identity or the resident gets
  // navigated twice for one tap.
  test('is stable for the same notification', () => {
    const r = { notification: { request: { identifier: 'abc-123' } } };
    expect(responseKey(r)).toEqual(responseKey({ ...r }));
  });

  test('differs between notifications', () => {
    const a = { notification: { request: { identifier: 'abc-123' } } };
    const b = { notification: { request: { identifier: 'def-456' } } };
    expect(responseKey(a)).not.toEqual(responseKey(b));
  });

  test('survives a response with no identifier', () => {
    expect(() => responseKey({})).not.toThrow();
    expect(responseKey({})).toBeTruthy();
  });
});
