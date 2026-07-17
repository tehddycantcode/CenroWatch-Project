# Web-to-APK (Adviser Suggestion) - Decision Record

Date: 2026-07-17
Status: Decided with the team - no code change now; this document is the
deliverable, written to be brought to the thesis adviser.

## Question

The thesis adviser suggested the web app could be converted into an APK
without separate/independent code. Is that possible, and is it more reliable
than maintaining the separate React Native mobile app?

## Is it possible? Yes - two routes

1. **Capacitor (recommended route if ever pursued).** Wraps the built
   `web/dist` in a native WebView shell and produces a real installable APK.
   The web app IS the app; a thin generated Android project exists but there
   is no second UI codebase. Camera uploads work via the standard file input,
   geolocation works with permission, and MapLibre GL (WebGL) runs in a
   modern Android WebView. A demo APK does not require a deployed website -
   the UI ships inside the APK; only the backend API must be reachable
   (LAN IP for demos, deployed URL for production).
2. **PWA + TWA (PWABuilder / Bubblewrap).** Google's official
   website-as-APK path. Requires a PUBLIC HTTPS deployment, a web app
   manifest, and a service worker. CENROWATCH currently has none of these
   (no manifest, no service worker, deployment phase deferred), so this
   route is blocked until deployment happens.

## Is it more reliable than the separate React Native app?

**The real argument for the adviser's suggestion:** one codebase means the
resident module cannot drift between web and mobile. The project has already
paid drift tax - `mobile/AGENTS.md` records that shared constants (e.g. the
species list) must be manually duplicated and kept in sync between `web/src`
and `mobile/src`. Every future fix landing once instead of twice is a
genuine long-term reliability and maintenance win for a three-person team.

**The concrete catch found in the code:** an APK runs exclusively on phones,
and the resident web module is not phone-ready today. The resident
navigation is hidden below the 640px breakpoint with NO mobile menu
replacing it (`web/src/components/resident/ResidentLayout.jsx:35`,
`hidden sm:flex`). Wrapped into an APK as-is, residents could not reach
My Reports or Profile. "No separate code" is therefore possible but not
"no work": it requires a phone-first responsiveness pass over the resident
pages plus the wrapper setup and APK signing/build pipeline.

**The risk asymmetry near the defense:** the React Native + Expo app
already exists, works, is phone-first by design, and has been verified
throughout the project (including the session-expiry and barangay-cache
features shipped to both platforms). Neither app uses native-only
capabilities (push notifications and offline mode are out of scope), so no
capability is lost in either direction. Replacing a working, verified
deliverable weeks before the defense trades long-term elegance for
short-term risk.

## Decision (2026-07-17)

Keep the React Native app as the defended mobile artifact. Present this
document to the adviser as the considered answer: the suggestion is
technically sound as a long-term architecture (and common in industry), but
switching now would add risk without adding capability.

If the adviser wants the approach demonstrated, the agreed fallback is a
**Capacitor proof-of-concept alongside the RN app** (not a replacement):
1. Add a mobile nav (hamburger) to the resident layout and verify the
   resident pages at phone widths.
2. `npm i @capacitor/core @capacitor/cli @capacitor/android` in `web/`,
   `npx cap init` + `npx cap add android`, point `webDir` at `dist`,
   make the API base URL configurable, build the APK via Android Studio
   or Gradle.

## Revisit triggers

- The adviser asks for the proof-of-concept -> run the fallback above.
- After the capstone, if the team continues the project long-term ->
  consolidating on one codebase (wrapped web or a single React Native app
  with a web target) becomes the right call to end the drift tax.
- Push notifications or offline reporting enter scope -> React Native (or
  a PWA service worker) becomes a differentiator and should anchor the
  decision instead.
