# Web UI/UX Enrichment + CENRO Logo - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, no subagents per user preference). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deliver clearly-visible UI/UX upgrades to the CENROWATCH public + resident web
screens and introduce the official CENRO Cabuyao seal as the brand mark, keeping the
light theme and green/forest nature ambience.

**Architecture:** Extend the existing Tailwind token + shadcn-style component system. Add a
small CSS ambience layer (leaf motif, section bands, accent bar), one `CenroLogo` component
(seal image with graceful leaf fallback), reusable section/visual helpers, then enrich the
existing pages. No new npm dependencies.

**Tech Stack:** React 18 + Vite, Tailwind, `tailwindcss-animate` (installed), `lucide-react`
(installed), inline SVG. Seal PNG served from `web/public/`.

## Global Constraints
- Light theme only; exact Figma palette: Forest `#0f3d1f`, Primary `#22a050`, Accent `#2dc568`,
  Light `#8fe8ae`, Tint `#e6fdf0`, Surface `#f8faf9`.
- Zero new npm packages. Inline SVG for motifs; `tailwindcss-animate` for keyframes.
- ASCII-only source edits (existing `--` box headers OK).
- No backend/API changes; reuse existing endpoints.
- Verify with `cd web && npm run build` (must pass) + Playwright screenshots, 0 console errors.
- Seal lives at `web/public/cenro-logo.png` (static path `/cenro-logo.png`); a missing file must
  NOT break the build - `CenroLogo` falls back to the leaf `BrandMark` on image error.

## File map
- Create: `web/src/components/ui/cenro-logo.jsx`, `web/src/components/ui/section.jsx`,
  `web/src/components/ui/progress-ring.jsx`, `web/src/components/resident/StatusTimeline.jsx`.
- Modify: `web/src/index.css`, `web/tailwind.config.js`, `web/src/components/ui/button.jsx`,
  `web/src/pages/public/LandingPage.jsx`, `web/src/components/auth/AuthShell.jsx`,
  `web/src/components/resident/ResidentLayout.jsx`, `web/src/pages/resident/DashboardPage.jsx`,
  `web/src/components/resident/ReportFormShell.jsx`, `web/src/pages/resident/TrackReportPage.jsx`,
  and the 3 form pages (pass icon/tone to the shell).
- Mobile (asset-gated): `mobile/app.json` + mobile auth screen image - only when the seal file
  is present in `mobile/assets/`.

---

### Task 1: Ambience foundation (CSS + tokens + button)

**Files:** Modify `web/src/index.css`, `web/tailwind.config.js`, `web/src/components/ui/button.jsx`.

- [ ] **Step 1: Add ambience utilities to `index.css`** inside the existing `@layer components` block
  (after `.bg-eco-gradient`):

```css
  /* Thin official accent bar for the top of public pages. */
  .accent-bar-top {
    height: 4px;
    background: linear-gradient(90deg, #0f3d1f 0%, #22a050 50%, #2dc568 100%);
  }
  /* Faint repeating leaf motif (very low opacity) for hero/auth panels. */
  .bg-leaf-motif {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%2322a050' stroke-opacity='0.10' stroke-width='2'%3E%3Cpath d='M30 18 C46 24 50 44 30 58 C10 44 14 24 30 18 Z'/%3E%3Cpath d='M30 18 L30 58'/%3E%3Cpath d='M90 62 C106 68 110 88 90 102 C70 88 74 68 90 62 Z'/%3E%3Cpath d='M90 62 L90 102'/%3E%3C/g%3E%3C/svg%3E");
    background-repeat: repeat;
  }
  /* Soft alternating tinted section background for page rhythm. */
  .bg-eco-band {
    background:
      linear-gradient(180deg, #f8faf9 0%, #ffffff 100%);
  }
```

- [ ] **Step 2: Add keyframes/animation to `tailwind.config.js`** - extend the existing
  `keyframes` and `animation` objects (alongside the accordion ones):

```js
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'float-soft': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
```
```js
        'fade-up': 'fade-up 0.5s ease-out both',
        'float-soft': 'float-soft 6s ease-in-out infinite',
```

- [ ] **Step 3: Give the default Button a subtle gradient** - in `button.jsx`, replace the
  `default` variant string with:

```js
        default: 'bg-gradient-to-br from-brand-primary to-brand-accent text-primary-foreground shadow-soft hover:shadow-soft-md hover:brightness-[1.05]',
```

- [ ] **Step 4: Verify build**

Run: `cd web ; npm run build`
Expected: `built in ...` success, no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/index.css web/tailwind.config.js web/src/components/ui/button.jsx
git commit -m "Web/design: ambience layer - accent bar, leaf motif, section band, gradient button"
```

---

### Task 2: CenroLogo + visual helpers

**Files:** Create `web/src/components/ui/cenro-logo.jsx`, `web/src/components/ui/section.jsx`,
`web/src/components/ui/progress-ring.jsx`.

**Produces:**
- `CenroLogo({ withWordmark, withSubtitle, invert, size='md', className })`
- `LeafDivider({ className })`, `Step({ n, title, desc, icon, tone })`, `StepConnector()`
- `ProgressRing({ value, size=64, stroke=6, label })` (value 0..100)

- [ ] **Step 1: Write `cenro-logo.jsx`** (seal img + graceful leaf fallback):

```jsx
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/ui/brand-mark';

const BOX = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14' };

// Official CENRO Cabuyao seal (served from /public). Falls back to the leaf
// BrandMark if the image is missing/broken so the build is never blocked.
export function CenroLogo({ withWordmark = false, withSubtitle = false, invert = false, size = 'md', className }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <BrandMark withWordmark={withWordmark} invert={invert} className={className} />;
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className={cn('flex items-center justify-center overflow-hidden rounded-xl shadow-soft', invert ? 'bg-white p-1' : '', BOX[size])}>
        <img src="/cenro-logo.png" alt="CENRO Cabuyao seal" className="h-full w-full object-contain" onError={() => setBroken(true)} />
      </span>
      {withWordmark && (
        <span className="leading-tight">
          <span className={cn('block text-lg font-bold tracking-tight', invert ? 'text-white' : 'text-foreground')}>CENROWATCH</span>
          {withSubtitle && <span className={cn('block text-[11px] font-medium', invert ? 'text-white/70' : 'text-muted-foreground')}>CENRO Cabuyao</span>}
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Write `section.jsx`** (leaf divider + how-it-works step):

```jsx
import { cn } from '@/lib/utils';
import { IconChip } from '@/components/ui/icon-chip';

// Subtle organic divider between page sections.
export function LeafDivider({ className }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-2 text-brand-light', className)} aria-hidden="true">
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-brand-light" />
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 18C6 9 12 4 20 4c0 8-5 14-14 14Z" /><path d="M6 18 18 6" />
      </svg>
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-brand-light" />
    </div>
  );
}

// One step in the "How it works" strip.
export function Step({ n, icon, title, desc, tone = 'primary' }) {
  return (
    <div className="relative flex flex-col items-center text-center">
      <IconChip icon={icon} tone={tone} size="lg" />
      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Step {n}</div>
      <div className="mt-1 font-semibold text-foreground">{title}</div>
      <p className="mt-1 max-w-[16rem] text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
```

- [ ] **Step 3: Write `progress-ring.jsx`** (inline SVG ring):

```jsx
// Circular progress ring (0..100). Pure SVG, no deps.
export function ProgressRing({ value = 0, size = 64, stroke = 6, label, className }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  return (
    <span className={className} style={{ display: 'inline-flex', position: 'relative' }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6fdf0" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#22a050" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-primary">
        {label ?? `${Math.round(pct)}%`}
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Verify build** - `cd web ; npm run build` (Expected: success).
- [ ] **Step 5: Commit** - `git add web/src/components/ui/cenro-logo.jsx web/src/components/ui/section.jsx web/src/components/ui/progress-ring.jsx && git commit -m "Web/design: add CenroLogo (seal + leaf fallback), section helpers, progress ring"`

---

### Task 3: Landing page rewrite

**Files:** Modify `web/src/pages/public/LandingPage.jsx`.
**Consumes:** `CenroLogo`, `LeafDivider`, `Step` (Task 2); `IconChip`, `buttonVariants`,
`cardHover`, `StatusBadge`; ambience classes (Task 1).

- [ ] **Step 1: Rewrite the page** with this structure (keep the existing `gisApi.stats` fetch and
  `stats`/`STAT_META`/`services` data; add icons `ArrowRight`, `ClipboardList`, `Search`,
  `CircleCheck` to imports):
  - `<div>` root: `.accent-bar-top` strip; sticky header (`<CenroLogo withWordmark />`, nav, "Report Now" CTA).
  - Hero `section` with `bg-eco-soft` + overlay `div.bg-leaf-motif` + two blurred blobs
    (`absolute ... rounded-full bg-brand-light/30 blur-3xl`); grid `lg:grid-cols-2`:
    left = Live pill, `h1` display, trust line "Official environmental system of CENRO Cabuyao",
    dual CTAs (`buttonVariants`), track link, all wrapped `animate-fade-up`;
    right (`hidden lg:block`) = **preview card**: a `Card`-style rounded panel `shadow-soft-lg`
    showing 2 mini stat tiles + a sample "Complaint - Under Review" row with `IconChip` +
    `StatusBadge`, given `animate-float-soft`.
  - Stats grid: each tile gets a top accent (`border-t-2 border-brand-accent`) + `IconChip` + number + label.
  - `<LeafDivider />`.
  - **How it works** section (`bg-eco-band`): heading + 3 `<Step>` (1 Report/ClipboardList/primary,
    2 Review/Search/blue, 3 Resolve/CircleCheck/forest) in `sm:grid-cols-3`.
  - Services section: cards `cn('rounded-xl border bg-background p-6', cardHover)` + a tinted top strip
    per tone + `IconChip(lg)`.
  - **Footer** (richer): top border; grid `sm:grid-cols-3`: col1 `<CenroLogo withWordmark withSubtitle />`
    + blurb; col2 quick links (Live Map, Reports, Wildlife, Track); col3 office line + institution.
    Bottom row: ASCII copyright `{year} CENROWATCH - CENRO Cabuyao` + "Pamantasan ng Cabuyao - BSIT Capstone".
  - ASCII only (no special dashes/symbols).

- [ ] **Step 2: Verify build** - `cd web ; npm run build` (Expected: success).
- [ ] **Step 3: Screenshot-verify** (after Task 6, batched) - Landing desktop 1280 + mobile 390, 0 console errors.
- [ ] **Step 4: Commit** - `git add web/src/pages/public/LandingPage.jsx && git commit -m "Web/design: richer landing - layered hero + preview, how-it-works, footer"`

---

### Task 4: Auth shell rewrite

**Files:** Modify `web/src/components/auth/AuthShell.jsx`.
**Consumes:** `CenroLogo`; ambience classes.

- [ ] **Step 1: Rewrite** keeping the two-column structure and `points` list:
  - Brand panel: add `.bg-leaf-motif` overlay div over `bg-eco-gradient`; `<CenroLogo withWordmark withSubtitle invert />`;
    keep headline + Check-icon bullets; replace footer line with trust line
    "Official environmental system of CENRO Cabuyao - Pamantasan ng Cabuyao BSIT Capstone".
  - Form side: `.accent-bar-top` at very top of the column; mobile brand uses `<CenroLogo withWordmark />`.
- [ ] **Step 2: Verify build** - `cd web ; npm run build`.
- [ ] **Step 3: Commit** - `git add web/src/components/auth/AuthShell.jsx && git commit -m "Web/design: seal-forward auth panel with leaf motif"`

---

### Task 5: Resident layout + dashboard

**Files:** Modify `web/src/components/resident/ResidentLayout.jsx`, `web/src/pages/resident/DashboardPage.jsx`.
**Consumes:** `CenroLogo`, `ProgressRing`; `IconChip`, `cardHover`.

- [ ] **Step 1: ResidentLayout** - replace the `BrandMark` import+usage with `<CenroLogo withWordmark />`.
- [ ] **Step 2: Dashboard** - add a **welcome banner** above the stats: a rounded `bg-eco-gradient`
  panel (`relative overflow-hidden`, `.bg-leaf-motif` overlay) with greeting "Good day, {first_name}",
  subtitle "Cabuyao Environmental Monitor", a `<ProgressRing value={resolvedPct} label>` (resolved/total*100,
  guard divide-by-zero -> 0) on the right, and a "File a report" CTA linking to `/resident/report-complaint`.
  Remove the old plain `<h1>` header block (banner replaces it).
- [ ] **Step 3: Dashboard cards** - `Stat` card: add `border-t-2 border-brand-accent`. Action cards:
  add per-kind soft gradient tint via a `TINT` map (`complaint:'from-amber-50'`, `wildlife:'from-violet-50'`,
  `request:'from-emerald-50'`) using `bg-gradient-to-br ... to-white`, plus a trailing `ArrowRight` icon.
- [ ] **Step 4: Verify build** - `cd web ; npm run build`.
- [ ] **Step 5: Commit** - `git add web/src/components/resident/ResidentLayout.jsx web/src/pages/resident/DashboardPage.jsx && git commit -m "Web/design: resident header seal + dashboard welcome banner/progress ring/richer cards"`

---

### Task 6: Report form shell + tracking timeline (+ emoji cleanup)

**Files:** Create `web/src/components/resident/StatusTimeline.jsx`; modify
`web/src/components/resident/ReportFormShell.jsx`, `web/src/pages/resident/TrackReportPage.jsx`,
and the 3 form pages (`ComplaintFormPage.jsx`, `WildlifeFormPage.jsx`, `ServiceRequestFormPage.jsx`).
**Consumes:** `IconChip`, `StatusBadge`; lucide `Trash2`/`Bird`/`Sprout`, `CircleCheck`, `MapPin`.

- [ ] **Step 1: ReportFormShell** - accept new props `icon`, `tone`; render a header strip inside the
  `Card` (or above the form): `IconChip(icon, tone, lg)` + `title` + `subtitle` on a `bg-eco-band`
  rounded top. Replace the emoji `✅` in `SuccessCard` with `<IconChip icon={CircleCheck} tone="forest" size="lg" />`.
- [ ] **Step 2: Form pages** - pass `icon`/`tone` to `ReportFormShell`:
  Complaint -> `icon={Trash2} tone="amber"`, Wildlife -> `icon={Bird} tone="violet"`,
  ServiceRequest -> `icon={Sprout} tone="primary"`. (Add the lucide import to each.)
- [ ] **Step 3: StatusTimeline component** - build an implied vertical stepper from the report's
  current status (no API change). Map per kind to a canonical sequence and mark
  done/current/upcoming with a colored dot + connector line + optional timestamp:

```jsx
import { cn } from '@/lib/utils';

// Canonical resident-visible step sequences per report kind.
const FLOWS = {
  complaint: ['Submitted', 'Under Review', 'In Progress', 'Resolved'],
  wildlife: ['Submitted', 'Under Review', 'In Progress', 'Completed'],
  request: ['Submitted', 'Under Review', 'Scheduled', 'Released'],
};
// Map a raw status to its index in the flow (best-effort, case-insensitive).
function statusIndex(flow, status) {
  const s = (status || '').toLowerCase();
  const i = flow.findIndex((f) => f.toLowerCase() === s);
  if (i >= 0) return i;
  if (['rejected', 'closed', 'cancelled'].includes(s)) return flow.length - 1;
  return 0;
}

export function StatusTimeline({ kind, status, times = {} }) {
  const flow = FLOWS[kind] || FLOWS.complaint;
  const active = statusIndex(flow, status);
  return (
    <ol className="space-y-0">
      {flow.map((label, i) => {
        const done = i < active, current = i === active;
        return (
          <li key={label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold',
                done ? 'border-primary bg-primary text-white' : current ? 'border-primary text-primary' : 'border-muted text-muted-foreground')}>
                {done ? '✓' : i + 1}
              </span>
              {i < flow.length - 1 && <span className={cn('w-0.5 flex-1 min-h-[28px]', i < active ? 'bg-primary' : 'bg-border')} />}
            </div>
            <div className="pb-6">
              <div className={cn('text-sm font-semibold', current ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground')}>{label}</div>
              {times[label] && <div className="text-xs text-muted-foreground">{times[label]}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: TrackReportPage** - render `<StatusTimeline kind={kind} status={view.status} times={...}/>`
  in a `Card` above/beside the details (pass `times` built from `submitted_at`, `scheduled_date`,
  `resolved_at` via the existing `fmt`). Replace the `📍` emoji with a lucide `<MapPin className="h-4 w-4" />`.
- [ ] **Step 5: Verify build** - `cd web ; npm run build`.
- [ ] **Step 6: Screenshot-verify the whole set** (Landing desktop+mobile, Login desktop, Register,
  Dashboard, one form, Track) via Playwright; confirm 0 console errors; clean up screenshot artifacts.
- [ ] **Step 7: Commit** - `git add -A web/src && git commit -m "Web/design: form header strips, status timeline, emoji cleanup"`

---

### Task 7: Mobile logo (asset-gated)

**Files:** `mobile/app.json`, mobile auth screen. **Only execute if `mobile/assets/cenro-logo.png` exists**
(pointing app.json at a missing asset breaks Expo). If absent, defer with a one-line note to the user.

- [ ] **Step 1: If the seal is present**, set `app.json` `expo.icon` to `./assets/cenro-logo.png` and add
  a small `<Image source={require('../assets/cenro-logo.png')} style={{width:48,height:48}} />` to the mobile
  login screen header.
- [ ] **Step 2: Verify** - `cd mobile ; npx expo export --platform android` (bundles, catches import errors).
- [ ] **Step 3: Commit** - `git add mobile/app.json mobile/src && git commit -m "Mobile: CENRO seal app icon + login header"`

---

## Verification (whole feature)
1. `cd web && npm run build` succeeds after each task.
2. Playwright: Landing (1280 + 390), Login (1280), Register, Resident Dashboard, a report form, Track page.
   Confirm light theme + green palette intact, seal (or leaf fallback) renders, new sections present,
   timeline + progress ring display, **0 console errors**.
3. Remove screenshot artifacts before finishing.
4. The seal file is the user's to drop into `web/public/cenro-logo.png` (and `mobile/assets/`); until then
   the leaf fallback shows - no breakage.

## Self-review notes
- Spec coverage: brand (T2,T3,T4,T5), ambience (T1), landing (T3), auth (T4), resident dash (T5),
  forms+timeline (T6), mobile (T7) - all covered.
- No new deps; all motifs inline SVG / `tailwindcss-animate`.
- Names consistent across tasks: `CenroLogo`, `LeafDivider`, `Step`, `ProgressRing`, `StatusTimeline`.
