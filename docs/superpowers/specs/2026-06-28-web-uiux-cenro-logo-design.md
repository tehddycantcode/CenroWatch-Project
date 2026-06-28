# Web UI/UX Enrichment + CENRO Logo - Design

**Date:** 2026-06-28
**Scope:** CENROWATCH web app, public + resident screens. Mobile gets the logo only.
**Status:** Approved direction (Balanced & richer, pushed harder), pending spec review.

## Context / Problem
The previous frontend pass changed design *tokens* and added an *icon system*, but the
changes were too subtle to perceive ("so plain ... no changes in the design"). This round
delivers **clearly visible** UI/UX upgrades and introduces the **official CENRO Cabuyao
seal** as the brand mark - while strictly preserving the existing **light theme** and
**green/forest nature ambience**. The user asked to "push harder," so the visual intensity
is dialed up (layered hero, decorative nature motifs, section rhythm, a status timeline)
without changing the palette or going dark.

## Global Constraints (apply to every task)
- **Light theme only.** No dark mode. Keep the exact Figma palette: Forest `#0f3d1f`,
  Primary `#22a050`, Accent `#2dc568`, Light `#8fe8ae`, Tint `#e6fdf0`, Surface `#f8faf9`.
- **Dependency-light.** No new npm packages. Use Tailwind + the already-installed
  `tailwindcss-animate` for keyframes, inline SVG for nature motifs, `lucide-react`
  (already present) for icons, and the seal PNG asset. No animation/illustration libs.
- **ASCII-only** in all source edits (existing `--` box headers are fine).
- **No backend/API changes.** Pure web frontend. No new data; reuse existing endpoints
  (`gisApi.stats`, `complaintApi/wildlifeApi/requestApi.listMine`, the report detail used by
  `TrackReportPage`).
- **Verification:** `npm run build` must pass and each touched screen is screenshot-verified
  via Playwright with **zero console errors** before completion.

## Logo asset handling (build stays green)
- The official seal lives at **`web/public/cenro-logo.png`** (static, served at `/cenro-logo.png`).
  Using `public/` (not a JS import) means the build never breaks if the file is missing.
- `CenroLogo` renders `<img src="/cenro-logo.png" onError=...>`; on load error it **falls back
  to the existing leaf `BrandMark`**, so a missing seal degrades gracefully (no broken-image
  icon). The user drops the real PNG in later with no code change.

## Components / Files

### New
- `web/src/components/ui/cenro-logo.jsx` - `CenroLogo({ withWordmark, withSubtitle, invert, size, className })`.
  Seal image in a rounded chip (white chip when `invert`, so the colorful seal stays legible on
  dark panels) + "CENROWATCH" wordmark + optional "CENRO Cabuyao" subtitle. Leaf fallback on error.
- `web/src/components/ui/section.jsx` (small helpers) - `LeafDivider` (inline-SVG wavy/leaf
  section divider) and `StepConnector` for the "How it works" stepper. Keeps motif SVG in one place.

### Token / ambience layer
- `web/src/index.css` (`@layer components`): add
  - `.bg-leaf-motif` - faint inline-SVG leaf pattern (low opacity) layered over hero/auth panel.
  - `.bg-eco-band` - soft alternating tinted section background (Tint/Surface) for page rhythm.
  - `.accent-bar-top` - thin forest gradient bar (official feel) for the very top of public pages.
  - keep existing `.bg-eco-soft` / `.bg-eco-gradient`.
- `web/tailwind.config.js`: add 1-2 keyframes (`fade-up`, `float-soft`) + matching `animation`
  entries for CSS-only entrance/idle motion (no JS animation library).
- `web/src/components/ui/button.jsx`: default variant gets a subtle **primary gradient**
  (`from brand.primary -> brand.accent`) + existing soft shadow / active press. Outline/secondary
  unchanged. Contrast kept (white text on green).

### Public screens
- `web/src/pages/public/LandingPage.jsx` (major rewrite):
  - Top `.accent-bar-top`; header uses `<CenroLogo withWordmark />`.
  - **Hero**: `.bg-eco-soft` + `.bg-leaf-motif`, soft blurred green blobs, display headline,
    "Live" pill, dual CTAs, trust line "Official environmental system of CENRO Cabuyao", and a
    **right-side layered "in-app preview" card** at `lg` (a composed mock: small stat tiles +
    a sample status card with IconChips + StatusBadge - no external image). `fade-up` on entrance.
  - **Stats**: elevated cards with a colored top-accent strip, IconChip, large number, hover-lift.
  - **"How it works"** (new): 3-step connected stepper Report -> Review -> Resolve, numbered
    IconChips + `StepConnector`.
  - **Services**: cards gain a tinted gradient header strip per tone + larger IconChip + hover-lift.
  - `LeafDivider` between major sections for rhythm.
  - **Footer** (richer): seal + wordmark, short blurb, quick-links column, contact/office column,
    institution line. Replaces the current single thin line. ASCII only.

### Auth
- `web/src/components/auth/AuthShell.jsx` (rewrite): brand panel `.bg-eco-gradient` +
  `.bg-leaf-motif` overlay, `<CenroLogo withWordmark withSubtitle invert />`, Check-icon bullets,
  trust line. Form side: `<CenroLogo withWordmark />` on mobile, cleaner card, accent-bar-top.
  `LoginPage`/`RegisterPage`/forgot/reset inherit via the shell (no per-page rewrite needed).

### Resident
- `web/src/components/resident/ResidentLayout.jsx`: header swaps `BrandMark` -> `CenroLogo` (compact).
- `web/src/pages/resident/DashboardPage.jsx` (enrich):
  - **Welcome banner**: slim `.bg-eco-gradient` card with greeting + a **resolved-progress ring**
    (inline SVG circle, resolved/total) + quick "File a report" CTA.
  - **Stat cards**: add colored top-accent + keep IconChip; hover-lift.
  - **Action cards**: per-kind soft gradient tint (complaint/amber, wildlife/violet, request/primary)
    + arrow affordance + IconChip(lg) + hover-lift.
  - Recent-reports list: per-type IconChip + status accent (already mostly there; polish only).
- `web/src/components/resident/ReportFormShell.jsx`: add a **header strip** (IconChip + title +
  helper text + subtle eco-band) wrapping the form, so the three forms
  (`ComplaintFormPage`, `WildlifeFormPage`, `ServiceRequestFormPage`) stop looking like bare fields.
  These pages pass an icon/tone/title to the shell; no other page edits needed.
- `web/src/pages/resident/TrackReportPage.jsx`: add a **vertical status timeline** (stepper) built
  from the report's status history (or status -> implied steps if no history array), with colored
  dots, connector line, timestamps. Clear, useful UX upgrade.

## Mobile (logo only - no redesign)
Handled as one small task at the end; the web work is the focus.
- User drops the seal into `mobile/assets/cenro-logo.png`; point `app.json` `icon` and
  `android.adaptiveIcon.foregroundImage` at it (app icon).
- In-app: render the seal as a small `<Image source={require('../assets/cenro-logo.png')} />`
  on the mobile login/auth screen header. Minimal, asset-driven; no mobile redesign.

## Out of scope (YAGNI)
- Staff and admin internal pages (queues, analytics) - unchanged this round.
- Dark mode, palette changes, new fonts.
- New backend fields, new endpoints, photographs/illustration asset packs, animation libraries.

## Design-for-isolation notes
- `CenroLogo` and the `section.jsx` motif helpers are self-contained, reused across pages -
  one source of truth for brand + motifs.
- Ambience is expressed as CSS utility classes (`.bg-leaf-motif`, `.bg-eco-band`,
  `.accent-bar-top`) so pages stay declarative and the look is tweakable in one file.
- `ReportFormShell` already centralizes the three forms; enriching it upgrades all three at once.

## Verification plan
1. `cd web && npm run build` - must succeed (no missing-asset/import errors; seal is in `public/`).
2. `npm run dev`, then Playwright: screenshot Landing (desktop 1280 + mobile 390), Login (desktop),
   Register, Resident Dashboard, one report form, and Track page. Confirm **0 console errors**.
3. Visual check: light background preserved, green/forest palette intact, seal visible (or graceful
   leaf fallback), new sections render, timeline + progress ring display.
4. Clean up screenshot artifacts before finishing.
