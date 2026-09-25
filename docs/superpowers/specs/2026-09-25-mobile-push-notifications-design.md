# Mobile push notifications — the app half

**Date:** 2026-09-25
**Status:** design, awaiting review
**Supersedes the app-side half of:** `docs/push-notifications-remaining.md`
(that document's Step 1 is incomplete — see "Firebase setup" below)

## Objective

A resident must learn that CENRO has acted on their report **without having to
open the app and check**.

This is the capstone objective driving the work: the person who filed a report
is the last to know what happened to it. The app already has an in-app
notification bell, but it only tells someone who is already looking at the app.
The event that matters — staff moving a report to Under Review, In Progress or
Resolved — happens on the **server**, often days later, with the app closed.
Only a push notification crosses that gap.

## What already exists (the server half — done, tested, deployed)

Commit `17753b2`. Nothing in this spec changes it.

| Piece | State |
|---|---|
| `PushToken` model + migration | applied locally and on Railway |
| `push.service.js` | sends via Expo, prunes dead tokens, never throws |
| `POST /notifications/devices` | `{ token, platform }` — registers a device |
| `DELETE /notifications/devices` | `{ token }` — forgets one device |
| Hook | inside `notifyStatusChange`, so all three report kinds are covered |
| Tests | 14, including the privacy assertions |

Verified 2026-09-25: `POST /notifications/devices` on production returns 401
rather than 404, so the route is mounted and auth-gated. The server sends to
every `PushToken` row for the report's owner; with no rows it sends nothing.
That is why the deployed backend has been inert rather than broken.

## What this adds

The app half: ask for permission, obtain an Expo push token, register it against
the signed-in user, hand the resident a way to change their mind, and open the
right report when a banner is tapped.

## Decisions

Each of these was decided during design; they are recorded because the reasons
are not recoverable from the code.

**1. Permission is asked after sign-in, not at cold launch.**
Not a UX preference — a constraint. `PushToken` rows carry a `user_id`, so a
token obtained before sign-in has nobody to belong to. "On app open" therefore
means "on app open, once signed in", which is also where the original plan
wanted it for conversion reasons.

**2. The prompt repeats until the resident explicitly chooses.**
The modal is **not dismissable by tapping outside**. It reappears on every
launch until they tap Allow or Don't allow. This is the requested behaviour, and
it is achievable only because it is *our* modal: the OS dialog cannot be made to
repeat (see constraint 3 below).

**3. Declining is reversible, via a Profile toggle.**
Don't allow records the choice locally and stops the launch prompt for good — it
deliberately does **not** fire the OS dialog, so the finite OS prompt is
preserved. A "Report update notifications" switch on the Profile screen is then
the way back on. Without it, a resident who declines once could never receive a
report update again, which would defeat the objective above.

**4. When the OS dialog is spent, the button becomes "Open settings".**
`getPermissionsAsync()` returns `{ status, canAskAgain }`. With
`canAskAgain: false` the system dialog will never appear again, so the only
remaining route is `Linking.openSettings()` — already available from React
Native core and already used in `TrackReportScreen.js:178`, so no new
dependency. The permission row only appears on that system screen once the app
declares `POST_NOTIFICATIONS`, which arrives with `expo-notifications`.

**5. No React context for push state.**
Both the launch prompt and the Profile toggle need the current permission state.
A context would cache it, and that cache goes stale the moment someone changes
notifications in system Settings while the app is backgrounded — the toggle
would then lie. Instead a `usePushPermission()` hook re-reads the OS and
SecureStore **on focus**. The OS is the source of truth; nothing caches it.

**6. The banner stays uninformative. This is not an oversight.**
```
Your report has an update
Tap to view.
```
No tracking reference, no status, no staff note. A push banner is readable on a
**locked** phone by whoever is holding it, and this system encrypts reporter
identity at rest and accepts whistleblower reports. The reference travels in
`data`, invisible until the app opens it.
`tests/pushNotifications.test.js` asserts all three absences, so making the
banner "more useful" fails the suite rather than slipping through silently.

## Architecture

Six units, each with one job.

**1. `mobile/src/lib/push.js` — mechanics, no UI**
Exposes `getStatus()`, `requestPermission()`, `registerDevice()`,
`unregisterDevice()`, `setAndroidChannel()`.

It **lazily requires** `expo-notifications` behind a `TurboModuleRegistry.get()`
check, following `MapPicker.js` exactly. That file explains at length why a
top-level import of a native module takes the *whole app* down on a runtime that
lacks it, and why a `try/catch` around the `require` cannot catch it. Anyone
still on the current APK is precisely that runtime, so this guard is
load-bearing, not defensive styling.

On Android it must also call `setNotificationChannelAsync('default', ...)`, or
no banner appears at all.

**2. `mobile/src/lib/pushPreference.js` — the local decision**
Stores `allowed` / `declined` / `undecided` in SecureStore, **keyed per user**,
so two residents sharing a phone do not inherit each other's choice.

**3. `mobile/src/components/PushPermissionPrompt.js` — the modal**
Two explicit buttons, no outside-tap dismissal. Allow fires the OS dialog (or
opens Settings when `canAskAgain` is false); Don't allow records the decision.

**4. Mount point — the resident area**
Rendered once so it appears on app open after sign-in.

**5. `AuthContext` — token lifecycle**
Register the device after a successful sign-in. On sign-out, call
`DELETE /notifications/devices` **before** clearing local state, and do not
await it — signing out must work with no network, the same contract the existing
cookie clear already keeps.

**6. Profile toggle + tap handling**
The switch from decision 3, and
`addNotificationResponseReceivedListener` reading
`response.notification.request.content.data.trackingId` to open that report.
Because the banner says nothing identifying, this listener is the only thing
that gets the person to the right place.

## Constraints

**OTA stops the moment this lands.** `expo-notifications` is a native module, so
installing it changes the EAS fingerprint, and an update is only served to a
build whose fingerprint matches. From that commit until a new build exists,
`eas update` reaches nobody — silently, reporting success. This is the whole
reason the work was deferred to a single sitting that ends in a build.
Re-check afterwards with `eas fingerprint:compare --build-id <new build id>`.

**Push cannot be tested in Expo Go**, and an emulator needs Play Services. A
real device is required.

## Firebase setup — what the human must do

**The existing `push-notifications-remaining.md` Step 1 is incomplete.** Verified
against Expo's current FCM credentials documentation on 2026-09-25: it omits
`google-services.json` and the `app.json` entry, without which the Android app
is not registered with FCM and token registration fails.

1. <https://console.firebase.google.com> → create a project (free, no card).
2. Add an **Android** app with package name exactly **`com.aishiii.cenrowatch`**
   (from `app.json` → `expo.android.package`; it must match exactly).
3. Download **`google-services.json`** and place it at `mobile/google-services.json`.
4. In `mobile/app.json`, under `expo.android`, add
   `"googleServicesFile": "./google-services.json"`. *(missing from the old doc)*
5. Firebase → Project settings → **Service accounts** → **Generate new private
   key** → download that JSON.
6. From `mobile/`: `eas credentials` → Android → production → **Google Service
   Account** → *Manage your Google Service Account Key for Push Notifications
   (FCM V1)* → **Set up a Google Service Account Key** → upload it.

**Secrets:** the **service-account private key** is a credential and must never
be committed. `google-services.json` is different — it ships inside the APK
regardless and contains no private key, so committing it is safe and avoids
EAS file-environment complexity.

Expo version here is `~56`, newer than the flow in the old doc, so the exact
`eas credentials` menu wording is confirmed against current docs above and will
be re-checked against the installed package during implementation.

## Out of scope

- **iOS credentials.** The code is written cross-platform (`Platform.OS` is
  needed anyway), but only Android FCM is set up; builds are Android.
- **Staff and Admin push.** The server hook lives in `notifyStatusChange`, which
  notifies the report's owner — a resident — by construction.
- **A richer banner.** See decision 6; changing it is a deliberate privacy
  decision, not a tidy-up.
- **`expo-intent-launcher`.** Could open the app's notification settings
  directly instead of the general App-info page, saving a tap. Another native
  module for a small gain; easy to add later.

## Verification

The app half cannot be meaningfully unit-tested without a device, so
verification is the manual sequence, on a real phone with the new build:

1. Sign in → the prompt appears → Allow → accept the OS dialog.
2. Confirm a `PushToken` row exists for that user.
3. From the web app as staff, change that report's status.
4. Lock the phone. The banner appears, saying only that there is an update.
5. Tap it → the app opens that report.
6. Sign out → confirm the `PushToken` row is gone.
7. Decline path: fresh install → Don't allow → confirm the prompt does not
   return on next launch, and that the Profile toggle turns it back on.

The 14 existing backend tests must stay green throughout.

## Risks

- **The fingerprint change is irreversible for the installed APK.** Mitigated by
  ending the work in a build, not by leaving it half-applied.
- **A misconfigured FCM setup fails quietly**, the same shape as the SMTP and
  CRLF problems already in CLAUDE.md: `getExpoPushTokenAsync()` errors, no row
  is written, and the server cheerfully sends to nobody. Step 2 of verification
  exists to catch exactly this — confirm the row, do not assume it.
- **OEM battery management** (Xiaomi, Oppo, Vivo, Realme are common here) can
  delay or suppress delivery. FCM high-priority messages are the mitigation;
  nothing makes it absolute.

## Manuscript

`notification.service.js` used to say push was out of scope, and the paper's
limitations section says the same. Once this ships that is no longer true — it
becomes a limitation identified and then closed, which is a better story, but it
has to be rewritten rather than left.
