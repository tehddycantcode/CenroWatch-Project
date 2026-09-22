# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Lessons Learned (avoid repeating)
Standing rule: whenever I make a mobile mistake, append the lesson here so it never
repeats. (Project-wide tooling/PowerShell lessons live in the root `CLAUDE.md`.)
- Verify a mobile change with `npx expo export --platform android` (bundles all
  modules) before committing — it catches import/JSX errors a web build won't.
- **`start-cenrowatch.bat` starts Expo too** (2026-09-22) — a third window running
  `npm start`, alongside the API and the web app, with `-NoMobile` to skip it.
  Before Metro starts it compares the app's API target (`mobile/.env`
  `EXPO_PUBLIC_API_URL`, else the fallback in `src/config.js`) against the PC's
  own IPv4 addresses and warns if they disagree, because a changed DHCP lease
  breaks the phone while the API and web app stay green — the failure looks like
  a broken app and is actually a stale IP. For Expo Go, write the new address to
  `mobile/.env`; an INSTALLED APK needs a rebuild, since the URL is inlined at
  bundle time. To prove Metro really serves this app, ask it for the bundle:
  `http://localhost:8081/index.bundle?platform=android&dev=true` returns ~5.6 MB
  and 200 (11s here) — that is the request Expo Go makes when the QR is scanned,
  so a 200 means far more than "port 8081 is open".
- Mobile is a separate app: it can't import from `web/src`. Shared constants
  (e.g. the species list) must be duplicated into `mobile/src/lib/` and kept in sync.
- **A standalone/EAS-built APK cannot reach a plain `http://` backend by default**
  (Android blocks cleartext traffic in release builds, API 28+) even though the
  exact same URL works fine in Expo Go and in the phone's browser — Expo Go's
  dev client isn't bound by the release manifest's network security policy, so
  this only surfaces after building. This is a native-manifest change — a
  JS-only reload won't pick it up; it needs a full EAS rebuild. (For a real
  deployment, switch the backend to HTTPS instead of leaving this flag on.)
  **The fix is NOT `"android": { "usesCleartextTraffic": true }` directly in
  `app.json`** — that is not a recognized top-level `android` key in Expo's
  config schema, so prebuild silently drops it with no warning/error (cost an
  entire wasted EAS build chasing this). The real fix needs the
  `expo-build-properties` config plugin:
  `npx expo install expo-build-properties`, then in `app.json` plugins:
  `["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]`.
  After any such change, verify it actually landed before telling anyone to
  install: download the build artifact and check the compiled manifest
  (`unzip -o app.apk AndroidManifest.xml`, then search the binary for the
  attribute as UTF-16LE, e.g. via
  `Buffer.toString('utf16le').includes('usesCleartextTraffic')` in a small
  Node script — plain `grep`/`strings` won't reliably find it since Android's
  binary XML stores strings as UTF-16). Don't trust an identical EAS
  "fingerprint" hash across builds as reassurance — it can validly mean the
  edit had zero effect on the native project, not that EAS is misbehaving.
- **An interactive map IS possible on mobile now** - the old "no map, capture GPS
  instead" note in LocationField was written for Expo Go, which cannot load custom
  native modules. Standalone EAS builds can, so the map picker uses
  `@maplibre/maplibre-react-native` (same MapTiler style and key as web). It will
  NOT render in Expo Go - only in a real build.
- **maplibre-react-native v11 renamed things; check the .d.ts before writing JSX.**
  The component is `Map`, not `MapView`. Style prop is `mapStyle`. The pin is
  `Marker` with `lngLat` (and it REQUIRES children). Camera takes `center`/`zoom`
  and `maxBounds` as a FLAT `[W, S, E, N]` array - not the nested `[[SW],[NE]]`
  pairs maplibre-gl uses on web. `onPress` is a native
  BubblingEventHandler, so its payload is on `e.nativeEvent.lngLat` (as
  `[lng, lat]`) - NOT `e.lngLat`, which is undefined. The API and the rest of the
  app use `{latitude, longitude}`, so convert only at the MapPicker boundary.
  `anchor` is a STRING (`"bottom"`, `"center"`, ...), not a v10-style `{x, y}`
  object - `anchorToNative` is a switch with NO default case, so an object
  silently yields `undefined` and the pin centres on the coordinate instead of
  resting its tip there.
- **The MapTiler key is NOT in the repo.** It lives in gitignored `mobile/.env` as
  `EXPO_PUBLIC_MAPTILER_API_KEY` for local bundling, and as an EAS environment
  variable (`eas env:list --environment preview`) so cloud builds get it. The build
  profile must name the environment or the variable is not injected and the map
  silently renders its "Map unavailable" fallback.
- **In a RELEASE build an unhandled JS error is FATAL and looks like a native
  crash.** There is no red box - Android kills the process and shows
  "<App> has stopped", so a plain TypeError is indistinguishable from a native
  segfault. `const [lng, lat] = e.lngLat` (undefined) killed the app the instant
  a user tapped the map, *after* the map itself had rendered perfectly, which
  made it look like a MapLibre/GL fault. When a build "suddenly stops", suspect
  JS first and get the real reason from `adb logcat -b crash` (that buffer
  survives the crash until reboot; the `ReactNativeJS` lines carry the message).
  Guessing at native causes burns 20-minute EAS builds. Destructure native event
  payloads defensively.

## Over-the-air updates (EAS Update)

`expo-updates` is wired up, so a JS-only change reaches installed phones without
rebuilding the APK or asking anyone to reinstall. Publish with:

```
eas update --channel preview --message "what changed" --environment preview
```

`--environment` is required on SDK 55+. The channel must match the build profile
the APK came from (`eas.json` sets `channel: preview` and `channel: production`).

**The update lands on the NEXT launch, not the current one.** `expo-updates`
checks on startup, downloads in the background, and applies on the following
start. So a resident sees the fix the second time they open the app. This is the
default and it is the right trade: applying mid-session would restart the app
under them, possibly mid-report.

**`runtimeVersion` is the `fingerprint` policy, and that is load-bearing.** Expo
hashes everything that affects the native build; an APK only accepts updates whose
fingerprint matches its own. This makes the dangerous mistake impossible - you
cannot push JS that calls a native module the installed APK does not contain,
which would otherwise be a fatal crash on launch for every resident at once (see
the release-build lesson above: there is no red box, the app just dies).

The cost of that safety is the thing that will confuse someone later: **adding any
native dependency silently cuts existing installs off from updates.** The
fingerprint changes, so old APKs stop matching and simply stop receiving anything.
Nothing errors. If an update "isn't arriving", check whether a native package,
plugin, or permission changed since the APK was built - then ship a new APK.

**What OTA canNOT deliver**, all requiring a fresh EAS build and redistribution:

- a new native package, or any change to `plugins` in `app.json`
- Android permissions, the app icon, the app name, or `version`
- `usesCleartextTraffic` and anything else in the native manifest
- `EXPO_PUBLIC_*` values, which are baked in at build time

Rule of thumb: if the change is only in `src/`, OTA carries it. If it touches
`app.json` or `package.json`, assume it needs a build.

**One new APK is required before any of this works.** Builds made before
`expo-updates` was added have no updater in them at all and will never check.
