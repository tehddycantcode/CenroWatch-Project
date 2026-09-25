# Mobile Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A resident receives a banner on their phone when CENRO changes the status of their report, even with the app closed, and tapping it opens that report.

**Architecture:** The server half already exists and is deployed. This adds the app half: a lazily-required `expo-notifications` wrapper, a pure decision module that says when to prompt, a non-dismissable modal that repeats until the resident chooses, device-token registration tied to the auth lifecycle, and a Profile toggle that makes a decline reversible.

**Tech Stack:** Expo SDK 56, React Native, `expo-notifications`, `expo-constants`, `expo-secure-store` (already present), EAS Build, FCM V1 (credentials already uploaded).

**Spec:** `docs/superpowers/specs/2026-09-25-mobile-push-notifications-design.md`

## Global Constraints

- Android package name is exactly `com.aishiii.cenrowatch`; it must match `google-services.json` and the FCM registration.
- Expo account owner is `ejjj02`; EAS projectId is `6f3b38f4-8566-42cc-8d71-f062b96cf439`.
- **Never import `expo-notifications` at module top level.** Require it lazily behind a `TurboModuleRegistry.get()` probe, following `mobile/src/components/MapPicker.js`. A top-level import takes the whole app down on a runtime without the native module, and `try/catch` around the `require` cannot catch it.
- The banner text is exactly `Your report has an update` / `Tap to view.` — no tracking reference, no status, no staff note. `backend/tests/pushNotifications.test.js` asserts these absences.
- The service-account key must never enter the repo. `mobile/google-services.json` is safe to commit (no private key).
- Commits carry **no** `Co-Authored-By` trailer (CLAUDE.md).
- All 34 backend tests must stay green; this plan changes no backend code.
- Once Task 1 lands, `eas update` no longer reaches the installed APK. The work must end in Task 9 (a build).

## Review Focus

Only the first of these can be pinned by an automated test — the rest live in
the native runtime, which `mobile/` has no harness for. Each therefore names the
step that actually proves it, and those steps are not optional.

1. **Two residents sharing one phone** — the second signs in and inherits the first's "declined", never seeing the prompt. **Automated test**, Task 3 (`preferenceKey` is per-user).
2. **Running on the current APK**, which has no `expo-notifications` native module — the app must render normally, not crash. **Verified in Task 5, Step 3**: the probe names must match the installed package, or `isAvailable()` is wrong in both directions.
3. **Permission revoked in system Settings while backgrounded** — the Profile toggle must show reality, not a stale cached value. **Verified in Task 8** via the `AppState` foreground re-read; check it by hand by toggling the permission in Settings and returning to the app.
4. **Signing out with no network** — must still sign out locally; the unregister call must not be awaited. **Verified in Task 6, Step 4** (airplane mode).
5. **`getExpoPushTokenAsync()` throwing** (FCM misconfigured, no Play Services) — sign-in must still succeed and the app stay usable. **Verified in Task 9, Step 3.1**: if the token cannot be minted, sign-in must still complete and no `PushToken` row appears. This is the failure mode CLAUDE.md has been bitten by twice (SMTP, EAS fingerprint) — silent success. Confirm the row, never assume it.

---

## File Structure

| File | Responsibility |
|---|---|
| `mobile/src/lib/pushDecision.js` | **Create.** Pure: given OS status + stored decision, say whether to prompt and what the Allow button does. No imports. |
| `mobile/src/lib/pushPreference.js` | **Create.** Per-user decision record in SecureStore. |
| `mobile/src/lib/push.js` | **Create.** Native mechanics behind the lazy guard; token register/unregister. |
| `mobile/src/components/PushPermissionPrompt.js` | **Create.** The non-dismissable modal. |
| `mobile/src/api/client.js` | **Modify.** Add `notifications.registerDevice` / `unregisterDevice`. |
| `mobile/src/context/AuthContext.js` | **Modify.** Register after sign-in; unregister on sign-out. |
| `mobile/src/navigation/ResidentNavigator.js` | **Modify.** Mount the prompt; handle notification taps. |
| `mobile/src/screens/resident/ProfileScreen.js` | **Modify.** Notifications toggle section. |
| `mobile/app.json` | **Modify.** Plugin + `googleServicesFile`. |
| `mobile/jest.config.js`, `mobile/src/lib/__tests__/` | **Create.** Minimal runner for the pure modules only. |
| `docs/push-notifications-remaining.md` | **Modify.** Correct Step 1; mark the app half done. |

---

## Task 1: Packages and config

This is the irreversible one: it changes the EAS fingerprint and blocks OTA until Task 9.

**Files:**
- Modify: `mobile/package.json` (via installer)
- Modify: `mobile/app.json`
- Commit: `mobile/google-services.json` (already on disk, untracked)

**Interfaces:**
- Consumes: nothing
- Produces: `expo-notifications` and `expo-constants` installed; `POST_NOTIFICATIONS` declared via the plugin.

- [ ] **Step 1: Install the packages**

```bash
cd "C:/Users/Penar/CenroWatch Project/mobile"
npx expo install expo-notifications expo-constants
```

- [ ] **Step 2: Add the plugin and Google services file to `app.json`**

In `expo.android`, add the `googleServicesFile` key beside `package`:

```json
"package": "com.aishiii.cenrowatch",
"googleServicesFile": "./google-services.json"
```

In `expo.plugins`, append:

```json
["expo-notifications", { "color": "#22a050" }]
```

- [ ] **Step 3: Verify the config parses and the package name still matches**

```bash
node -e "const a=require('./app.json').expo;console.log('pkg',a.android.package);console.log('gsf',a.android.googleServicesFile);console.log('plugins',JSON.stringify(a.plugins.map(p=>Array.isArray(p)?p[0]:p)))"
```

Expected: `pkg com.aishiii.cenrowatch`, `gsf ./google-services.json`, and `expo-notifications` present in the plugin list.

- [ ] **Step 4: Confirm the bundler still starts**

```bash
npx expo start --no-dev --max-workers 1
```

Expected: Metro boots without a module-resolution error. Stop it with `Ctrl+C`.

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/google-services.json
git commit -m "Install expo-notifications and wire FCM config"
```

---

## Task 2: Test runner for the pure modules

**Beyond the spec — cut this task if you want the smallest change.** Rationale: `mobile/` has no test runner, and the permission state machine in Task 3 is the piece most likely to be subtly wrong. Scope is deliberately limited to pure modules; no component rendering tests.

**Files:**
- Create: `mobile/jest.config.js`
- Modify: `mobile/package.json` (test script, devDeps)

**Interfaces:**
- Produces: `npm test` in `mobile/` runs jest over `src/**/__tests__/*.test.js`.

- [ ] **Step 1: Install jest**

```bash
cd "C:/Users/Penar/CenroWatch Project/mobile"
npm install --save-dev jest
```

- [ ] **Step 2: Create `mobile/jest.config.js`**

```js
// Scoped deliberately to the PURE modules (no Expo/React Native imports).
// Rendering tests would need jest-expo and a native mock surface; the modules
// worth testing here are plain functions, so this stays a plain node runner.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/**/__tests__/**/*.test.js'],
};
```

- [ ] **Step 3: Add the test script to `mobile/package.json`**

In `"scripts"`, add:

```json
"test": "jest"
```

- [ ] **Step 4: Verify jest runs (no tests yet is fine)**

```bash
npm test -- --passWithNoTests
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/jest.config.js
git commit -m "Add a jest runner for the mobile pure modules"
```

---

## Task 3: The pure decision module

**Files:**
- Create: `mobile/src/lib/pushDecision.js`
- Test: `mobile/src/lib/__tests__/pushDecision.test.js`

**Interfaces:**
- Consumes: nothing (no imports at all — that is the point)
- Produces:
  - `DECISION = { UNDECIDED: 'undecided', ALLOWED: 'allowed', DECLINED: 'declined' }`
  - `ALLOW_ACTION = { ASK_OS: 'ask-os', OPEN_SETTINGS: 'open-settings' }`
  - `shouldPrompt({ osStatus, decision }) -> boolean`
  - `allowAction({ canAskAgain }) -> 'ask-os' | 'open-settings'`
  - `preferenceKey(userId) -> string`

`preferenceKey` lives here rather than next to the storage it is for, because
this module imports nothing. A test that `require`s the storage module would
pull in `expo-secure-store`, which a plain node jest cannot parse — so the one
piece of that module worth testing is kept on this side of the line.

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/lib/__tests__/pushDecision.test.js`:

```js
const { DECISION, ALLOW_ACTION, shouldPrompt, allowAction } = require('../pushDecision');

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
```

Change the first line of the test file to pull in the new export:

```js
const { DECISION, ALLOW_ACTION, shouldPrompt, allowAction, preferenceKey } = require('../pushDecision');
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/Penar/CenroWatch Project/mobile" && npm test
```

Expected: FAIL — `Cannot find module '../pushDecision'`.

- [ ] **Step 3: Write the implementation**

Create `mobile/src/lib/pushDecision.js`:

```js
// When to show the permission prompt, and what its Allow button should do.
//
// Deliberately pure and import-free: this is the only part of push that can be
// reasoned about without a device, so it is the only part that gets unit tests.
//
// `decision` is what the resident tapped in OUR modal, which is not the same as
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
// notification settings screen is the only remaining route.
function allowAction({ canAskAgain }) {
  return canAskAgain ? ALLOW_ACTION.ASK_OS : ALLOW_ACTION.OPEN_SETTINGS;
}

// Scoped per user: two residents can share a phone, and one person's decline
// must not silence the prompt for the next person to sign in.
function preferenceKey(userId) {
  return `cenrowatch_push_decision_${userId}`;
}

module.exports = { DECISION, ALLOW_ACTION, shouldPrompt, allowAction, preferenceKey };
```

This file uses `module.exports` rather than `export`, unlike the rest of the app.
That is deliberate: it lets a plain node jest require it with no babel step.
Metro handles both syntaxes, so the app's ESM `import` of it still works.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/pushDecision.js mobile/src/lib/__tests__/pushDecision.test.js
git commit -m "Decide when to ask for notification permission"
```

---

## Task 4: Per-user preference storage

This task has no unit test on purpose: with `preferenceKey` moved to Task 3,
everything left here is SecureStore I/O, which a plain node runner cannot
exercise. Its behaviour is verified by step 7 of the device sequence in Task 9
(decline, relaunch, confirm the prompt stays away).

**Files:**
- Create: `mobile/src/lib/pushPreference.js`

**Interfaces:**
- Consumes: `DECISION`, `preferenceKey` from `./pushDecision`
- Produces:
  - `getDecision(userId) -> Promise<'undecided'|'allowed'|'declined'>`
  - `setDecision(userId, decision) -> Promise<void>`

- [ ] **Step 1: Write the implementation**

Create `mobile/src/lib/pushPreference.js`:

```js
// What this resident chose when our permission modal asked them.
//
// Keyed PER USER: two residents can share a phone, and one person's decline
// must not silence the prompt for the next person to sign in - they would never
// be asked, and never learn their report had moved.
//
// SecureStore rather than AsyncStorage only because it is already a dependency;
// this value is a preference, not a secret.

import * as SecureStore from 'expo-secure-store';
import { DECISION, preferenceKey } from './pushDecision';

export async function getDecision(userId) {
  if (userId == null) return DECISION.UNDECIDED;
  try {
    const raw = await SecureStore.getItemAsync(preferenceKey(userId));
    return raw || DECISION.UNDECIDED;
  } catch {
    // A keychain that cannot be read is not a reason to hide the prompt.
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
```

- [ ] **Step 2: Confirm the existing tests still pass**

```bash
cd "C:/Users/Penar/CenroWatch Project/mobile" && npm test
```

Expected: PASS, 9 tests (unchanged — this task adds none).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/pushPreference.js
git commit -m "Remember each resident's notification choice separately"
```

---

## Task 5: Native mechanics behind the lazy guard

**Files:**
- Create: `mobile/src/lib/push.js`
- Modify: `mobile/src/api/client.js` (add two methods under `notifications`)

**Interfaces:**
- Consumes: `api.notifications.registerDevice/unregisterDevice`
- Produces:
  - `isAvailable() -> boolean`
  - `getStatus() -> Promise<{ status: string, canAskAgain: boolean }>`
  - `requestPermission() -> Promise<{ status: string, canAskAgain: boolean }>`
  - `getToken() -> Promise<string|null>`
  - `registerDevice(authToken) -> Promise<string|null>` (returns the push token registered)
  - `unregisterDevice(authToken, pushToken) -> Promise<void>`

- [ ] **Step 1: Add the API methods**

In `mobile/src/api/client.js`, inside the existing `notifications: { ... }` object, add:

```js
    registerDevice: (payload, token) =>
      request('/notifications/devices', { method: 'POST', body: payload, token }),
    unregisterDevice: (payload, token) =>
      request('/notifications/devices', { method: 'DELETE', body: payload, token }),
```

- [ ] **Step 2: Create `mobile/src/lib/push.js`**

```js
import { Platform, TurboModuleRegistry } from 'react-native';
import Constants from 'expo-constants';
import { api } from '../api/client';

// THE NOTIFICATIONS LIBRARY IS REQUIRED LAZILY, AND THAT IS NOT A STYLE CHOICE.
// This mirrors MapPicker.js, which explains the trap at length: a top-level
// import of a native module is evaluated at bundle time, and on a runtime that
// does not contain the native code it throws THERE - before React renders
// anything - taking the whole app down rather than this one feature. Everyone
// still on the pre-push APK is exactly that runtime.
//
// DO NOT REPLACE THIS WITH try/catch AROUND A TOP-LEVEL IMPORT. In a dev bundle
// Metro hands module-evaluation errors to ErrorUtils.reportFatalError and
// returns undefined without re-throwing, so the catch never runs.
const NATIVE_PROBES = ['ExpoPushTokenManager', 'ExpoNotificationsEmitter'];

let nativeNotifications;
function load() {
  if (nativeNotifications === undefined) {
    const installed = NATIVE_PROBES.some((name) => TurboModuleRegistry.get(name) != null);
    if (!installed) {
      nativeNotifications = null;
    } else {
      try {
        nativeNotifications = require('expo-notifications') || null;
      } catch {
        nativeNotifications = null;
      }
    }
  }
  return nativeNotifications;
}

export function isAvailable() {
  return load() != null;
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

// Android shows NO banner at all without a channel, whatever the permission says.
export async function setAndroidChannel() {
  const N = load();
  if (!N || Platform.OS !== 'android') return;
  try {
    await N.setNotificationChannelAsync('default', {
      name: 'Report updates',
      importance: N.AndroidImportance.DEFAULT,
    });
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
    // Review Focus 5: FCM misconfigured, or no Play Services. Sign-in must not
    // fail because a push token could not be minted.
    return null;
  }
}

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

export async function unregisterDevice(authToken, pushToken) {
  if (!authToken || !pushToken) return;
  try {
    await api.notifications.unregisterDevice({ token: pushToken }, authToken);
  } catch {
    // Signing out must work offline; see AuthContext.
  }
}
```

- [ ] **Step 3: Verify the probe names against the installed package**

```bash
cd "C:/Users/Penar/CenroWatch Project/mobile"
node -e "const fs=require('fs');const p='node_modules/expo-notifications/build';const out=[];(function walk(d){for(const f of fs.readdirSync(d,{withFileTypes:true})){const q=d+'/'+f.name;if(f.isDirectory())walk(q);else if(f.name.endsWith('.js')){const s=fs.readFileSync(q,'utf8');const m=s.match(/requireOptionalNativeModule\(['\"]([^'\"]+)|requireNativeModule\(['\"]([^'\"]+)/g);if(m)out.push(...m);}}})(p);console.log([...new Set(out)].join('\n'))"
```

Expected: a list of native module names. **If neither `ExpoPushTokenManager` nor `ExpoNotificationsEmitter` appears, replace `NATIVE_PROBES` with two names from this output.** A stale probe makes `isAvailable()` return false forever and push silently never works — the same class of failure as the `family: 4` option in CLAUDE.md that was passed but never read.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/lib/push.js mobile/src/api/client.js
git commit -m "Wrap expo-notifications behind a runtime guard"
```

---

## Task 6: Register the device across the auth lifecycle

**Files:**
- Modify: `mobile/src/context/AuthContext.js`

**Interfaces:**
- Consumes: `registerDevice`, `unregisterDevice` from `../lib/push`
- Produces: `pushToken` on the auth context value; registration happens after sign-in, deregistration before local sign-out state is cleared.

- [ ] **Step 1: Import and add a ref**

Add near the other imports:

```js
import { registerDevice, unregisterDevice } from '../lib/push';
```

Add beside `rememberedRef`:

```js
  // The Expo push token this session registered, kept so sign-out can tell the
  // server to forget THIS device rather than all of the person's devices.
  const pushTokenRef = useRef(null);
```

- [ ] **Step 2: Register after a successful sign-in**

At the end of `persist`, after `setSessionNotice('')`, add:

```js
    // Not awaited: a phone that cannot mint a push token must still finish
    // signing in. registerDevice already swallows its own failures.
    registerDevice(tk).then((pt) => {
      pushTokenRef.current = pt;
    });
```

- [ ] **Step 3: Deregister on sign-out**

In `logout`, before `api.logout()`, add:

```js
    // Tell the server to forget this device, so a phone that has been signed
    // out stops receiving the previous resident's report updates. Deliberately
    // not awaited, for the same reason api.logout() is not: signing out has to
    // work on a dead network (Review Focus 4).
    unregisterDevice(token, pushTokenRef.current);
    pushTokenRef.current = null;
```

- [ ] **Step 4: Verify sign-out still works offline**

Run the app, sign in, enable airplane mode, sign out.
Expected: returns to the login screen with no error and no hang.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/context/AuthContext.js
git commit -m "Register and forget the device as the resident signs in and out"
```

---

## Task 7: The permission prompt

**Files:**
- Create: `mobile/src/components/PushPermissionPrompt.js`
- Modify: `mobile/src/navigation/ResidentNavigator.js`

**Interfaces:**
- Consumes: `shouldPrompt`, `allowAction`, `DECISION`, `ALLOW_ACTION`, `getDecision`, `setDecision`, `getStatus`, `requestPermission`, `registerDevice`, `isAvailable`
- Produces: a self-contained component taking no props; mounted once inside `ResidentNavigator`.

- [ ] **Step 1: Create the component**

```js
import { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme';
import { DECISION, ALLOW_ACTION, shouldPrompt, allowAction } from '../lib/pushDecision';
import { getDecision, setDecision } from '../lib/pushPreference';
import { getStatus, requestPermission, registerDevice, isAvailable } from '../lib/push';

// Asks for notification permission, and keeps asking on every launch until the
// resident actually chooses. It is NOT dismissable by tapping outside - that is
// what makes "until they decide" possible at all, because the OS dialog itself
// cannot be made to repeat (Android gives about two, iOS exactly one).
//
// Tapping Allow spends the OS prompt. Tapping Don't allow does NOT: it records
// the choice locally and leaves the system prompt unspent, so the Profile
// toggle can still offer it later.
export default function PushPermissionPrompt() {
  const { user, token } = useAuth();
  const [visible, setVisible] = useState(false);
  const [canAsk, setCanAsk] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.user_id || !token || !isAvailable()) return;
      const [{ status, canAskAgain }, decision] = await Promise.all([
        getStatus(),
        getDecision(user.user_id),
      ]);
      if (!active) return;
      setCanAsk(canAskAgain);
      setVisible(shouldPrompt({ osStatus: status, decision }));
    })();
    return () => {
      active = false;
    };
  }, [user?.user_id, token]);

  const onAllow = useCallback(async () => {
    setBusy(true);
    try {
      if (allowAction({ canAskAgain: canAsk }) === ALLOW_ACTION.OPEN_SETTINGS) {
        await Linking.openSettings();
      } else {
        const res = await requestPermission();
        if (res.status === 'granted') await registerDevice(token);
      }
      await setDecision(user.user_id, DECISION.ALLOWED);
    } finally {
      setBusy(false);
      setVisible(false);
    }
  }, [canAsk, token, user?.user_id]);

  const onDecline = useCallback(async () => {
    await setDecision(user.user_id, DECISION.DECLINED);
    setVisible(false);
  }, [user?.user_id]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Get updates on your reports</Text>
          <Text style={styles.body}>
            CENRO will notify you when your report is reviewed, scheduled or resolved, so you do
            not have to keep checking the app.
          </Text>
          <Pressable style={styles.primary} onPress={onAllow} disabled={busy}>
            <Text style={styles.primaryText}>
              {allowAction({ canAskAgain: canAsk }) === ALLOW_ACTION.OPEN_SETTINGS
                ? 'Open settings'
                : 'Allow'}
            </Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={onDecline} disabled={busy}>
            <Text style={styles.secondaryText}>Don&apos;t allow</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.white, borderRadius: radius.lg, padding: 20 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: 18 },
  primary: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  primaryText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  secondary: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  secondaryText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
});
```

- [ ] **Step 2: Mount it in `ResidentNavigator`**

Add the import:

```js
import PushPermissionPrompt from '../components/PushPermissionPrompt';
```

Inside `<View style={styles.root}>`, directly after `<View style={styles.body}>{renderScreen(top)}</View>`, add:

```js
        <PushPermissionPrompt />
```

- [ ] **Step 3: Verify the colors used exist**

```bash
cd "C:/Users/Penar/CenroWatch Project/mobile"
node -e "const t=require('fs').readFileSync('src/theme.js','utf8');['white','text','muted','primary'].forEach(k=>console.log(k, t.includes(k+':')))"
```

Expected: all `true`. If any is `false`, substitute the nearest existing key rather than inventing one.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/PushPermissionPrompt.js mobile/src/navigation/ResidentNavigator.js
git commit -m "Ask residents for notification permission until they choose"
```

---

## Task 8: Profile toggle and notification taps

**Files:**
- Modify: `mobile/src/screens/resident/ProfileScreen.js`
- Modify: `mobile/src/navigation/ResidentNavigator.js`

**Interfaces:**
- Consumes: everything from Tasks 3–5, plus `useResidentNav` for navigation on tap.
- Produces: a `NotificationsSection` in Profile; a notification-response listener that calls `navigate('track', { id })`.

- [ ] **Step 1: Add the Profile section**

In `ProfileScreen.js`, add imports:

```js
import { useEffect, useCallback } from 'react';
import { Switch, Linking, AppState } from 'react-native';
import { DECISION, ALLOW_ACTION, allowAction } from '../../lib/pushDecision';
import { getDecision, setDecision } from '../../lib/pushPreference';
import { getStatus, requestPermission, registerDevice, isAvailable } from '../../lib/push';
```

Add the component above `export default function ProfileScreen`:

```js
function NotificationsSection() {
  const { user, token } = useAuth();
  const [granted, setGranted] = useState(false);
  const [canAsk, setCanAsk] = useState(true);
  const [available, setAvailable] = useState(false);

  // Review Focus 3: the resident can revoke this in system Settings while the
  // app is backgrounded, so the switch re-reads the OS every time this screen
  // mounts. Nothing caches the permission - the OS is the source of truth.
  const refresh = useCallback(async () => {
    setAvailable(isAvailable());
    const { status, canAskAgain } = await getStatus();
    setGranted(status === 'granted');
    setCanAsk(canAskAgain);
  }, []);

  // Mount alone is not enough: tapping the switch can send the resident out to
  // system Settings, and they come back to a screen that never unmounted. The
  // same applies if they revoke the permission days later from Settings
  // directly. Re-read whenever the app returns to the foreground - the pattern
  // src/lib/useNotifications.js already uses.
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  async function onToggle(next) {
    if (!next) {
      // We cannot revoke an OS permission from inside the app; only the system
      // settings screen can. Record the decision and send them there.
      await setDecision(user.user_id, DECISION.DECLINED);
      await Linking.openSettings();
      return;
    }
    if (allowAction({ canAskAgain: canAsk }) === ALLOW_ACTION.OPEN_SETTINGS) {
      await Linking.openSettings();
    } else {
      const res = await requestPermission();
      if (res.status === 'granted') await registerDevice(token);
    }
    await setDecision(user.user_id, DECISION.ALLOWED);
    refresh();
  }

  if (!available) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Report update notifications</Text>
      <Text style={styles.cardHint}>
        Get a notification when CENRO reviews, schedules or resolves one of your reports.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={styles.label}>{granted ? 'On' : 'Off'}</Text>
        <Switch value={granted} onValueChange={onToggle} />
      </View>
    </View>
  );
}
```

Render it in the ScrollView, after `<PasswordSection />`:

```js
        <NotificationsSection />
```

- [ ] **Step 2: Handle notification taps in `ResidentNavigator`**

Add inside `ResidentNavigator`, after `navigate` is defined:

```js
  // Open the report a tapped banner refers to. The banner itself says nothing
  // identifying (it is readable on a locked phone), so the trackingId travels
  // in `data` and this listener is the only thing that gets the resident to the
  // right report.
  useEffect(() => {
    const N = loadNotifications();
    if (!N) return undefined;
    const sub = N.addNotificationResponseReceivedListener((response) => {
      const id = response?.notification?.request?.content?.data?.trackingId;
      if (id) navigate('track', { id });
    });
    return () => sub.remove();
  }, [navigate]);
```

Add the supporting import and loader at the top of the file:

```js
import { useEffect } from 'react';
import { isAvailable } from '../lib/push';

// Same lazy-require discipline as src/lib/push.js: never a top-level import.
function loadNotifications() {
  if (!isAvailable()) return null;
  try {
    return require('expo-notifications');
  } catch {
    return null;
  }
}
```

(Merge `useEffect` into the existing `react` import rather than adding a second one.)

- [ ] **Step 3: Verify the bundle still builds**

```bash
cd "C:/Users/Penar/CenroWatch Project/mobile"
npx expo export --platform android --output-dir /tmp/cenro-export-check
```

Expected: completes without a resolution or syntax error. Delete the output directory afterwards.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/resident/ProfileScreen.js mobile/src/navigation/ResidentNavigator.js
git commit -m "Let residents turn report notifications back on, and open a tapped report"
```

---

## Task 9: Build, verify on a device, and close the doc

**Files:**
- Modify: `docs/push-notifications-remaining.md`

- [ ] **Step 1: Build**

```bash
cd "C:/Users/Penar/CenroWatch Project/mobile"
eas build --platform android --profile preview
```

- [ ] **Step 2: Install the APK on a real device**

Push does not work in Expo Go, and an emulator needs Play Services.

- [ ] **Step 3: Run the verification sequence**

1. Sign in → the prompt appears → **Allow** → accept the OS dialog.
2. Confirm a `PushToken` row exists for that user.
3. From the web app as staff, change that report's status.
4. Lock the phone. The banner appears, saying only that there is an update.
5. Tap it → the app opens that report.
6. Sign out → confirm the `PushToken` row is gone.
7. Fresh install → **Don't allow** → confirm the prompt does not return next launch, and the Profile toggle turns it back on.

- [ ] **Step 4: Confirm OTA is pinned to the new fingerprint**

```bash
eas fingerprint:compare --build-id <new build id>
```

Expected: no differences. Per CLAUDE.md, a CRLF difference here would silently stop updates reaching this build.

- [ ] **Step 5: Update the doc and commit**

Rewrite `docs/push-notifications-remaining.md` to record that the app half is done, and correct its Step 1 to include `google-services.json` and the `app.json` `googleServicesFile` entry.

```bash
git add docs/push-notifications-remaining.md
git commit -m "Record that push notifications now work end to end"
```

---

## Not in this plan

- **iOS credentials.** The code is cross-platform; only Android FCM is configured.
- **Staff and Admin push.** The server hook notifies the report's owner by construction.
- **A richer banner.** Changing it is a deliberate privacy decision; the backend tests enforce the current text.
- **The manuscript rewrite.** `notification.service.js` and the paper's limitations section both say push is out of scope; that becomes untrue once this ships and needs rewriting separately.
