# Frontend Design Refinement - Design Spec

**Date:** 2026-06-26
**Status:** Approved design - ready for implementation plan
**Scope (approved):** Shared design-system refinement + polish of the public Landing,
Login/Register (AuthShell), and the Resident Dashboard. Staff/admin pages improve
indirectly through the shared components; they are NOT individually redesigned here.

## Goal
Raise the web frontend from "solid capstone" to "professional" by enforcing
consistency, adding tasteful depth and a proper icon system, and reinforcing the
natural-environment identity - **without** changing the light theme, the brand
palette, routes, data, or behavior.

## Non-Goals
- No dark-theme work (keep existing `.dark` tokens as-is).
- No new colors outside the existing brand palette / shadcn tokens.
- No routing, API, or data-shape changes. Pure presentation.
- No redesign of staff/admin screens (they inherit the shared-component polish).

## Constraints (binding)
- **Light theme only**; brand palette unchanged (Forest `#0f3d1f`, Primary `#22a050`,
  Accent `#2dc568`, Light `#8fe8ae`, Tint `#e6fdf0`, Surface `#f8faf9`).
- Fonts unchanged: DM Serif Display (headings) + Inter (body).
- Accessibility preserved or improved: visible focus rings, text contrast >= WCAG AA.
- New code is ASCII-only. One new dependency allowed: **lucide-react**.
- Verify with a web build + before/after screenshots (Landing, Login, Register,
  Resident Dashboard) from the running app.

## Design

### 1. Foundations (tokens - propagate everywhere)
- **Elevation:** add soft, forest-tinted shadow tokens in `tailwind.config.js`
  `boxShadow` (replacing reliance on flat `shadow-sm`):
  - `soft`:    `0 1px 2px rgba(15,61,31,0.04), 0 1px 3px rgba(15,61,31,0.06)`
  - `soft-md`: `0 2px 4px rgba(15,61,31,0.05), 0 6px 16px rgba(15,61,31,0.08)`
  - `soft-lg`: `0 8px 30px rgba(15,61,31,0.10)`
- **Natural gradient utility** in `index.css` (`@layer components`):
  `.bg-eco-gradient` - a light forest->tint wash used by hero/brand panels, e.g.
  `linear-gradient(135deg, #0f3d1f 0%, #14532d 45%, #166534 100%)` for the dark
  brand panel, and a separate light `.bg-eco-soft` (tint->white radial) for the
  public hero. Light theme preserved (hero stays bright).
- **Type rhythm:** in `@layer base`, set display headings to `tracking-tight` and a
  consistent scale; tune body `line-height`. No font changes.
- **Focus + transitions:** ensure inputs, links-as-buttons, and clickable cards use
  the same `focus-visible:ring-2 ring-ring ring-offset-2` and a `transition` token.

### 2. Icon system
- Add `lucide-react`.
- New reusable component `web/src/components/ui/icon-chip.jsx`: a rounded tinted
  square/circle wrapping a lucide icon (`size` + `tone` props; tones map to brand
  colors: `primary` = tint bg + primary icon, `forest`, `amber`, `violet`).
- A small brand mark component (lucide `Leaf` in a primary rounded square) replaces
  the literal `CW` text badge used in the landing header and AuthShell.
- Emoji -> icon mapping (Resident Dashboard + Landing): complaint `Trash2`,
  wildlife `Bird`, service `Sprout`, total `FileText`, active `Clock`,
  resolved `CircleCheck`, map `MapPin`, track `Hash`, greeting `Leaf` (or none).

### 3. Shared components
- **button.jsx:** default variant gains `shadow-soft` + tactile `active:translate-y-px`;
  add a `secondary` variant (`bg-secondary text-secondary-foreground hover:bg-secondary/80`);
  ensure `transition` covers color + shadow. Existing variants/sizes keep their API.
- **card.jsx:** swap `shadow-sm` -> `shadow-soft`; export a `cardHover` class string
  (`transition hover:shadow-soft-md hover:-translate-y-0.5`) that clickable cards/links
  apply via `cn(...)`. Default `Card` API and markup stay unchanged.
- **input.jsx / textarea.jsx / select.jsx:** unify height (`h-11`), radius (`rounded-md`),
  placeholder color (`placeholder:text-muted-foreground/70`), and the focus ring.
- **badge.jsx:** confirm pill (`rounded-full`) + consistent weights (no behavior change).

### 4. Target screens
- **LandingPage.jsx:** sticky header with subtle `backdrop-blur` + brand mark; CTAs
  routed through `Button` (primary `lg`, others `outline`); hero on `.bg-eco-soft`
  with a tuned serif headline; stat tiles gain small icons + `shadow-soft`; service
  cards use `IconChip` + hover-lift. Copy unchanged.
- **AuthShell.jsx (polish, already split-layout):** brand panel uses `.bg-eco-gradient`
  + the `Leaf` brand mark; the three bullets become `IconChip`/check icons instead of
  dots; refined spacing. Form side spacing tightened. Login/Register page bodies keep
  their fields but ensure every control uses `Button` + the unified `Input`.
- **DashboardPage.jsx:** greeting without the emoji; `Stat` cards gain an `IconChip`
  and `shadow-soft`; action cards use `IconChip` + hover-lift; recent-reports rows get
  a per-type leading icon and tighter layout. Data/logic unchanged.

## Files touched
**New:** `web/src/components/ui/icon-chip.jsx`, `web/src/components/ui/brand-mark.jsx`.
**Changed:** `web/tailwind.config.js`, `web/src/index.css`,
`web/src/components/ui/{button,card,input,textarea,select}.jsx`,
`web/src/components/auth/AuthShell.jsx`,
`web/src/pages/public/LandingPage.jsx`,
`web/src/pages/auth/{LoginPage,RegisterPage}.jsx` (only to adopt shared controls),
`web/src/pages/resident/DashboardPage.jsx`,
`web/package.json` (+ lucide-react).
**Unchanged:** all routes, API/`lib`, contexts, staff/admin pages (they inherit the
component polish automatically).

## Verification
1. `npm run build` (web) passes with no new errors.
2. Run the app; capture before/after screenshots of Landing, Login, Register, and the
   Resident Dashboard; confirm the natural/light identity is intact and focus rings work.
3. Spot-check one staff and one admin page to confirm the shared-component changes
   improved them and broke nothing.
