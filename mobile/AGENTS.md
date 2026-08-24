# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Lessons Learned (avoid repeating)
Standing rule: whenever I make a mobile mistake, append the lesson here so it never
repeats. (Project-wide tooling/PowerShell lessons live in the root `CLAUDE.md`.)
- Verify a mobile change with `npx expo export --platform android` (bundles all
  modules) before committing — it catches import/JSX errors a web build won't.
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
