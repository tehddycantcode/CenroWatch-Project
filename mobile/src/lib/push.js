import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import Constants from 'expo-constants';
import { api } from '../api/client';

// THE NOTIFICATIONS LIBRARY IS REQUIRED LAZILY, AND THAT IS NOT A STYLE CHOICE.
//
// Every module in expo-notifications does its native lookup at module scope -
// `export default requireNativeModule('ExpoPushTokenManager')` and friends - and
// requireNativeModule THROWS when the native module is not in the running
// binary. As a static import that throw lands during bundle evaluation, before
// React renders anything, so a runtime without the native code loses the WHOLE
// APP rather than just notifications. Everyone still on the pre-push APK is
// exactly that runtime. This is the same trap MapPicker.js documents for
// maplibre, and it is worth reading that comment before touching this one.
//
// DO NOT REPLACE THIS WITH try/catch AROUND A TOP-LEVEL IMPORT. In a dev bundle
// Metro hands module-evaluation errors to ErrorUtils.reportFatalError and
// returns undefined without re-throwing, so the catch never runs.
//
// THE PROBE IS requireOptionalNativeModule, NOT TurboModuleRegistry.get.
// MapPicker can use TurboModuleRegistry because maplibre ships a classic React
// Native module. expo-notifications does not: it is an Expo module, registered
// with expo-modules-core's own registry (a JSI host object, falling back to the
// bridge proxy). Asking TurboModuleRegistry for an Expo module name returns null
// even in a build that contains it, which would pin isAvailable() to false and
// leave push permanently, silently dead. requireOptionalNativeModule performs
// the same lookup requireNativeModule does and returns null instead of throwing.
//
// expo-modules-core itself is safe to import at the top: it is part of every
// Expo runtime, including Expo Go.
const NATIVE_PROBES = ['ExpoPushTokenManager', 'ExpoNotificationPermissionsModule'];

let nativeNotifications;
function load() {
  if (nativeNotifications === undefined) {
    // Either probe answering is enough: both come from the same package, so one
    // present means the package is compiled in. If a future version renames
    // them this goes stale and reports "unavailable", which degrades to today's
    // behaviour (no push) rather than to a crash.
    const installed = NATIVE_PROBES.some((name) => requireOptionalNativeModule(name) != null);
    if (!installed) {
      nativeNotifications = null;
    } else {
      try {
        // `|| null` so a runtime that swallows the error still caches a decision
        // here; leaving it undefined would re-require on every call.
        nativeNotifications = require('expo-notifications') || null;
      } catch {
        nativeNotifications = null;
      }
    }
  }
  return nativeNotifications;
}

/**
 * The native module exists in this runtime. False on the pre-push APK.
 *
 * NOT false in Expo Go: Expo Go ships expo-notifications natively, so the
 * module loads there and this returns true - but Android push tokens cannot be
 * minted in Expo Go, so getToken() fails and registration quietly does nothing.
 * That is a development-only wrinkle, and the real check is a dev build.
 */
export function isAvailable() {
  return load() != null;
}

/**
 * The library object, for the few callers that need to attach a listener.
 * Exported so nothing else has to re-implement the guard above - a second
 * lazy-loader is a second place to get it wrong.
 */
export function getNativeModule() {
  return load();
}

export async function getStatus() {
  const N = load();
  if (!N) return { status: 'unavailable', canAskAgain: false };
  try {
    const res = await N.getPermissionsAsync();
    return { status: res.status, canAskAgain: res.canAskAgain !== false };
  } catch {
    return { status: 'unavailable', canAskAgain: false };
  }
}

export async function requestPermission() {
  const N = load();
  if (!N) return { status: 'unavailable', canAskAgain: false };
  try {
    const res = await N.requestPermissionsAsync();
    return { status: res.status, canAskAgain: res.canAskAgain !== false };
  } catch {
    return { status: 'unavailable', canAskAgain: false };
  }
}

// The Android channel a resident can mute or tune in system settings.
//
// The id here must match the `channelId` the server puts on the message
// (backend/src/services/push.service.js). Android routes by the message's
// channel, so a mismatch does not fail loudly - it delivers on Expo's generic
// fallback channel and leaves this named one controlling nothing, so turning
// "Report updates" off in settings would not stop the notifications.
//
// HIGH, not DEFAULT: Expo's fallback channel is IMPORTANCE_HIGH, so naming our
// own channel without matching that would have quietly DOWNGRADED these from a
// heads-up banner to a silent shade entry - a regression dressed as a fix.
export const ANDROID_CHANNEL_ID = 'default';

export async function setAndroidChannel() {
  const N = load();
  if (!N || Platform.OS !== 'android') return;
  try {
    await N.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Report updates',
      importance: N.AndroidImportance.HIGH,
    });
  } catch {
    // Non-fatal.
  }
}

// What to do with a notification that arrives while the app is OPEN.
//
// Without a handler, expo-notifications shows nothing at all: the default is to
// drop a foreground notification after the handler timeout, with no banner and
// no entry in the shade. A resident sitting in My Reports when staff resolve
// their complaint would simply never be told.
export function setForegroundHandler() {
  const N = load();
  if (!N) return;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Non-fatal.
  }
}

// The tap that launched the app.
//
// A notification tapped while the app is KILLED is the case this feature exists
// for, and addNotificationResponseReceivedListener does not cover it: the
// native side emits the response once, at module creation, long before the JS
// bundle has evaluated and any listener has subscribed. Nothing replays it.
// Expo ships this accessor for exactly that reason.
export async function getLastResponse() {
  const N = load();
  if (!N) return null;
  try {
    return (await N.getLastNotificationResponseAsync()) || null;
  } catch {
    return null;
  }
}

// Drop the pending response once it has been acted on, so a later remount does
// not navigate the resident back to the same report unbidden.
export function clearLastResponse() {
  const N = load();
  if (!N) return;
  try {
    N.clearLastNotificationResponse?.();
  } catch {
    // Non-fatal.
  }
}

export async function getToken() {
  const N = load();
  if (!N) return null;
  try {
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
    const res = await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return res?.data || null;
  } catch {
    // FCM misconfigured, or no Play Services on this device. Sign-in must not
    // fail because a push token could not be minted - the person can still
    // file and track reports, they just will not get a banner.
    return null;
  }
}

/** Mint a push token and tell the server it belongs to this user. */
export async function registerDevice(authToken) {
  if (!authToken) return null;
  await setAndroidChannel();
  const pushToken = await getToken();
  if (!pushToken) return null;
  try {
    await api.notifications.registerDevice({ token: pushToken, platform: Platform.OS }, authToken);
    return pushToken;
  } catch {
    return null;
  }
}

/** Forget this device, so a signed-out phone stops receiving that person's updates. */
export async function unregisterDevice(authToken, pushToken) {
  if (!authToken || !pushToken) return;
  try {
    await api.notifications.unregisterDevice({ token: pushToken }, authToken);
  } catch {
    // Signing out has to work on a dead network; see AuthContext.logout.
  }
}
