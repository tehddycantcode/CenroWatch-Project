# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Lessons Learned (avoid repeating)
Standing rule: whenever I make a mobile mistake, append the lesson here so it never
repeats. (Project-wide tooling/PowerShell lessons live in the root `CLAUDE.md`.)
- Verify a mobile change with `npx expo export --platform android` (bundles all
  modules) before committing — it catches import/JSX errors a web build won't.
- Mobile is a separate app: it can't import from `web/src`. Shared constants
  (e.g. the species list) must be duplicated into `mobile/src/lib/` and kept in sync.
