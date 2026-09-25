# Push notifications — what is left

**State (2026-09-25):**

| Half | State |
|---|---|
| Server | **done, tested, deployed** (`17753b2`) |
| FCM credentials | **done** — Firebase project `cenrowatch-mobile-app`, FCM V1 service-account key uploaded to EAS |
| App code | **done** — see the plan and spec below |
| **Build + on-device verification** | **NOT DONE. This is all that remains.** |

Design: `docs/superpowers/specs/2026-09-25-mobile-push-notifications-design.md`
Plan: `docs/superpowers/plans/2026-09-25-mobile-push-notifications.md`

> **OTA IS CURRENTLY BROKEN, BY DESIGN.** `expo-notifications` landed in
> `df1aed5`, which changed the EAS fingerprint. `eas update` no longer reaches
> the installed APK (`7181dd4a`, runtime `a1d292d6…`) and will report success
> while reaching nobody. **The build below is what fixes that.** Until it runs,
> no JS change can ship to a phone.

---

## What remains

### 1. Build

```bash
cd mobile
eas build --platform android --profile preview
```

### 2. Install on a REAL device

Push does not work in Expo Go, and an emulator needs Play Services.

### 3. Verify — do not skip step 2 of this list

1. Sign in → the permission prompt appears → **Allow** → accept the OS dialog.
2. **Confirm a `PushToken` row exists for that user.** This is the step that
   catches a silent FCM misconfiguration: if `getExpoPushTokenAsync()` fails,
   sign-in still succeeds, no row is written, and the server cheerfully sends to
   nobody. Same failure shape as the SMTP and CRLF problems in CLAUDE.md —
   confirm the row, never assume it.
3. From the web app as staff, change that report's status.
4. Lock the phone. The banner appears, saying only that there is an update.
5. Tap it → the app opens that report.
6. **App CLOSED (swiped away), not just locked** — change another report's
   status, tap the banner. The app must open *on that report*. This is the case
   the feature exists for and the one a listener alone does not cover; it is
   handled by reading the pending response at startup, which only a real cold
   start exercises.
7. **App OPEN and in the foreground** — change a status while looking at My
   Reports. A banner must still appear. Without a notification handler
   expo-notifications drops these silently, and every other step here has the
   phone locked, so nothing else would catch it.
8. **Check the channel** — Settings → Apps → CENROWATCH → Notifications. There
   must be one channel named **"Report updates"**, and turning it off must
   actually stop them. A second generic channel appearing instead means the
   `channelId` on the message and the one the app creates have drifted apart.
9. Sign out → confirm the `PushToken` row is gone.
10. **Relaunch, then sign out** — sign in, fully close the app, reopen it (so
    the session is *restored* rather than freshly logged in), then sign out.
    The `PushToken` row must still be gone. This is the path that previously
    left a phone registered to someone who had signed out.
11. **Offline sign-out** (deferred from the code work, which could not test it
   without this build): sign in, enable airplane mode, sign out. It must return
   to the login screen with no error and no hang.
12. **Decline path:** fresh install → **Don't allow** → confirm the prompt does
   not return on the next launch, and that the Profile toggle turns it back on.

### 4. Re-pin OTA to the new fingerprint

```bash
eas fingerprint:compare --build-id <new build id>
```

Expected: no differences. A CRLF difference here silently stops updates reaching
the build — see the `.gitattributes` entries, which now cover
`mobile/google-services.json` as well.

### 5. Rewrite the manuscript

`notification.service.js` used to say push was out of scope, and the paper's
limitations section says the same. Once this is verified that is no longer true:
it becomes a limitation identified and then closed, which is a better story, but
it has to be rewritten rather than left.

---

## What was built (app half)

| File | Role |
|---|---|
| `mobile/src/lib/pushDecision.js` | Pure: when to prompt, what Allow does, the per-user preference key, and reading the reference out of a tapped notification. The only push code with unit tests (14). |
| `mobile/src/lib/pushPreference.js` | Stores the resident's choice in SecureStore, keyed per user. |
| `mobile/src/lib/push.js` | The native module behind a lazy guard; token register/unregister. |
| `mobile/src/components/PushPermissionPrompt.js` | The non-dismissable modal. |
| `mobile/src/context/AuthContext.js` | Registers on sign-in, forgets the device on sign-out. |
| `mobile/src/navigation/ResidentNavigator.js` | Mounts the prompt; opens the report a banner refers to. |
| `mobile/src/screens/resident/ProfileScreen.js` | The toggle that makes a decline reversible. |

### Three things that will look like bugs and are not

**1. `POST_NOTIFICATIONS` does not appear in `expo config --type introspect`.**
It is declared in the library's own
`node_modules/expo-notifications/android/src/main/AndroidManifest.xml`, and
Android's manifest merger folds it into the app manifest at build time.
`expo config` only introspects app-level config. **Do not "fix" this by adding
the permission to `app.json`.**

**2. The availability probe is `requireOptionalNativeModule`, not
`TurboModuleRegistry.get`.** `MapPicker.js` uses the latter and is right to:
maplibre ships a *classic* React Native module. `expo-notifications` is an *Expo*
module and registers with `expo-modules-core`'s own registry, so asking
TurboModuleRegistry for those names returns null **even in a build that contains
them** — which would pin `isAvailable()` to false and leave push silently dead
forever. Do not "align" the two files.

**3. The banner says almost nothing, deliberately.**
```
Your report has an update
Tap to view.
```
No reference, no status, no staff note: a push banner is readable on a **locked**
phone, and this system encrypts reporter identity at rest and takes whistleblower
reports. The reference travels in `data`, invisible until the app opens it.
`backend/tests/pushNotifications.test.js` asserts all three absences, so making
the banner "more useful" fails the suite rather than slipping through.

## FCM setup, as actually performed

Recorded because the original version of this document was **incomplete** — it
omitted `google-services.json` and the `app.json` entry, without which the app is
never registered with FCM and token registration fails.

1. Firebase project `cenrowatch-mobile-app` (Analytics off).
2. Android app registered with package **`com.aishiii.cenrowatch`** — must match
   `expo.android.package` exactly. Debug SHA-1 left blank; it is only needed for
   Google Sign-In, Dynamic Links and Phone Auth, not FCM.
3. `google-services.json` at `mobile/google-services.json`, committed. It carries
   no private key and ships inside the APK regardless, so it is not a secret.
   Pinned `text eol=lf` in `.gitattributes` alongside the other fingerprint inputs.
4. `expo.android.googleServicesFile: "./google-services.json"` in `app.json`.
5. Service-account private key generated and uploaded via
   `eas credentials` → Android → production → Google Service Account → FCM V1.
   **That key is a real secret and is not in the repo.**

The app never imports Firebase, and the API never talks to it: `push.service.js`
sends one HTTPS POST to `exp.host`, and Expo relays to FCM using the credential
stored in EAS. Firebase here is a delivery pipe, not an integration.
