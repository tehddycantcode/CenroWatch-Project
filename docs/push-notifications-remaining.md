# Push notifications — the half that needs a build

**State:** the server half is **done, tested and deployed** (commit `17753b2`).
The app half is **not started**, deliberately. This is everything left to do.

## Why it was split

`expo-notifications` is a native module. Installing it changes the EAS
**fingerprint**, and an over-the-air update is only served to a build whose
fingerprint matches. So the moment step 2 below runs, `eas update` stops
reaching the installed APK (`7181dd4a`, runtime `a1d292d6…`) and **every
further JS change needs a full build until you make one.**

That is the whole reason this is a separate piece of work: do it in one
sitting, ending in a build, rather than leaving the repo in a state where
nothing can ship.

## What already works

| | |
|---|---|
| `PushToken` model + migration | applied locally and on Railway |
| `push.service.js` | sends via Expo, prunes dead tokens, never throws |
| `POST /notifications/devices` | `{ token, platform }` — registers a device |
| `DELETE /notifications/devices` | `{ token }` — forgets one device |
| Hook | inside `notifyStatusChange`, so all three report kinds are covered |
| Tests | 14, including the privacy assertions |

The server sends to every `PushToken` row for the report's owner. With no rows
it sends nothing, which is exactly today's behaviour — so the deployed backend
is inert until the app registers a device. Nothing is broken while this sits.

---

## Step 1 — FCM credentials (one-time, ~15 min)

Android needs Firebase Cloud Messaging. Expo relays through it; the API never
touches Firebase.

1. <https://console.firebase.google.com> → create a project (free).
2. Add an **Android app** with package name **`com.aishiii.cenrowatch`**
   (from `app.json` → `expo.android.package` — it must match exactly).
3. Project settings → **Service accounts** → **Generate new private key** →
   download the JSON.
4. From `mobile/`: `eas credentials` → Android → production → **Push
   Notifications: FCM V1** → upload that JSON.

Keep the JSON out of the repo. It is a credential.

## Step 2 — Packages and config

```bash
cd mobile
npx expo install expo-notifications expo-constants
```

Add to `app.json` under `expo.plugins`:

```json
["expo-notifications", { "color": "#22a050" }]
```

**From here OTA is blocked until step 5.**

## Step 3 — App code

Four pieces. The API client already has the shape to copy from
(`src/api/client.js`).

1. **`src/lib/push.js`** — `registerForPush()`:
   - `Notifications.getPermissionsAsync()`, request if undetermined;
   - on Android also `setNotificationChannelAsync('default', …)`, required for
     a banner to appear at all;
   - `getExpoPushTokenAsync({ projectId })` where `projectId` comes from
     `Constants.expoConfig.extra.eas.projectId`;
   - POST it to `/notifications/devices` with `platform: Platform.OS`.

   **Guard the native import the way `MapPicker.js` does.** That file explains
   at length why a bare top-level import of a native module takes the whole app
   down in a runtime that lacks it — the same trap applies here, and anyone
   still on the old APK is exactly that runtime.

2. **`AuthContext`** — call `registerForPush()` after a successful sign-in, and
   `DELETE /notifications/devices` in `logout()` before clearing local state.
   Not awaited: signing out must work with no network, the same as the cookie
   clear already there.

3. **Permission timing** — ask on the resident dashboard after sign-in, with one
   line of explanation. Not cold at launch; that is how you get denied. Android
   13+ requires the runtime `POST_NOTIFICATIONS` grant.

4. **Tap handling** — `Notifications.addNotificationResponseReceivedListener`
   reads `response.notification.request.content.data.trackingId` and navigates
   to that report. The banner says nothing identifying, so this is the only
   thing that gets the person to the right place.

## Step 4 — Do NOT make the banner more informative

The banner is:

```
Your report has an update
Tap to view.
```

No tracking reference, no status, no staff note. A push banner is readable on a
**locked** phone by whoever is holding it, and this system encrypts reporter
identity at rest and accepts whistleblower reports. Putting the reference on a
lock screen would give away at a glance what the rest of the system protects.

`tests/pushNotifications.test.js` asserts the absence of all three, so this
fails the suite rather than slipping through. If someone asks for a richer
banner, that is a decision to take deliberately, not a tidy-up.

## Step 5 — Build, install, verify

```bash
cd mobile
eas build --platform android --profile preview
```

Install the new APK on a real device (push does not work in Expo Go, and an
emulator needs Play Services). Then:

1. Sign in → accept the notification permission.
2. Confirm a `PushToken` row exists for that user.
3. From the web app as staff, change that report's status.
4. Lock the phone. The banner should appear saying only that there is an update.
5. Tap it → the app opens that report.
6. Sign out → confirm the `PushToken` row is gone.

After this build, OTA works again and is pinned to the **new** fingerprint.
Re-check with `eas fingerprint:compare --build-id <new build id>` before the
next `eas update`.

## Step 6 — Update the manuscript

`notification.service.js` used to say push was out of scope, and the paper's
limitations section says the same. Once this ships, that is no longer true —
it becomes a limitation you identified and then closed, which is a better
story, but it does have to be rewritten rather than left.
