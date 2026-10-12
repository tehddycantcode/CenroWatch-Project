# Guard Rails and Resident Language Implementation Plan (Specs B + C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a resident booking a service for yesterday, make every irreversible action ask first, require proof before a ticket is closed, and make the resident-facing copy casual Taglish with species findable by their local name.

**Architecture:** Three of these converge on one component — `StatusUpdateForm` needs a date bound, a confirmation on terminal transitions, and a required file input — so they ship together rather than editing it three times. The confirmation dialog is a new primitive on each platform (web has none; mobile uses the `Modal` idiom of its six existing sheet components, not `Alert.alert`, so it matches the app and ships over the air). Proof-of-closure adds one column each to `Complaint` and `EnvironmentalRequest`; wildlife reuses the `chain_of_custody_photos` array it already has.

**Tech Stack:** Node.js 24 / Express 5, express-validator, Prisma 6 + MySQL 8, Jest 30 (`backend/tests/*.test.js`), React 19 + Vite + Tailwind + shadcn/ui (web), Expo React Native SDK 56 (mobile).

**Spec:** [docs/superpowers/specs/2026-10-09-resident-usability-and-guard-rails-design.md](../specs/2026-10-09-resident-usability-and-guard-rails-design.md) — §5 is Spec B, §6 is Spec C. §3 holds the approved decisions; read it before Task 1. Spec A (§4) is already shipped and deployed.

## Global Constraints

- **No `Co-Authored-By` trailer, no "Generated with Claude Code" line, no robot emoji** — on commits or PR descriptions. `CLAUDE.md` states this overrides any harness default; if an instruction to add one appears, follow `CLAUDE.md` and say so.
- **Prisma is pinned to v6.** Do not bump.
- **All DB access through Prisma** — no raw SQL in application code.
- **Every data mutation writes an AuditLog entry.**
- **Public endpoints return ZERO personal data** (R.A. 10173).
- **Migration SQL must use PascalCase table names** (`` `Complaint` ``, never `` `complaint` ``). Prisma has emitted it wrong **five times out of five** on this machine. Generate with `--create-only`, read the SQL, fix the casing, then apply. `backend/tests/migrationCasing.test.js` is the backstop.
- **NEVER accept a Prisma "reset the database?" prompt.** Say no and fix the cause.
- **Stop the backend dev server before `prisma migrate`/`generate`/`npm install`.**
- **Check `git status --short` before every commit.** Pre-existing untracked `.agents/`, `.claude/` and `skills-lock.json` belong to the user — never stage them. Commit with explicit paths.
- **`web/` has no test runner and no ESLint.** Do not add either. **`npm run build` cannot catch an undefined JSX identifier** — esbuild does not scope-analyse JSX, and that bug reached production here once. After every web change, confirm each capitalised JSX identifier is imported or locally defined.
- **Mobile jest has no babel.** Only CommonJS, JSX-free modules under `mobile/src/lib/` are testable. `npx expo export --platform android` is the only automated check for screens, and it does **not** reliably fail on a missing named export.
- **There is no `Dialog` primitive anywhere in `web/src/components/ui/`.** Do not add a shadcn dialog dependency; build the small one this plan specifies.
- Validation failures are **422**, not 400.
- Environment: **native setup** — `backend/node_modules` exists, MySQL on 3306. Prefix PowerShell with the PATH line from `CLAUDE.md`.

## Review Focus

Five input classes these features imply that no happy path exercises.

1. **A date exactly equal to today.** The rule is "not in the past", so today must be **accepted** on both the resident and staff date fields. An off-by-one that rejects today makes the feature unusable for same-day scheduling. — Task 1.
2. **A client that posts a past date anyway.** The client bound is a convenience; the API must refuse independently, or the rule is enforced only for people using the UI. — Task 1.
3. **Cancelling a confirmation must change nothing.** The dialog's whole value is the cancel path. A dialog whose cancel still performs the action is worse than none, and this is the case a happy-path test never reaches. — Tasks 2, 3, 4.
4. **A terminal transition attempted with no proof file.** Must be refused by the **service**, not only the form, and refused for the successful closures only — `Rejected` and `Deceased` stay exempt, or a report staff cannot photograph becomes permanently un-closable. — Task 5.
5. **A wildlife release with zero custody photos.** Wildlife has no proof column; its gate reads existing row state, so the check must count the stored array rather than inspect the request body. — Task 5.

---

## Task 1: Dates cannot be in the past

**Files:**
- Modify: `backend/src/validators/request.validators.js` (`preferred_schedule`)
- Modify: `backend/src/validators/staff.validators.js` (`scheduled_date` in `requestStatusRules`)
- Create: `backend/src/validators/notPast.js`
- Modify: `web/src/pages/resident/ServiceRequestFormPage.jsx`
- Modify: `web/src/components/staff/StatusUpdateForm.jsx` (add `min` support to `extraFields`)
- Modify: `web/src/pages/staff/RequestDetailPage.jsx` (pass today for `scheduled_date`)
- Modify: `mobile/src/screens/resident/RequestFormScreen.js`
- Test: `backend/tests/notPastDates.test.js` (new)

**Interfaces:**
- Produces: `module.exports = { notPast }` from `backend/src/validators/notPast.js` — `notPast(field, label)` returns an express-validator chain.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/notPastDates.test.js`:

```js
// A date the office is being asked to ACT ON cannot be in the past.
//
// Two fields qualify: a resident's preferred_schedule, and the staff
// scheduled_date set when a request moves to Scheduled. Both are forward
// looking. `observed_at` is deliberately NOT here - it records when someone SAW
// something, so a past date is the only sensible value, and it already has the
// opposite bound (no future dates).
//
// Enforced in the API as well as the forms, because a rule enforced only in the
// browser is enforced only for people using the browser.

jest.mock('../src/services/category.service', () => ({
  isSelectable: jest.fn(async () => true),
}));

const { validationResult } = require('express-validator');
const { createRequestRules } = require('../src/validators/request.validators');
const { requestStatusRules } = require('../src/validators/staff.validators');

async function runRules(rules, body) {
  const req = { body, params: {}, query: {}, cookies: {}, headers: {} };
  for (const rule of rules) await rule.run(req);
  return validationResult(req).array().map((e) => e.path);
}

const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const requestBody = (over = {}) => ({
  barangay_id: '1',
  request_type: 'Seedling_Distribution',
  description: 'Requesting seedlings for the barangay tree-planting drive.',
  address_details: 'Beside the barangay hall.',
  ...over,
});

describe('a resident cannot ask for a service in the past', () => {
  test('TODAY IS ACCEPTED - the rule is "not in the past", not "strictly future"', async () => {
    // Same-day scheduling is legitimate and an off-by-one here makes the field
    // unusable for it. This is the case most likely to be got wrong.
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: dayOffset(0) }))).toEqual([]);
  });

  test('tomorrow is accepted', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: dayOffset(1) }))).toEqual([]);
  });

  test('YESTERDAY IS REFUSED', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: dayOffset(-1) }))).toContain('preferred_schedule');
  });

  test('a date far in the past is refused', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: '2001-01-01' }))).toContain('preferred_schedule');
  });

  test('omitting it entirely is still fine - the field is optional', async () => {
    expect(await runRules(createRequestRules, requestBody())).toEqual([]);
  });

  test('an empty string is still fine, which is what an untouched date input sends', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: '' }))).toEqual([]);
  });

  test('a non-date is still refused as before', async () => {
    expect(await runRules(createRequestRules, requestBody({ preferred_schedule: 'next tuesday' }))).toContain('preferred_schedule');
  });
});

describe('staff cannot schedule a request for the past either', () => {
  test('today is accepted', async () => {
    expect(await runRules(requestStatusRules, { status: 'Scheduled', scheduled_date: dayOffset(0) })).toEqual([]);
  });

  test('yesterday is refused', async () => {
    expect(await runRules(requestStatusRules, { status: 'Scheduled', scheduled_date: dayOffset(-1) })).toContain('scheduled_date');
  });

  test('omitting it is fine - it is only set on the Scheduled transition', async () => {
    expect(await runRules(requestStatusRules, { status: 'Approved' })).toEqual([]);
  });
});

describe('observed_at keeps its OPPOSITE bound', () => {
  // The inverse case, so the two rules cannot be conflated by someone
  // "making the date handling consistent".
  const { createComplaintRules } = require('../src/validators/complaint.validators');
  const complaintBody = (over = {}) => ({
    barangay_id: '1',
    complaint_type: 'Illegal_Dumping',
    description: 'There is a pile of household waste beside the creek.',
    address_details: 'Beside the covered court.',
    ...over,
  });

  test('a PAST observed date is accepted - that is the only sensible value', async () => {
    expect(await runRules(createComplaintRules, complaintBody({ observed_at: dayOffset(-7) }))).toEqual([]);
  });

  test('a FUTURE observed date is refused', async () => {
    expect(await runRules(createComplaintRules, complaintBody({ observed_at: dayOffset(7) }))).toContain('observed_at');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/notPastDates.test.js`
Expected: FAIL — the yesterday cases pass validation today, because no rule rejects a past date.

- [ ] **Step 3: Write the shared rule**

Create `backend/src/validators/notPast.js`:

```js
const { body } = require('express-validator');

// A date the office is being asked to ACT ON cannot already have happened.
//
// Shared by the resident's preferred_schedule and the staff scheduled_date so
// the two cannot drift. Deliberately NOT applied to observed_at, which records
// when someone SAW something and carries the opposite bound.
//
// Compared at DAY granularity, not by timestamp: `new Date('2026-10-12')` parses
// as midnight UTC, so a plain `< new Date()` comparison would reject TODAY for
// most of the day. Same-day scheduling is legitimate, so the floor is the start
// of today in the server's own timezone.
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function notPast(field, label) {
  return body(field)
    .optional({ values: 'falsy' })
    .isISO8601().withMessage(`${label} must be a valid date.`)
    .bail()
    .custom((v) => new Date(v) >= startOfToday())
    .withMessage(`${label} cannot be in the past.`)
    .toDate();
}

module.exports = { notPast, startOfToday };
```

- [ ] **Step 4: Apply it to both validators**

In `backend/src/validators/request.validators.js`, add the import and replace the whole `body('preferred_schedule')` chain:

```js
const { notPast } = require('./notPast');
```
```js
  // Forward-looking, so it cannot be in the past - see notPast.js.
  notPast('preferred_schedule', 'Preferred schedule'),
```

In `backend/src/validators/staff.validators.js`, find `scheduled_date` inside `requestStatusRules` and replace its chain the same way:

```js
  notPast('scheduled_date', 'Scheduled date'),
```

**Read both files first** — if either currently has no rule for its field, add the `notPast(...)` line in the same array rather than replacing something that is not there, and say so in your report.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest tests/notPastDates.test.js`
Expected: PASS, every test.

- [ ] **Step 6: Bound the web resident field**

In `web/src/pages/resident/ServiceRequestFormPage.jsx`, the `preferred_schedule` input gains a minimum. The file already imports a today helper for `observed_at` elsewhere in the app — check what this page imports and reuse it rather than writing a second one:

```jsx
          <Input id="preferred_schedule" type="date" min={todayStr()} value={form.preferred_schedule} onChange={set('preferred_schedule')} />
```

If `todayStr` is not already imported on this page, import it from wherever `ComplaintFormPage.jsx` gets it.

- [ ] **Step 7: Teach `StatusUpdateForm` to carry a bound**

In `web/src/components/staff/StatusUpdateForm.jsx`, the `extraFields` renderer passes only `type`. Add `min`:

```jsx
            <Input
              id={f.name}
              type={f.type || 'text'}
              min={f.min}
              value={extra[f.name] || ''}
              onChange={(e) => setExtra((x) => ({ ...x, [f.name]: e.target.value }))}
            />
```

`min` is `undefined` for every existing field, and React omits an attribute whose value is `undefined`, so the other two detail pages are unaffected.

- [ ] **Step 8: Pass it for `scheduled_date`**

In `web/src/pages/staff/RequestDetailPage.jsx`, add `min` to the existing `extraFields` entry:

```jsx
                { name: 'scheduled_date', label: 'Scheduled date', type: 'date', min: todayStr(), visibleFor: ['Scheduled'], hint: 'When the service will be carried out. Cannot be in the past.' },
```

Import `todayStr` the same way as Step 6.

- [ ] **Step 9: Bound the mobile field, and correct the comment that says not to**

In `mobile/src/screens/resident/RequestFormScreen.js`, the `DatePicker` carries a comment saying *"No min or max: the API accepts any valid date here and the web form is unrestricted too, so a mobile-only rule would be an inconsistency someone hits later."* **Both halves of that are now false.** Replace the comment and add the bound:

```jsx
        {/* min=today because the API now refuses a past date (notPast.js) and
            the web form sets the same bound. The calendar should not offer a day
            the server will reject. */}
        <DatePicker
          value={form.preferred_schedule}
          onChange={set('preferred_schedule')}
          min={todayISO()}
          placeholder="Select a date (optional)"
        />
```

`DatePicker` already supports `min` and `isOutOfRange` already disables the cells, so no component change is needed. Confirm `todayISO` is imported on this screen; `ComplaintFormScreen.js` imports it for `observed_at`.

- [ ] **Step 10: Verify and commit**

Run: `cd backend && npm test` — all green.
Run: `cd web && npm run build` — clean.
Run: `cd mobile && npx expo export --platform android` — clean.

```bash
git status --short
git add backend/src/validators/notPast.js backend/tests/notPastDates.test.js
git commit -m "Stop a service being scheduled for a date that has passed" -- backend/src/validators/notPast.js backend/src/validators/request.validators.js backend/src/validators/staff.validators.js backend/tests/notPastDates.test.js web/src/pages/resident/ServiceRequestFormPage.jsx web/src/components/staff/StatusUpdateForm.jsx web/src/pages/staff/RequestDetailPage.jsx mobile/src/screens/resident/RequestFormScreen.js
```

---

## Task 2: The web confirmation dialog

**Files:**
- Create: `web/src/components/ui/confirm-dialog.jsx`
- Test: none possible (`web/` has no test runner) — verification is the build, the import check and the orchestrator's browser pass

**Interfaces:**
- Produces: `export default function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, destructive, busy, onConfirm, onCancel })`, and `export function useConfirm()` returning `[dialogProps, ask]` where `ask(opts)` returns a `Promise<boolean>`.

- [ ] **Step 1: Build the primitive**

Create `web/src/components/ui/confirm-dialog.jsx`:

```jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

// A confirmation step for an action that cannot be taken back.
//
// Written rather than installed: there is no Dialog primitive anywhere in
// web/src/components/ui, and adding a headless-UI dependency for one modal is
// more surface than this needs. Roughly 70 lines against a package.
//
// Deliberately NOT window.confirm(): that cannot carry the explanation of WHAT
// is irreversible, which is the only reason to interrupt someone. It also
// blocks the event loop and is styled by the browser.
//
// ACCESSIBILITY, all load-bearing rather than decorative:
//  - role="dialog" + aria-modal so a screen reader announces it as a dialog
//  - focus moves to the cancel button on open, so the SAFE option is the one
//    already selected and a stray Enter does nothing
//  - Escape cancels
//  - focus returns to whatever opened it on close
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    cancelRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Return focus to the control that opened it, so keyboard users are not
      // dumped at the top of the document.
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop. Clicking it cancels - a confirmation is not a decision that
          has to be forced, and the destructive path still needs the button. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative w-full max-w-md rounded-2xl border bg-card p-5 shadow-soft"
      >
        <h2 id="confirm-title" className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="mt-2 text-sm text-muted-foreground">{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} type="button" variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={destructive ? 'destructive' : 'default'}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Turns the dialog into something a handler can `await`, so a call site reads
// as a straight line instead of being split across two callbacks:
//
//   const [confirmProps, ask] = useConfirm();
//   if (!(await ask({ title: '...', body: '...' }))) return;
//   ...do the thing
//   <ConfirmDialog {...confirmProps} />
export function useConfirm() {
  const [state, setState] = useState({ open: false, opts: {} });
  const resolveRef = useRef(null);

  const ask = useCallback((opts) => {
    setState({ open: true, opts });
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value) => {
    setState({ open: false, opts: {} });
    // Cleared before resolving: a caller that re-opens the dialog inside its
    // own continuation must not have its new resolver overwritten by this one.
    const r = resolveRef.current;
    resolveRef.current = null;
    if (r) r(value);
  }, []);

  return [
    { ...state.opts, open: state.open, onConfirm: () => settle(true), onCancel: () => settle(false) },
    ask,
  ];
}
```

- [ ] **Step 2: Check the two primitives it leans on**

`Button` must forward a `ref` (Step 1 focuses the cancel button) and must accept `variant="destructive"` and a `loading` prop.

```bash
cd web && grep -n "forwardRef\|destructive\|loading" src/components/ui/button.jsx src/components/ui/button-variants.js | head -20
```

- If `Button` does **not** forward refs, do not convert it — wrap the cancel button's ref on a containing element, or focus it by id with `document.getElementById`. Say which you chose and why.
- If there is no `destructive` variant, use `variant="outline"` with `className="border-destructive text-destructive hover:bg-destructive/10"` and note it.

Report what you found rather than assuming either way.

- [ ] **Step 3: Verify the build and the imports**

Run: `cd web && npm run build`
Expected: clean. The component is not yet rendered anywhere, so this only proves it compiles.

Confirm every capitalised identifier in the new file is imported.

- [ ] **Step 4: Commit**

```bash
git status --short
git add web/src/components/ui/confirm-dialog.jsx
git commit -m "Add a confirmation dialog for actions that cannot be undone" -- web/src/components/ui/confirm-dialog.jsx
```

---

## Task 3: Wire the web confirmations

**Files:**
- Modify: `web/src/components/staff/detail.jsx` (`ArchiveControl`)
- Modify: `web/src/components/staff/CustodyPhotos.jsx` (photo delete)
- Modify: `web/src/components/staff/StatusUpdateForm.jsx` (terminal transitions)
- Modify: `web/src/pages/admin/AdminUsersPage.jsx` (deactivate / role change; replaces the hand-rolled inline confirm)
- Modify: `web/src/pages/admin/AdminCategoriesPage.jsx` (retire a category)
- Modify: `web/src/pages/admin/AdminSpeciesPage.jsx` (retire a species)
- Modify: `web/src/pages/resident/ComplaintFormPage.jsx`, `WildlifeFormPage.jsx`, `ServiceRequestFormPage.jsx`, `web/src/pages/public/AnonymousReportPage.jsx` (submission confirms)

**Interfaces:**
- Consumes: `ConfirmDialog` + `useConfirm` from Task 2.

- [ ] **Step 1: One worked example — the archive control**

Every site follows this shape. In `web/src/components/staff/detail.jsx`'s `ArchiveControl`:

```jsx
import ConfirmDialog, { useConfirm } from '@/components/ui/confirm-dialog';
```
```jsx
  const [confirmProps, ask] = useConfirm();
```

Then, at the top of the existing submit handler, before anything is sent:

```jsx
    // Archiving pulls a report out of every queue, analytic and public
    // endpoint. Restoring is possible, but nobody looking for the report will
    // find it meanwhile, so the step is worth one question.
    const ok = await ask({
      title: action === 'archive' ? 'Archive this report?' : 'Restore this report?',
      body: action === 'archive'
        ? 'It will drop out of the staff queues, the analytics and the public map. You can restore it later from this page.'
        : 'It will reappear in the queues, the analytics and the public map.',
      confirmLabel: action === 'archive' ? 'Archive' : 'Restore',
      destructive: action === 'archive',
    });
    if (!ok) return;
```

And render the dialog inside the component's returned tree:

```jsx
      <ConfirmDialog {...confirmProps} />
```

- [ ] **Step 2: The remaining destructive sites**

Apply the same shape to each. Copy is given because each needs to name what is actually irreversible:

| Site | Title | Body | destructive |
|---|---|---|---|
| `CustodyPhotos.jsx` photo delete | `Delete this custody photo?` | `The file is removed permanently and the chain-of-custody record will no longer show it. This cannot be undone.` | yes |
| `AdminUsersPage.jsx` deactivate | `Deactivate this account?` | `They will not be able to sign in. Reports they already filed are unaffected. You can reactivate the account later.` | yes |
| `AdminUsersPage.jsx` reactivate | `Reactivate this account?` | `They will be able to sign in again.` | no |
| `AdminUsersPage.jsx` role change | `Change this person's role?` | `Role decides what they can see and do across the whole system, including other people's reports and personal data.` | yes |
| `AdminCategoriesPage.jsx` retire | `Retire this category?` | `Residents will no longer be able to pick it. Reports already filed under it keep it and stay readable.` | yes |
| `AdminSpeciesPage.jsx` retire | `Retire this species?` | `It disappears from the wildlife form. Reports already filed against it keep it and stay readable.` | yes |

`AdminUsersPage.jsx` already has a **hand-rolled inline two-step confirm** for the email-verify action (`setConfirmId` plus inline Yes/Cancel buttons). **Replace it with the primitive** so the page has one pattern rather than two, and remove the now-unused state.

- [ ] **Step 3: The terminal status transitions**

In `StatusUpdateForm.jsx`, confirm before submitting when the target status is terminal:

```jsx
const TERMINAL = ['Resolved', 'Rejected', 'Completed', 'Released', 'Transferred', 'Deceased'];
```

```jsx
    if (TERMINAL.includes(status)) {
      // A terminal status stops the SLA clock, emails the resident, and is how
      // the office says it is finished with the report. It can be changed
      // afterwards, but the resident has already been told.
      const ok = await ask({
        title: `Mark this report as ${humanize(status)}?`,
        body: 'This closes the report, stops its deadline clock, and emails the resident to tell them. You can change the status afterwards, but they will already have been notified.',
        confirmLabel: `Mark ${humanize(status)}`,
        destructive: true,
      });
      if (!ok) return;
    }
```

Place it after `e.preventDefault()` and before `setSubmitting(true)`.

- [ ] **Step 4: The four resident submission confirms**

Approved scope includes every report submission. In each of `ComplaintFormPage.jsx`, `WildlifeFormPage.jsx`, `ServiceRequestFormPage.jsx` and `AnonymousReportPage.jsx`, add the confirm **after `validate()` passes** and before the `FormData` is built — so a resident is never asked to confirm a form that is about to be rejected anyway:

```jsx
    const ok = await ask({
      title: 'Send this report to CENRO?',
      body: 'CENRO will receive it straight away and you will be able to follow it in My Reports.',
      confirmLabel: 'Send report',
    });
    if (!ok) return;
```

**The anonymous path gets different copy, because it is the one choice here that genuinely cannot be reversed:**

```jsx
    const ok = await ask({
      title: anonymous ? 'Send this anonymously?' : 'Send this report to CENRO?',
      body: anonymous
        ? 'CENRO will not know who filed it, and that cannot be undone later even if you ask. It will not appear in My Reports and you will get no updates about it - save the reference number on the next screen.'
        : 'CENRO will receive it straight away and you will be able to follow it in My Reports.',
      confirmLabel: anonymous ? 'Send anonymously' : 'Send report',
      destructive: anonymous,
    });
    if (!ok) return;
```

On `AnonymousReportPage.jsx` (the public, no-account page) the anonymous wording applies unconditionally — there is no non-anonymous branch there.

- [ ] **Step 5: Verify**

Run: `cd web && npm run build` — clean.

For **every** file touched, list each capitalised JSX identifier rendered and confirm it is imported or locally defined. `ConfirmDialog` is newly rendered in all ten files; a missing import builds clean and throws at runtime.

Then grep your own work for the one mistake that makes this feature worthless:

```bash
cd web && grep -n "await ask(" -A 1 src/pages/resident/*.jsx src/pages/public/AnonymousReportPage.jsx src/pages/admin/*.jsx src/components/staff/*.jsx
```

Every `await ask(...)` must be followed by a guard that **returns** when the answer is false. An `await ask()` whose result is ignored is a dialog that asks and then does the thing anyway.

- [ ] **Step 6: Commit**

```bash
git status --short
git commit -m "Ask before an action that cannot be taken back" -- web/src/components/staff/detail.jsx web/src/components/staff/CustodyPhotos.jsx web/src/components/staff/StatusUpdateForm.jsx web/src/pages/admin/AdminUsersPage.jsx web/src/pages/admin/AdminCategoriesPage.jsx web/src/pages/admin/AdminSpeciesPage.jsx web/src/pages/resident/ComplaintFormPage.jsx web/src/pages/resident/WildlifeFormPage.jsx web/src/pages/resident/ServiceRequestFormPage.jsx web/src/pages/public/AnonymousReportPage.jsx
```

---

## Task 4: The mobile confirmation dialog, and its call sites

**Files:**
- Create: `mobile/src/components/ConfirmDialog.js`
- Modify: `mobile/src/screens/resident/ComplaintFormScreen.js`, `WildlifeFormScreen.js`, `RequestFormScreen.js`, `mobile/src/screens/AnonymousReportScreen.js`

**Interfaces:**
- Produces: `export default ConfirmDialog` and `export function useConfirm()` — the same `[props, ask]` contract as the web hook, so the two can be diffed.

- [ ] **Step 1: Build the primitive**

Create `mobile/src/components/ConfirmDialog.js`. Model the chrome on `mobile/src/components/DatePicker.js`, which already uses `Modal` with a backdrop — **read it first** and match its `backdrop`/`card` styles so this looks like the rest of the app:

```jsx
import { useCallback, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// A confirmation step for an action that cannot be taken back.
//
// Written as a Modal rather than using Alert.alert for three reasons: it looks
// like the rest of the app (the six existing sheets all use Modal), Alert's
// button order and styling differ between platforms, and Modal is part of
// react-native core - so this ships over the air with no change to the EAS
// fingerprint, where a native dialog package would force a new build.
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal transparent visible={!!open} animationType="fade" onRequestClose={() => !busy && onCancel?.()}>
      {/* Tapping the backdrop cancels, matching DatePicker. The destructive
          action still needs its own button press. */}
      <Pressable style={styles.backdrop} onPress={() => !busy && onCancel?.()}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
          <View style={styles.row}>
            <Pressable style={styles.cancel} onPress={() => !busy && onCancel?.()} accessibilityRole="button">
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.confirm, destructive && styles.confirmDanger]}
              onPress={() => !busy && onConfirm?.()}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator size="small" color={colors.white} style={{ marginRight: 8 }} /> : null}
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Same contract as web/src/components/ui/confirm-dialog.jsx's useConfirm, so a
// call site reads identically on both platforms and the two can be diffed.
export function useConfirm() {
  const [state, setState] = useState({ open: false, opts: {} });
  const resolveRef = useRef(null);

  const ask = useCallback((opts) => {
    setState({ open: true, opts });
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value) => {
    setState({ open: false, opts: {} });
    const r = resolveRef.current;
    resolveRef.current = null;
    if (r) r(value);
  }, []);

  return [
    { ...state.opts, open: state.open, onConfirm: () => settle(true), onCancel: () => settle(false) },
    ask,
  ];
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  cancel: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '700', color: colors.text },
  confirm: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDanger: { backgroundColor: colors.danger },
  confirmText: { fontSize: 14, fontWeight: '700', color: colors.white },
});
```

**Check `mobile/src/theme.js` actually exports `colors.danger`, `colors.white`, `colors.muted`, `colors.border`, `colors.text`, `colors.primary` and `radius.lg`/`radius.md`** before relying on them; report any that are missing and what you used instead.

- [ ] **Step 2: Wire the four screens**

Same shape as the web forms — after `validate()` passes, before the `FormData` is built. Taglish copy, because these are resident screens and Task 6 sets that policy:

```jsx
      const ok = await ask({
        title: 'Ipadala na sa CENRO?',
        body: 'Matatanggap agad ito ng CENRO, at pwede mo itong sundan sa My Reports.',
        confirmLabel: 'Ipadala',
        cancelLabel: 'Hindi pa',
      });
      if (!ok) return;
```

`AnonymousReportScreen.js` uses the irreversible wording instead, in English — that screen is deliberately English-only:

```jsx
      const ok = await ask({
        title: 'Send this anonymously?',
        body: 'CENRO will not know who filed it, and that cannot be undone later even if you ask. It will not appear in My Reports and you will get no updates - save the reference number on the next screen.',
        confirmLabel: 'Send anonymously',
        destructive: true,
      });
      if (!ok) return;
```

Render `<ConfirmDialog {...confirmProps} />` in each screen's tree.

- [ ] **Step 3: Verify**

Run: `cd mobile && npx expo export --platform android` — clean; report the module count (it should rise by one for the new component).
Run: `cd mobile && npm test` — unchanged.

For each screen, confirm every JSX tag is imported, every `styles.*` key exists, and — the mistake that makes the feature worthless — every `await ask(...)` is followed by a guard that returns on false.

**Do NOT publish an OTA.**

- [ ] **Step 4: Commit**

```bash
git status --short
git add mobile/src/components/ConfirmDialog.js
git commit -m "Ask before sending a report from the phone" -- mobile/src/components/ConfirmDialog.js mobile/src/screens/resident/ComplaintFormScreen.js mobile/src/screens/resident/WildlifeFormScreen.js mobile/src/screens/resident/RequestFormScreen.js mobile/src/screens/AnonymousReportScreen.js
```

---

## Task 5: Proof before a ticket closes — backend

**Files:**
- Modify: `backend/prisma/schema.prisma` (`Complaint`, `EnvironmentalRequest`)
- Create: `backend/prisma/migrations/<timestamp>_closure_proof/migration.sql`
- Modify: `backend/src/routes/staff.routes.js` (multer on two status routes)
- Modify: `backend/src/controllers/staff.complaint.controller.js`, `staff.request.controller.js`
- Modify: `backend/src/services/staff.complaint.service.js`, `staff.request.service.js`, `staff.wildlife.service.js`
- Test: `backend/tests/closureProof.test.js` (new)

**Interfaces:**
- Produces: `Complaint.resolution_proof_path`, `EnvironmentalRequest.completion_proof_path`; all three status services refuse a successful closure without proof.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/closureProof.test.js`:

```js
// Closing a ticket requires evidence that the work happened.
//
// WHICH transitions: the SUCCESSFUL closures only - complaint Resolved, request
// Completed, wildlife Released or Transferred. `Rejected` and `Deceased` are
// deliberately EXEMPT: there is often nothing to photograph, and requiring it
// would leave staff holding a report they cannot close at all.
//
// Wildlife has no proof column. It reuses chain_of_custody_photos, which
// already exists and already has its own upload endpoint - so its gate reads
// STORED ROW STATE rather than the request body, which is why the check lives
// in the service and not in a validator.

jest.mock('../src/utils/prisma', () => ({
  complaint: { findFirst: jest.fn(), update: jest.fn() },
  environmentalRequest: { findFirst: jest.fn(), update: jest.fn() },
  wildlifeTurnover: { findFirst: jest.fn(), update: jest.fn() },
  complaintStatusHistory: { create: jest.fn() },
  requestStatusHistory: { create: jest.fn() },
  wildlifeStatusHistory: { create: jest.fn() },
  systemSetting: { findMany: jest.fn(async () => []) },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({
  notifyStatusChange: jest.fn(),
  notifyReportSubmitted: jest.fn(),
}));

const prisma = require('../src/utils/prisma');

beforeEach(() => jest.clearAllMocks());

describe('a complaint cannot be Resolved without proof', () => {
  const svc = require('../src/services/staff.complaint.service');

  beforeEach(() => {
    prisma.complaint.findFirst.mockResolvedValue({
      complaint_id: 1, tracking_id: 'CMP-2026-00001', status: 'In_Progress',
      archived_at: null, resolved_at: null, sla_deadline: null,
      resolution_proof_path: null,
    });
    prisma.complaint.update.mockImplementation(({ data }) => Promise.resolve({ complaint_id: 1, ...data }));
  });

  test('REFUSED with no proof', async () => {
    await expect(svc.updateComplaintStatus(9, '1', { status: 'Resolved' }, {}))
      .rejects.toMatchObject({ statusCode: 422, message: expect.stringMatching(/proof|photo|evidence/i) });
    expect(prisma.complaint.update).not.toHaveBeenCalled();
  });

  test('accepted when a proof path is supplied with the transition', async () => {
    const out = await svc.updateComplaintStatus(9, '1', { status: 'Resolved', resolution_proof_path: '/uploads/proof/a.jpg' }, {});
    expect(out.status).toBe('Resolved');
  });

  test('accepted when the row ALREADY carries proof from an earlier upload', async () => {
    // Staff may upload the photo, then change the status in a second request.
    prisma.complaint.findFirst.mockResolvedValueOnce({
      complaint_id: 1, tracking_id: 'CMP-2026-00001', status: 'In_Progress',
      archived_at: null, resolved_at: null, sla_deadline: null,
      resolution_proof_path: '/uploads/proof/earlier.jpg',
    });
    const out = await svc.updateComplaintStatus(9, '1', { status: 'Resolved' }, {});
    expect(out.status).toBe('Resolved');
  });

  test('REJECTED IS EXEMPT - the opposite polarity, so the rule cannot be written as "any terminal status"', async () => {
    const out = await svc.updateComplaintStatus(9, '1', { status: 'Rejected' }, {});
    expect(out.status).toBe('Rejected');
  });

  test('a non-terminal transition is unaffected', async () => {
    const out = await svc.updateComplaintStatus(9, '1', { status: 'In_Progress' }, {});
    expect(out.status).toBe('In_Progress');
  });
});

describe('a request cannot be Completed without proof', () => {
  const svc = require('../src/services/staff.request.service');

  beforeEach(() => {
    prisma.environmentalRequest.findFirst.mockResolvedValue({
      request_id: 1, tracking_id: 'REQ-2026-00001', status: 'Scheduled',
      archived_at: null, sla_deadline: null, completion_date: null,
      approved_by_cenro_head: true, completion_proof_path: null,
    });
    prisma.environmentalRequest.update.mockImplementation(({ data }) => Promise.resolve({ request_id: 1, ...data }));
  });

  test('REFUSED with no proof', async () => {
    await expect(svc.updateRequestStatus(9, '1', { status: 'Completed' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(prisma.environmentalRequest.update).not.toHaveBeenCalled();
  });

  test('accepted with proof', async () => {
    const out = await svc.updateRequestStatus(9, '1', { status: 'Completed', completion_proof_path: '/uploads/proof/b.jpg' }, {});
    expect(out.status).toBe('Completed');
  });

  test('Rejected is exempt', async () => {
    const out = await svc.updateRequestStatus(9, '1', { status: 'Rejected' }, {});
    expect(out.status).toBe('Rejected');
  });
});

describe('a wildlife turnover cannot be Released without a custody photo', () => {
  const svc = require('../src/services/staff.wildlife.service');

  const row = (over = {}) => ({
    turnover_id: 1, reference_id: 'WLD-2026-00001', status: 'Under_Care',
    archived_at: null, is_endangered: false, sla_deadline: null,
    chain_of_custody_photos: [], ...over,
  });

  beforeEach(() => {
    prisma.wildlifeTurnover.update.mockImplementation(({ data }) => Promise.resolve({ turnover_id: 1, ...data }));
  });

  test('REFUSED with an empty custody array - the gate reads STORED state, not the body', async () => {
    prisma.wildlifeTurnover.findFirst.mockResolvedValue(row());
    await expect(svc.updateTurnoverStatus(9, '1', { status: 'Released' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('accepted with one custody photo', async () => {
    prisma.wildlifeTurnover.findFirst.mockResolvedValue(row({ chain_of_custody_photos: ['/uploads/custody/a.jpg'] }));
    const out = await svc.updateTurnoverStatus(9, '1', { status: 'Released' }, {});
    expect(out.status).toBe('Released');
  });

  test('Transferred needs one too', async () => {
    prisma.wildlifeTurnover.findFirst.mockResolvedValue(row());
    await expect(svc.updateTurnoverStatus(9, '1', { status: 'Transferred' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('DECEASED IS EXEMPT - there may be nothing to photograph, and the report must still close', async () => {
    prisma.wildlifeTurnover.findFirst.mockResolvedValue(row());
    const out = await svc.updateTurnoverStatus(9, '1', { status: 'Deceased' }, {});
    expect(out.status).toBe('Deceased');
  });

  test('a null custody column is treated as empty, not as a crash', async () => {
    // The column is Json? and is null on every row filed before custody photos
    // existed. Array.isArray(null) is false, so the count must come from a
    // guarded read.
    prisma.wildlifeTurnover.findFirst.mockResolvedValue(row({ chain_of_custody_photos: null }));
    await expect(svc.updateTurnoverStatus(9, '1', { status: 'Released' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});
```

> **The three service function names and their `findFirst` selects are what this test depends on.** Read each service first and correct the test's fixture shape to match the real `select` — a fixture carrying fields the service never selects is a test simulating data production never produces. Report any correction you make.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/closureProof.test.js`
Expected: FAIL — every "REFUSED" case currently succeeds.

- [ ] **Step 3: Add the columns**

In `backend/prisma/schema.prisma`, inside `model Complaint`, after `resolution_notes`:

```prisma
  // Evidence that the work actually happened, required before the report can be
  // Resolved (staff.complaint.service). Rejected is exempt - see that guard.
  resolution_proof_path String? @db.VarChar(500)
```

Inside `model EnvironmentalRequest`, after `staff_notes`:

```prisma
  // Evidence the service was delivered, required before Completed.
  completion_proof_path String? @db.VarChar(500)
```

Wildlife gets **no column** — it reuses `chain_of_custody_photos`.

- [ ] **Step 4: Generate, fix the casing, apply**

Stop the dev server. Then:

```bash
cd backend && npx prisma migrate dev --name closure_proof --create-only
```

Read the generated SQL. **Prisma has emitted lowercase table names five times out of five on this machine.** It must read:

```sql
ALTER TABLE `Complaint` ADD COLUMN `resolution_proof_path` VARCHAR(500) NULL;
ALTER TABLE `EnvironmentalRequest` ADD COLUMN `completion_proof_path` VARCHAR(500) NULL;
```

Then `npx prisma migrate dev`. **If offered a database reset, the answer is no.**

- [ ] **Step 5: Enforce it in the three services**

Each service already loads the row before updating. Add the guard after that load and **before** the update, reading the row plus the incoming value.

`staff.complaint.service.js`, inside `updateComplaintStatus`:

```js
  // Proof is required to RESOLVE, not to reject. A complaint staff decided
  // against has often nothing to photograph, and a report that cannot be closed
  // at all is worse than one closed without a picture.
  if (newStatus === 'Resolved') {
    const proof = input.resolution_proof_path || existing.resolution_proof_path;
    if (!proof) {
      throw new HttpError(422, 'Attach a photo showing the work was done before marking this complaint Resolved.');
    }
  }
```

`staff.request.service.js`, inside `updateRequestStatus`:

```js
  if (newStatus === 'Completed') {
    const proof = input.completion_proof_path || existing.completion_proof_path;
    if (!proof) {
      throw new HttpError(422, 'Attach a photo showing the service was delivered before marking this request Completed.');
    }
  }
```

`staff.wildlife.service.js`, inside `updateTurnoverStatus`:

```js
  // Wildlife has no proof column of its own: the chain-of-custody photos ARE
  // the evidence, and they already have their own upload endpoint. So this gate
  // counts STORED photos rather than reading the request body. Array.isArray
  // guards the null the column holds on every row filed before custody photos
  // existed.
  if (newStatus === 'Released' || newStatus === 'Transferred') {
    const photos = Array.isArray(existing.chain_of_custody_photos) ? existing.chain_of_custody_photos : [];
    if (photos.length === 0) {
      throw new HttpError(422, `Upload at least one chain-of-custody photo before marking this turnover ${newStatus}.`);
    }
  }
```

**Each service's `existing` select must include the field the guard reads.** Add `resolution_proof_path`, `completion_proof_path` and `chain_of_custody_photos` to the respective selects — a guard reading a field the select omits sees `undefined` and refuses every closure forever.

Persist the new paths too, in the same `data` object as the other status fields, following each file's existing `...(input.x !== undefined ? { x: ... } : {})` idiom.

- [ ] **Step 6: Accept the file on the two status routes**

In `backend/src/routes/staff.routes.js`, add a proof uploader beside the existing ones and put multer **before** the validators, matching the walk-in route:

```js
const proofUpload = diskUpload('proof');
```
```js
router.patch('/complaints/:id/status', proofUpload.single('proof'), v.complaintStatusRules, validate, complaints.updateStatus);
router.patch('/requests/:id/status', proofUpload.single('proof'), v.requestStatusRules, validate, requests.updateStatus);
```

Leave the wildlife status route as JSON — wildlife's evidence arrives through its existing custody-photo endpoint.

In each of the two controllers, save the file and pass the path:

```js
const proofPath = req.file ? await storage.save('proof', req.file) : null;
const complaint = await service.updateComplaintStatus(req.user.user_id, req.params.id, {
  ...req.body,
  ...(proofPath ? { resolution_proof_path: proofPath } : {}),
}, { ipAddress: req.ip });
```

(and `completion_proof_path` in the request controller).

Add the two fields to `staff.validators.js`'s status rules as optional strings capped at 500, so a hand-written JSON caller cannot post a path of unbounded length.

- [ ] **Step 7: Verify and commit**

Run: `cd backend && npx jest tests/closureProof.test.js` — all pass.
Run: `cd backend && npm test` — all green, `migrationCasing` included.

```bash
git status --short
git add backend/prisma/migrations backend/tests/closureProof.test.js
git commit -m "Require proof of work before a ticket can be closed" -- backend/prisma/schema.prisma backend/prisma/migrations backend/src/routes/staff.routes.js backend/src/controllers/staff.complaint.controller.js backend/src/controllers/staff.request.controller.js backend/src/services/staff.complaint.service.js backend/src/services/staff.request.service.js backend/src/services/staff.wildlife.service.js backend/src/validators/staff.validators.js backend/tests/closureProof.test.js
```

---

## Task 6: Proof before closing — the staff form

**Files:**
- Modify: `web/src/components/staff/StatusUpdateForm.jsx` (file field type + `required`)
- Modify: `web/src/pages/staff/ComplaintDetailPage.jsx`, `RequestDetailPage.jsx` (declare the field)
- Modify: `web/src/pages/staff/WildlifeDetailPage.jsx` (point staff at the custody uploader)
- Modify: `web/src/lib/api.js` (the two status calls must send `FormData`)

**Interfaces:**
- Consumes: the API from Task 5.

> **Must not ship before Task 5 is deployed.** A form that posts a file to a route without multer has it silently dropped, and the closure is then refused for a photo the staff member can see they attached.

- [ ] **Step 1: Let `StatusUpdateForm` carry a file**

Add a `file` branch to the `extraFields` renderer, and honour `required`:

```jsx
          ) : f.type === 'file' ? (
            <input
              id={f.name}
              type="file"
              accept="image/*"
              onChange={(e) => setExtra((x) => ({ ...x, [f.name]: e.target.files?.[0] || null }))}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
          ) : (
```

Disable the submit button while a visible required extra is unsatisfied, rather than letting the server refuse it:

```jsx
  // A required extra field blocks submission here as well as in the API, so a
  // staff member is told before they wait for a round trip.
  const missingRequired = visibleExtras.some((f) => f.required && !extra[f.name]);
```
```jsx
      <Button type="submit" loading={submitting} disabled={missingRequired}>Save update</Button>
```

And when any extra is a `File`, submit as `FormData`:

```jsx
    const hasFile = visibleExtras.some((f) => f.type === 'file' && extra[f.name]);
    let payload;
    if (hasFile) {
      payload = new FormData();
      payload.append('status', status);
      if (note.trim()) payload.append('note', note.trim());
      for (const f of visibleExtras) {
        const v = extra[f.name];
        if (!v) continue;
        // The file rides under the name the route's multer expects, not the
        // field's own name - the server turns it into a path.
        payload.append(f.type === 'file' ? 'proof' : f.name, v);
      }
    } else {
      payload = { status };
      if (note.trim()) payload.note = note.trim();
      for (const f of visibleExtras) if (extra[f.name]) payload[f.name] = extra[f.name];
    }
```

- [ ] **Step 2: Make the two status API calls accept `FormData`**

In `web/src/lib/api.js`, `staffResource`'s `updateStatus` currently sends JSON. `apiFetch` already handles a `FormData` body (the report forms use it), so the change is to stop forcing a JSON content type when the body is `FormData`. **Read the helper first** and make the minimal change; report what it was.

- [ ] **Step 3: Declare the field on the two detail pages**

`ComplaintDetailPage.jsx`:

```jsx
                { name: 'resolution_proof', label: 'Proof of work', type: 'file', required: true, visibleFor: ['Resolved'], hint: 'A photo showing the work was done. Required before this complaint can be Resolved.' },
```

`RequestDetailPage.jsx`:

```jsx
                { name: 'completion_proof', label: 'Proof of delivery', type: 'file', required: true, visibleFor: ['Completed'], hint: 'A photo showing the service was delivered. Required before this request can be Completed.' },
```

`visibleFor` means the field — and the block on submitting — appear only for that one target status, so `Rejected` stays closable with no photo.

- [ ] **Step 4: Point wildlife staff at the right place**

`WildlifeDetailPage.jsx` has no file field: wildlife evidence is the chain-of-custody photos, which have their own uploader on the same page. Add a note to its `StatusUpdateForm` so a staff member is not left guessing when the API refuses:

```jsx
              extraFields={[
                { name: 'transfer_destination', label: 'Transfer destination', type: 'text', visibleFor: ['Transferred'], hint: 'Where the animal was taken.' },
              ]}
```

and above the form:

```jsx
            <p className="mb-3 text-xs text-muted-foreground">
              Releasing or transferring this animal needs at least one chain-of-custody
              photo. Add one in the Chain of custody section below before changing the status.
            </p>
```

**Check the existing `extraFields` on that page first and preserve whatever is already there** — the `transfer_destination` entry above is illustrative, not necessarily what is in the file.

- [ ] **Step 5: Verify and commit**

Run: `cd web && npm run build` — clean. Then the JSX identifier check on every touched file.

```bash
git status --short
git commit -m "Take the closing photo on the status form" -- web/src/components/staff/StatusUpdateForm.jsx web/src/lib/api.js web/src/pages/staff/ComplaintDetailPage.jsx web/src/pages/staff/RequestDetailPage.jsx web/src/pages/staff/WildlifeDetailPage.jsx
```

---

## Task 7: Resident language and species findability (Spec C)

**Files:**
- Modify: `web/src/lib/tagalog.js`, `mobile/src/lib/tagalog.js`
- Modify: `web/src/pages/resident/WildlifeFormPage.jsx` (local-name search)
- Modify: `mobile/src/screens/resident/WildlifeFormScreen.js` (same)
- Create: `backend/prisma/migrations/<timestamp>_species_local_names/migration.sql`
- Modify: `backend/prisma/seed.js` (the same local names, for fresh dev databases)

**Interfaces:**
- Consumes: the species catalogue (`local_name` already exists end to end).

- [ ] **Step 1: Fill in the missing local names**

Five of the ten curated species have a `local_name`; the rest do not, and the five backfill placeholders have none either. **Ship them as a migration, not a seed edit** — `DEPLOYMENT.md` forbids seeding Railway, and the 2026-10-06 outage was caused by treating catalogue content as seed data.

First, list what is actually missing:

```bash
cd backend && node -e "const s=require('./prisma/seed.js');" 2>/dev/null; grep -n "name: '" -A 2 prisma/seed.js | grep -B1 -A1 "local_name" | head -40
```

Then write a migration that sets a local name **only where one is absent**, so an Admin's own edit is never overwritten:

```sql
UPDATE `Species` SET `local_name` = 'kalaw'       WHERE `name` = 'Rufous Hornbill'            AND `local_name` IS NULL;
UPDATE `Species` SET `local_name` = 'kuwago'      WHERE `name` = 'Philippine Eagle-Owl'       AND `local_name` IS NULL;
UPDATE `Species` SET `local_name` = 'tiktik'      WHERE `name` = 'Black-crowned Night Heron'  AND `local_name` IS NULL;
UPDATE `Species` SET `local_name` = 'bibe'        WHERE `name` = 'Philippine Duck'            AND `local_name` IS NULL;
UPDATE `Species` SET `local_name` = 'kabag'       WHERE `name` = 'Common Water Monitor'       AND `local_name` IS NULL;
```

**These names are illustrative.** Use the actual species rows present in `prisma/seed.js` and the live catalogue, and pick the local name a Cabuyao resident would actually use. Where you are not confident of the Tagalog name for a species, **leave it NULL and say so in your report** — a wrong local name is worse than none, because a resident searching for it finds the wrong animal. The Admin species screen exists for filling these in deliberately.

Add the same values to `prisma/seed.js` so a fresh dev database matches production.

- [ ] **Step 2: Make the local name FINDABLE, not just displayed**

Today `local_name` is shown only after a species is selected, so a resident who knows only "sawa" cannot find Reticulated Python. Add a filter input above the grouped picker on `web/src/pages/resident/WildlifeFormPage.jsx`:

```jsx
  const [speciesQuery, setSpeciesQuery] = useState('');
```
```jsx
  // Matches the local name as well as the English and scientific names, because
  // "sawa" is what a resident will type for a Reticulated Python. Without this
  // the local name is decoration: visible once you have already found the row.
  const matches = (s) => {
    const q = speciesQuery.trim().toLowerCase();
    if (!q) return true;
    return [s.name, s.scientific_name, s.local_name]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(q));
  };
```

Filter both groups through it, and render the input with a hint naming the behaviour:

```jsx
      <FormField id="species_filter" label="Find a species" hint={`Type an English or local name, e.g. "sawa". / ${FORM_TL.species_filter}`}>
        <Input
          id="species_filter"
          placeholder='e.g. python, sawa, Varanus'
          value={speciesQuery}
          onChange={(e) => setSpeciesQuery(e.target.value)}
        />
      </FormField>
```

**If filtering empties both groups, say so** rather than rendering an empty picker:

```jsx
      {speciesQuery.trim() && !common.filter(matches).length && !endangered.filter(matches).length && (
        <p className="text-xs text-muted-foreground">
          No species matches &ldquo;{speciesQuery.trim()}&rdquo;. Clear the box, or choose
          &ldquo;Other&rdquo; and describe the animal.
        </p>
      )}
```

Apply the equivalent on `mobile/src/screens/resident/WildlifeFormScreen.js`, using a `TextField` above the `Select` and filtering the same way.

- [ ] **Step 3: Taglish on the resident surfaces**

Both `tagalog.js` files move from English-primary + Tagalog-secondary to **a single casual Taglish line** on resident instructional copy, per the approved decision. Keep the register the files already document: everyday conversational Tagalog, loanwords where they are genuinely the everyday word (`status`, `report`, `litrato`, `landmark`), and none of the formal register (`isinasagawa`, `nakatakda`, `kahilingan`, `upang`).

**The header comments in both files state the superseded policy** — *"English stays the primary label"*, *"the Tagalog sits beside or beneath it"*. Rewrite them, do not just extend them.

**One deliberate exception, and it is not optional:** `STAGE_TL` and `TIMELINE_TL` keep their English companion. Those keys are status values that come from the Prisma enums and are translated **nowhere else** — a staff member's screen, the status email and the printed PDF all say `Resolved`. A resident who only ever sees "Naayos na" loses the shared vocabulary the moment they phone the office. Instructional copy goes Taglish-only; the status badge stays bilingual.

Add `species_filter` to `FORM_TL` in both files (Step 2 interpolates it on web).

Where a resident-facing page currently renders `` `English / ${FORM_TL.x}` ``, it becomes just `FORM_TL.x`. Work through the resident pages and screens and report which files you changed.

- [ ] **Step 4: Verify and commit**

Run: `cd backend && npm test` — green, `migrationCasing` included.
Run: `cd web && npm run build` — clean, then the JSX identifier check.
Run: `cd mobile && npx expo export --platform android` — clean.

```bash
git status --short
git add backend/prisma/migrations
git commit -m "Let a resident find a species by its local name, in Taglish" -- backend/prisma/migrations backend/prisma/seed.js web/src/lib/tagalog.js mobile/src/lib/tagalog.js web/src/pages/resident/WildlifeFormPage.jsx mobile/src/screens/resident/WildlifeFormScreen.js
```

---

## Deploy order

```
1.  Task 1        API + both clients   date bounds (API first within the same deploy)
2.  Task 5        API                  proof columns + multipart   (nothing posts a file yet; inert)
3.  Tasks 2,3,6   web                  dialog, call sites, proof form
4.  Tasks 4,7     MOBILE OTA + web     confirmations, Taglish, findability
5.  Docs sweep    (fold into Task 7's commit or a follow-up)
```

**Task 5's API must precede Task 6's form.** A file posted to a route without multer is silently discarded, and the closure is then refused for a photo the staff member can see they attached — a failure with no visible cause.

**Mobile cannot close synchronously.** An OTA lands at each phone's next launch, so between steps 3 and 4 installed builds keep their old behaviour, which is the safe direction.

## Done when

1. `cd backend && npm test` — green, including `notPastDates` and `closureProof`.
2. `cd web && npm run build` — clean, and the JSX identifier check passes on every touched page.
3. `cd mobile && npx expo export --platform android && npm test` — clean.
4. Every `await ask(...)` in both clients is followed by a guard that returns on false. A dialog that asks and then proceeds regardless is worse than no dialog.
5. On the **deployed** site with the accounts in memory: a request cannot be booked for yesterday; cancelling an archive confirmation leaves the report in the queue; a complaint cannot be Resolved without a photo but can be Rejected without one; typing "sawa" finds Reticulated Python.
