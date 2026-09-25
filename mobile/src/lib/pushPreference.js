// What this resident chose when our permission modal asked them.
//
// Keyed PER USER (preferenceKey lives in ./pushDecision): two residents can
// share a phone, and one person's decline must not silence the prompt for the
// next person to sign in - they would never be asked, and never learn their
// report had moved.
//
// SecureStore rather than AsyncStorage only because it is already a dependency
// here; this value is a preference, not a secret.
//
// Both reads and writes swallow their errors. A keychain that will not answer
// is not a reason to break sign-in or to hide the prompt forever - the worst
// case either way is being asked once more on the next launch.

import * as SecureStore from 'expo-secure-store';
import { DECISION, preferenceKey } from './pushDecision';

export async function getDecision(userId) {
  if (userId == null) return DECISION.UNDECIDED;
  try {
    const raw = await SecureStore.getItemAsync(preferenceKey(userId));
    return raw || DECISION.UNDECIDED;
  } catch {
    return DECISION.UNDECIDED;
  }
}

export async function setDecision(userId, decision) {
  if (userId == null) return;
  try {
    await SecureStore.setItemAsync(preferenceKey(userId), decision);
  } catch {
    // Non-fatal: the worst case is being asked again next launch.
  }
}
