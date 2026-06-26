# Frontend Design Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this plan - it is visual work that must be judged against rendered screenshots) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the CENROWATCH web frontend look professional - consistent components, tasteful depth, a real icon system, and a stronger natural-environment identity - without changing the light theme, palette, routes, data, or behavior.

**Architecture:** Refine the shared layer first (Tailwind shadow tokens, gradient utilities, `Button`/`Card`/inputs, a new `IconChip` + `BrandMark`) so every page improves automatically; then hand-polish three high-visibility screens (Landing, AuthShell, Resident Dashboard). Visual tasks are finalized against `npm run build` + browser screenshots.

**Tech Stack:** React + Vite, Tailwind CSS, shadcn-style components (CVA), **lucide-react** (new), MapLibre (untouched).

## Global Constraints
- **Light theme only**; do not touch `.dark` tokens. Palette fixed: Forest `#0f3d1f`, Primary `#22a050`, Accent `#2dc568`, Light `#8fe8ae`, Tint `#e6fdf0`, Surface `#f8faf9`.
- Fonts unchanged: DM Serif Display (headings) + Inter (body).
- **No** changes to routes, API/`lib`, contexts, or data shapes. Presentation only.
- Accessibility: keep visible `focus-visible` rings; text contrast >= WCAG AA.
- New code is **ASCII-only**. One new dependency only: `lucide-react`.
- Windows/PowerShell: prefix the first npm/node call in a shell with
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`.
- Verification for every task: `cd web; npm run build` passes with no NEW errors (a pre-existing chunk-size warning is fine).

---

### Task 1: Foundations - shadow tokens + gradient utilities

**Files:**
- Modify: `web/tailwind.config.js`
- Modify: `web/src/index.css`

**Produces:** Tailwind classes `shadow-soft`, `shadow-soft-md`, `shadow-soft-lg`; CSS utility classes `.bg-eco-soft` (light public hero) and `.bg-eco-gradient` (dark auth brand panel).

- [ ] **Step 1: Add forest-tinted shadow tokens.** In `web/tailwind.config.js`, inside `theme.extend`, add a `boxShadow` block:
```js
      boxShadow: {
        soft: '0 1px 2px rgba(15,61,31,0.04), 0 1px 3px rgba(15,61,31,0.06)',
        'soft-md': '0 2px 4px rgba(15,61,31,0.05), 0 6px 16px rgba(15,61,31,0.08)',
        'soft-lg': '0 8px 30px rgba(15,61,31,0.10)',
      },
```

- [ ] **Step 2: Add gradient utilities + heading tracking.** In `web/src/index.css`, after the existing `@layer base { * {...} body {...} }` block, append:
```css
@layer components {
  /* Light hero wash for public pages - stays bright (light theme preserved). */
  .bg-eco-soft {
    background:
      radial-gradient(58rem 30rem at 82% -12%, #e6fdf0 0%, transparent 62%),
      radial-gradient(46rem 24rem at -5% 112%, #f0fbf4 0%, transparent 58%),
      #ffffff;
  }
  /* Forest brand panel for the auth split layout. */
  .bg-eco-gradient {
    background: linear-gradient(135deg, #0f3d1f 0%, #14532d 52%, #166534 100%);
  }
}

@layer base {
  h1, h2, h3 { @apply tracking-tight; }
}
```

- [ ] **Step 3: Build.** `cd web; npm run build` -> succeeds. Commit:
```bash
git add web/tailwind.config.js web/src/index.css
git commit -m "Web/design: forest-tinted elevation tokens + eco gradient utilities"
```

---

### Task 2: Icon system - lucide-react + IconChip + BrandMark

**Files:**
- Modify: `web/package.json` (+ `lucide-react`)
- Create: `web/src/components/ui/icon-chip.jsx`
- Create: `web/src/components/ui/brand-mark.jsx`

**Interfaces / Produces:**
- `IconChip({ icon: LucideIcon, tone='primary'|'forest'|'amber'|'violet'|'blue', size='sm'|'md'|'lg', className })`
- `BrandMark({ withWordmark=false, invert=false, className })` - a `Leaf` glyph in a rounded brand square, optional "CENROWATCH" wordmark.

- [ ] **Step 1: Install lucide-react.**
```bash
$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')
cd web; npm install lucide-react
```

- [ ] **Step 2: Create `web/src/components/ui/icon-chip.jsx`:**
```jsx
import { cn } from '@/lib/utils';

// A lucide icon inside a soft tinted rounded square. Used for stats, action cards,
// service tiles - the consistent "professional icon" treatment across the app.
const TONES = {
  primary: 'bg-brand-tint text-brand-primary',
  forest: 'bg-brand-tint text-brand-forest',
  amber: 'bg-amber-100 text-amber-700',
  violet: 'bg-violet-100 text-violet-700',
  blue: 'bg-blue-100 text-blue-700',
};
const BOX = { sm: 'h-9 w-9 rounded-lg', md: 'h-11 w-11 rounded-xl', lg: 'h-14 w-14 rounded-2xl' };
const GLYPH = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' };

export function IconChip({ icon: Icon, tone = 'primary', size = 'md', className }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', BOX[size], TONES[tone] || TONES.primary, className)}>
      <Icon className={GLYPH[size]} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}
```

- [ ] **Step 3: Create `web/src/components/ui/brand-mark.jsx`:**
```jsx
import { Leaf } from 'lucide-react';
import { cn } from '@/lib/utils';

// CENROWATCH brand mark: a leaf glyph in a rounded brand square. Replaces the
// literal "CW" text badge. `invert` for dark backgrounds; `withWordmark` adds the name.
export function BrandMark({ withWordmark = false, invert = false, className }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl shadow-soft',
          invert ? 'bg-white text-brand-forest' : 'bg-primary text-primary-foreground',
          className
        )}
      >
        <Leaf className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
      </span>
      {withWordmark && <span className="text-lg font-bold tracking-tight">CENROWATCH</span>}
    </span>
  );
}
```

- [ ] **Step 4: Build + commit.** `cd web; npm run build` -> succeeds.
```bash
git add web/package.json web/package-lock.json web/src/components/ui/icon-chip.jsx web/src/components/ui/brand-mark.jsx
git commit -m "Web/design: add lucide-react, IconChip and BrandMark components"
```

---

### Task 3: Shared component polish (Button, Card, inputs)

**Files:**
- Modify: `web/src/components/ui/button.jsx`
- Modify: `web/src/components/ui/card.jsx`
- Modify: `web/src/components/ui/input.jsx`
- Modify: `web/src/components/ui/textarea.jsx`

**Interfaces / Produces:** `Button` gains a `secondary` variant + soft shadow + tactile press; `Card` exports a `cardHover` class string for clickable cards.

- [ ] **Step 1: Button.** In `web/src/components/ui/button.jsx`, change the base string `'... rounded-lg text-sm font-semibold transition-colors focus-visible:...'` so `transition-colors` becomes `transition-all` and append `active:translate-y-px`. Then update the `default` variant and add `secondary`:
```js
        default: 'bg-primary text-primary-foreground shadow-soft hover:bg-primary/90 hover:shadow-soft-md',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        destructive: 'bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90',
```

- [ ] **Step 2: Card.** In `web/src/components/ui/card.jsx`, change the `Card` class `'rounded-2xl border bg-card text-card-foreground shadow-sm'` -> `'... shadow-soft'`, and add an exported class string at the bottom (before the existing `export { ... }`):
```js
// Apply to clickable cards/links for a subtle hover lift.
export const cardHover = 'transition-all hover:shadow-soft-md hover:-translate-y-0.5';
```
Add `cardHover` to the existing `export { Card, ... }` list (or keep the separate `export const`).

- [ ] **Step 3: Inputs.** In `web/src/components/ui/input.jsx`, `web/src/components/ui/textarea.jsx`, and `web/src/components/ui/select.jsx`, change `shadow-sm` -> `shadow-soft` wherever it appears in the control's class string (skip a file if it has no `shadow-sm`). No other change.

- [ ] **Step 4: Build + commit.** `cd web; npm run build` -> succeeds.
```bash
git add web/src/components/ui/button.jsx web/src/components/ui/card.jsx web/src/components/ui/input.jsx web/src/components/ui/textarea.jsx
git commit -m "Web/design: soft shadows, tactile buttons, secondary variant, card hover"
```

---

### Task 4: Landing page refinement

**Files:** Modify `web/src/pages/public/LandingPage.jsx`.

**Consumes:** `Button`, `BrandMark`, `IconChip`, `cardHover`, `.bg-eco-soft`, `shadow-soft`.

**Change-spec (copy text unchanged; composition confirmed via screenshot):**
- **Header:** make it `sticky top-0 z-30` with `bg-background/80 backdrop-blur border-b`. Replace the `CW` badge + name with `<BrandMark withWordmark />`. For CTAs that are navigation, keep them semantic `<Link>`s but style them with `buttonVariants(...)` (import `buttonVariants` from `@/components/ui/button` and apply `className={buttonVariants({ size: 'sm' })}`) - do NOT nest a `<button>` inside an `<a>`. So "Report Now" becomes `<Link to="/register" className={buttonVariants({ size: 'sm' })}>Report Now</Link>`.
- **Hero:** wrap the hero `<section>` in a parent with `className="bg-eco-soft"`. Keep the badge pill (add a small `MapPin` icon). Headline stays serif; ensure `tracking-tight`. CTAs: primary `File a Report` via `buttonVariants({ size: 'lg' })`; the other two via `buttonVariants({ variant: 'outline', size: 'lg' })`.
- **Stats grid:** give each tile `bg-background shadow-soft` (instead of the hairline `gap-px` border grid) - 4 cards with `rounded-xl border shadow-soft p-6`, each with a small `IconChip size="sm"` above the number. Icon map: Total `FileText`, Resolved `CircleCheck`, Wildlife `Bird`, Barangays `MapPin`.
- **Services:** each card uses `cn('rounded-xl border bg-background p-6', cardHover)` with an `<IconChip size="lg" tone=...>` header. Icon map: Complaints `Trash2` (amber), Wildlife `Bird` (violet), Requests `Sprout` (primary).
- **Footer:** unchanged except spacing.

- [ ] **Step 1:** Apply the change-spec above to `LandingPage.jsx` (import `buttonVariants` from `@/components/ui/button`, `BrandMark`, `IconChip`, `cardHover`, and the lucide icons used).
- [ ] **Step 2: Build.** `cd web; npm run build` -> succeeds.
- [ ] **Step 3: Screenshot check.** Run the app; open `/`; confirm the hero wash, brand mark, icon stats/services, and that all CTAs are consistent buttons. Adjust spacing/tone until it reads clean.
- [ ] **Step 4: Commit.**
```bash
git add web/src/pages/public/LandingPage.jsx
git commit -m "Web/design: refine landing - eco hero, brand mark, icon stats and services"
```

---

### Task 5: Auth screens polish (AuthShell + Login/Register adoption)

**Files:** Modify `web/src/components/auth/AuthShell.jsx`; verify/adjust `web/src/pages/auth/LoginPage.jsx` and `web/src/pages/auth/RegisterPage.jsx` only to ensure they use `Button` + `Input` (no layout redesign of the forms).

**Consumes:** `BrandMark`, `IconChip`, `.bg-eco-gradient`, lucide `Check`.

**Change-spec:**
- **Brand panel** (`AuthShell.jsx`): change `bg-brand-forest` -> `bg-eco-gradient`. Replace the `CW` white square + name with `<BrandMark withWordmark invert />`. Replace the three `<li>` dot bullets with a `Check` (or `Leaf`) lucide icon in a small `bg-white/15 text-white` rounded square before each point. Keep copy and the footer line.
- **Form side:** keep structure; replace the mobile `Logo` with `<BrandMark withWordmark />`; ensure heading uses `font-display` (already does). Tighten spacing only.
- **Login/Register pages:** confirm submit buttons are `<Button type="submit" className="w-full" loading={...}>` and all fields use the shared `Input`/`Select`/field components (they should already). If any raw `<button>`/`<input>` exists, swap to the shared component. Do not restructure the form fields.

- [ ] **Step 1:** Apply the AuthShell change-spec.
- [ ] **Step 2:** Open `LoginPage.jsx` and `RegisterPage.jsx`; confirm shared controls; swap any raw control if present.
- [ ] **Step 3: Build.** `cd web; npm run build` -> succeeds.
- [ ] **Step 4: Screenshot check.** Open `/login` and `/register`; confirm the gradient brand panel, leaf brand mark, check-icon bullets, and polished form. Adjust until clean.
- [ ] **Step 5: Commit.**
```bash
git add web/src/components/auth/AuthShell.jsx web/src/pages/auth/LoginPage.jsx web/src/pages/auth/RegisterPage.jsx
git commit -m "Web/design: polish auth - gradient brand panel, brand mark, icon bullets"
```

---

### Task 6: Resident dashboard refinement

**Files:** Modify `web/src/pages/resident/DashboardPage.jsx`.

**Consumes:** `IconChip`, `cardHover`, `Card`, `StatusBadge`, lucide icons.

**Change-spec (data/logic unchanged):**
- **Greeting:** drop the waving-hand emoji (keep "Good day, {first_name}").
- **`Stat` component:** add a leading `IconChip size="sm"` row; keep the big number + label; card already `Card` (now `shadow-soft`). Icon map: Total `FileText`, Active `Clock`, Resolved `CircleCheck`, Wildlife `Bird`.
- **Action cards:** replace the emoji `<div>` with `<IconChip size="lg" tone=...>`; add `cardHover` to the link className. Icon map: complaint `Trash2` (amber), wildlife `Bird` (violet), service `Sprout` (primary). Keep titles/desc.
- **Recent reports list:** give each row a small leading per-type icon (`Trash2`/`Bird`/`Sprout` in a `IconChip size="sm"`), keep the title + `id . date` + trailing `StatusBadge`. Keep the empty-state card.

- [ ] **Step 1:** Apply the change-spec to `DashboardPage.jsx` (import `IconChip`, `cardHover`, lucide icons; add a small `kindIcon(kind)` helper mapping `complaint/wildlife/request` to an icon+tone for the recent list and actions).
- [ ] **Step 2: Build.** `cd web; npm run build` -> succeeds.
- [ ] **Step 3: Screenshot check.** Log in as `juan.delacruz@example.com` / `Resident123`; open the dashboard; confirm icon chips, hover-lift actions, and the cleaner recent list. Adjust until clean.
- [ ] **Step 4: Commit.**
```bash
git add web/src/pages/resident/DashboardPage.jsx
git commit -m "Web/design: refine resident dashboard - icon chips, hover-lift, cleaner list"
```

---

### Task 7: Verify + regression spot-check

- [ ] **Step 1: Full build.** `cd web; npm run build` -> succeeds, no new errors.
- [ ] **Step 2: Before/after screenshots.** Capture Landing, Login, Register, Resident Dashboard. Confirm: natural + light identity intact, focus rings visible (tab through), nothing overlaps at mobile width.
- [ ] **Step 3: Regression spot-check.** Open one staff page (e.g. `/staff` after logging in as `staff@cenrowatch.local` / `StaffPass123`) and one admin page (`admin@cenrowatch.local` / `AdminPass123`); confirm the shared-component changes (softer shadows, buttons) improved them and broke nothing.
- [ ] **Step 4: Final commit/push** (if any pending) and stop servers.
```bash
git push origin main
```
