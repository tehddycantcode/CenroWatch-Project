# Resident usability, location flexibility, and action guard rails — design

**Date:** 2026-10-09
**Status:** Approved in conversation; implementation sequenced AFTER the six remaining
Plan A tasks (14, 16, 17, 18, 19, 20) of
`docs/superpowers/plans/2026-09-30-wildlife-species-catalogue.md`.

## 1. Scope

Seven items were requested, for web and mobile both, with the standing instruction:
*"if specific function is already exist just ignore the task."* Archaeology (§2) found two
already built and one that **reverses a decision taken 2026-09-29**. The seven collapse into
three specs (§4–§6), grouped by what the code actually shares rather than by how they were
listed.

| # | Requested | Verdict |
|---|---|---|
| 1 | Option to skip GPS/map; textfield for address/landmark | **Reversal** + web has the field on NO form |
| 2 | Pin + landmark on service request | **Nothing exists** — needs a migration |
| 3 | Date picker: past dates not clickable | **Missing where it matters** |
| 4 | Confirmation pop-up for important actions | **Nothing exists** on either platform |
| 5 | Commonly known species term ("sawa") | **ALREADY BUILT** — three small gaps |
| 6 | Casual Taglish in resident UI | **Foundation exists** — coverage gaps |
| 7 | Upload proof before closing a ticket | **Nothing exists**; web-only (no staff mobile) |

## 2. What already exists

Recorded with evidence, because two items are largely done and acting as though they were
not would mean rebuilding working code.

### 2.1 Item 5 is built, including the exact example requested

`Species.local_name` (`schema.prisma:262`, `VarChar(200)`, comment `// e.g. "musang"`) is in
`species.service.js` `PUBLIC_FIELDS` (`:34`), validated (`species.validators.js:23`), and
handled on both create (`:241`) and update (`:301`). `seed.js:128` carries
`local_name: 'sawa'` for Reticulated Python — the requester's own example — plus `musang`,
`bayawak`, `ulupong`, `pagong`. `WildlifeFormPage.jsx:182` renders
`Also called "{local_name}"`. The `20261006142635_hotfix_species_catalogue_content`
migration ships these to production.

**Three genuine gaps, all small:**

- Only 5 of the 10 real seeded species have a local name; the birds have none.
- The local name is rendered only AFTER a species is selected, so it is **not findable** —
  a resident who knows only "sawa" cannot locate Reticulated Python in the picker.
- Mobile has no species picker at all yet (Plan A tasks 17–19, unbuilt).

### 2.2 Item 6 has a documented foundation

`web/src/lib/tagalog.js` and `mobile/src/lib/tagalog.js` both exist, exporting `STAGE_TL`,
`TIMELINE_TL`, `KIND_TL`, `ACTION_TL`, `STAT_TL`, `FORM_TL`, `COPY_TL`. The web file's header
already specifies the register this request asks for: *"everyday conversational Tagalog, the
way a Cabuyao resident would actually say it - NOT the formal register of a government
memo"*, and names the words deliberately avoided (`isinasagawa`, `nakatakda`, `maglakip`,
`kahilingan`, `upang`, `kabuuang`). It also states two scope rules that item 6 changes:
English stays the primary label, and staff/admin surfaces stay English.

### 2.3 Item 1 reverses a deliberate, test-pinned decision

Coordinates became **required** on resident complaints and wildlife turnovers on 2026-09-29.
`complaint.validators.js:34-43` gives the reasoning: *"A complaint with no place attached is
the least actionable thing CENRO can receive - staff cannot inspect what they cannot find."*
It also records why `notEmpty` rather than `exists` (multipart sends an unpinned map as an
empty STRING) and that the staff walk-in route was deliberately exempted.
`backend/tests/locationRequired.test.js` pins all of it across four `describe` blocks,
including `'the staff walk-in form is deliberately exempt'`.

`address_details` already exists on `Complaint` and `WildlifeTurnover` (`VarChar(2000)`,
encrypted at rest via `prismaEncryption.js:55`), is accepted by both create validators
(`optional`, max 255), and is persisted by both services. But:

- **No web resident form renders it.** Web references are display-only, on the two staff
  detail pages.
- **Mobile renders it on the complaint form only** (`ComplaintFormScreen.js:164`,
  *"Optional: landmark or street"*). Wildlife and request screens have no such field.

### 2.4 Item 3 is already correct for backward-looking dates, missing for forward-looking

`observed_at` is a date in the PAST, and both clients already block the future:
`ComplaintFormPage.jsx:184` (`max={todayStr()}`) and `ComplaintFormScreen.js:179`
(`max={todayISO()}`), matching the API's `observed_at` rule.

`preferred_schedule` is the forward-looking one and is unbounded:

- `ServiceRequestFormPage.jsx:152` — no `min`.
- `RequestFormScreen.js:156-158` — carries an explicit comment,
  *"No min or max: the API accepts any valid date here and the web form is unrestricted
  too, so a mobile-only rule would be an inconsistency someone hits later."*
- Staff `scheduled_date` (`RequestDetailPage.jsx:91`) is a generic `type: 'date'` extra
  field, and `StatusUpdateForm` has no mechanism to pass a bound at all.
- The API has **no** rule rejecting a past `preferred_schedule`, so any client-only fix is
  bypassable.

### 2.5 Item 4 has no primitive on either platform

`web/src/components/ui/` has no `dialog`/`modal`/`alert-dialog` — confirmed by listing it.
Mobile has **zero** `Alert.alert` calls. One hand-rolled inline two-step confirm exists at
`AdminUsersPage.jsx:217-225` (`setConfirmId` then inline Yes/Cancel), which is the only
precedent. Mobile does have six Modal-based components to copy an idiom from:
`BarangayPicker`, `DatePicker`, `HeaderMenu`, `PushPermissionPrompt`, `ReportSheet`,
`Select`.

Notable gap: `CustodyPhotos.jsx:64` deletes a chain-of-custody evidence photo on a single
click with no confirmation.

### 2.6 Item 7 has nothing, and mobile cannot host it

`PATCH /staff/:kind/:id/status` is JSON — `staff.routes.js` applies no multer to the three
status routes, while the two intake routes do use `diskUpload` (`custody`, `complaints`).
`StatusUpdateForm.jsx` renders only `textarea` or `<Input type=...>`, has no file branch, and
enforces no required extra field: `if (extra[f.name]) payload[f.name] = ...` silently omits
anything blank.

**Mobile is resident-only.** `mobile/src/screens/` contains no staff directory and no staff
screens, so "apply both web and app" cannot apply to item 7.

Useful existing asset: `WildlifeTurnover.chain_of_custody_photos` (`Json?`) plus
`POST /staff/wildlife/:id/custody-photos` (`custodyUpload.array('photos', 10)`) and the
`CustodyPhotos.jsx` component. Wildlife proof-of-handling therefore already exists as a
mechanism; it is simply not required before closing.

## 3. Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Location requirement | **Pin OR landmark text — at least one** | Satisfies the GPS opt-out while preserving the 2026-09-29 goal. Enforced in the API, not only the forms. |
| Walk-in form | **Same rule applies** | A counter clerk can almost always type a street or landmark, so the original exemption stops being necessary. Makes every intake path uniform. |
| Confirmation scope | **Destructive/irreversible + every report submission** | See §5.2 for the enumerated call sites. |
| Proof on close | **Successful closures only** | `Resolved`, `Completed`, `Released`, `Transferred`. `Rejected` and `Deceased` exempt — often nothing to photograph, and requiring it would strand a report staff cannot close. |
| Taglish | **Taglish only on resident screens** | One casual Taglish line replaces the English+Tagalog pair. Taglish embeds English loanwords, so operative terms survive. |
| Taglish exception | **Status badges stay bilingual** | Status values come from the Prisma enums and are NOT translated anywhere else — staff screens, status emails and the PDF all say `Resolved`. A resident who sees only "Naayos na" loses the shared vocabulary the moment they phone CENRO. Instructional copy goes Taglish-only; the status badge keeps both. |
| Sequencing | **Plan A tasks 14/16/17/18/19/20 first** | Item 5's findability work and item 6's mobile wildlife copy both live in the mobile species picker, which those tasks build. |

## 4. Spec A — Location (items 1 + 2)

One concern across three report kinds.

### 4.1 The rule

At least one of (a) a `latitude`+`longitude` pair, or (b) a non-empty `address_details`.
Neither field is individually required; the pair still has to be complete and in range when
present.

Implemented as a custom express-validator check rather than per-field `notEmpty`, because the
condition spans fields. `latitude`/`longitude` revert to `optional({ values: 'falsy' })` with
their range checks intact, `address_details` keeps its `optional` + length cap, and a new
`.custom()` asserts the disjunction and attaches its message to a synthetic `location` key so
both clients can surface it on the existing `fieldErrors.location` slot.

Applies to: `createComplaintRules`, `createWildlifeRules`, the anonymous complaint route, the
new request rules, and — per §3 — `createWalkInComplaintRules`.

### 4.2 Migration

`EnvironmentalRequest` gains `latitude Float?`, `longitude Float?`,
`address_details String? @db.VarChar(2000)`. Additive and nullable, so existing rows are
untouched. `address_details` is added to `ENCRYPTED_FIELDS` in `prismaEncryption.js`, matching
the other two models — note this means it can never be used in a `where`/`orderBy`/`groupBy`
(the extension throws), which is correct: it is write + detail-view + PDF only.

**Table casing must be checked before applying** (PascalCase `EnvironmentalRequest`, not
lowercase) — four for four prior migrations were emitted wrong on this machine. Generate with
`--create-only`. `migrationCasing.test.js` is the backstop.

### 4.3 Clients

- Web: a landmark textfield on `ComplaintFormPage`, `WildlifeFormPage`,
  `ServiceRequestFormPage`, `AnonymousReportPage`, and `LogWalkInPage`.
- Mobile: the same on `WildlifeFormScreen`, `RequestFormScreen`, `AnonymousReportScreen`;
  `ComplaintFormScreen` already has it and needs only its copy updated.
- `LocationField` (both platforms) `required` prop semantics change from "a pin is required"
  to "a location is required, one way or the other"; its empty-state copy and its
  geolocation-failure copy (*"or submit without it"*) both need rewriting.
- Service request gains `LocationField` on both platforms, and the staff
  `RequestDetailPage` gains the `LocationBlock` map the other two detail pages already use.

### 4.4 Validate() changes

Six client-side guards currently hard-require coordinates and must become the disjunction:
`AnonymousReportPage.jsx:71`, `ComplaintFormPage.jsx:52`, `WildlifeFormPage.jsx:71`,
`AnonymousReportScreen.js:70`, `ComplaintFormScreen.js:60`, `WildlifeFormScreen.js:61`.

## 5. Spec B — Guard rails (items 3 + 4 + 7)

These three arrived as unrelated requests and converge on one component.
`StatusUpdateForm.jsx` needs a date bound (item 3's `scheduled_date`), a confirmation on
terminal transitions (item 4), and a file input with required-before-close enforcement
(item 7). Changing it three times in three plans would be worse than once.

### 5.1 Date bounds (item 3)

- `ServiceRequestFormPage.jsx:152` gains `min={todayStr()}`.
- `RequestFormScreen.js` DatePicker gains `min={todayISO()}`; the comment at `:156-158`
  asserting the web form is unrestricted becomes false and must be rewritten. `DatePicker`
  already supports `min` and `isOutOfRange` already disables cells — no component change.
- `StatusUpdateForm` gains `min` support in `extraFields`, and `RequestDetailPage.jsx:91`
  passes today for `scheduled_date`.
- **Backend rule added** for `preferred_schedule` and `scheduled_date`, because a
  client-only bound is bypassable. A past date is rejected with 422.

Explicitly NOT changed: `observed_at` on either platform, and the admin dashboard's
`from`/`to` analytics range (`AdminDashboardPage.jsx:173-178`) — both are backward-looking by
design and already bounded correctly.

### 5.2 Confirmation dialogs (item 4)

New primitives: `web/src/components/ui/confirm-dialog.jsx` and
`mobile/src/components/ConfirmDialog.js`. Mobile uses the `Modal` idiom of the six existing
components rather than `Alert.alert`, so it matches the app's visual language and can carry
the Taglish copy; `Modal` is part of react-native core, so this stays OTA-shippable with no
EAS fingerprint change.

Call sites, per the approved scope:

*Irreversible / destructive:*

- Archive and restore a report (`ArchiveControl`, `detail.jsx:147`)
- Deactivate/reactivate a user (`AdminUsersPage.jsx:233`)
- Change a user's role (`AdminUsersPage`, inline role edit)
- Delete a chain-of-custody photo (`CustodyPhotos.jsx:64`)
- Move a report to a terminal status (`StatusUpdateForm`) — `Resolved`, `Rejected`,
  `Completed`, `Released`, `Transferred`, `Deceased`
- Submit a complaint anonymously — the one choice the system cannot reverse, and the copy
  already promises it is permanent
- Retire an admin-managed category

*Report submission (per the approved scope):* all four resident forms on both platforms —
complaint, wildlife, service request, anonymous.

The existing hand-rolled confirm at `AdminUsersPage.jsx:217-225` is replaced by the
primitive so there is one pattern, not two.

### 5.3 Proof before closing (item 7)

Web + backend only; mobile has no staff UI (§2.6).

- `Complaint` gains `resolution_proof_path String? @db.VarChar(500)`.
- `EnvironmentalRequest` gains `completion_proof_path String? @db.VarChar(500)`.
- Wildlife adds **no column**: it requires at least one existing
  `chain_of_custody_photos` entry before `Released`/`Transferred`.
- The two status routes that now accept a file become multipart via `diskUpload('proof')`,
  with multer placed BEFORE the validators so multipart text fields populate `req.body` —
  the ordering `staff.routes.js` already uses for the walk-in route.
- Enforcement is in the **service**, not only the validator, because the wildlife rule reads
  existing row state (how many custody photos it has) rather than request body.
- `StatusUpdateForm` gains a `file` field type and honours a `required` flag on an extra
  field, disabling submit until it is satisfied rather than silently dropping it.

Proof files are served through the same signed-URL path as every other upload, so the
renderer must wrap the stored path in `fileUrl()` — a signed path is authorised, not
absolute, and a bare relative path 404s on pages.dev.

## 6. Spec C — Resident language and species findability (items 5 + 6)

Depends on Plan A tasks 14 and 17–19.

### 6.1 Species findability (item 5's three gaps)

- Local names for the five species that lack one, shipped as a **migration**, not a seed
  edit — `DEPLOYMENT.md` forbids seeding Railway, and the 2026-10-06 outage was caused by
  treating catalogue content as seed data. The seed is updated too, for fresh dev databases.
- The picker matches on `local_name` as well as `name` and `scientific_name`, so typing
  "sawa" finds Reticulated Python. On web this means the option label or a filter input; on
  mobile it lands inside the Plan A task 17/18 picker.
- The admin species screen (Plan A task 14) already plans a `local_name` input, so staff can
  maintain these without a migration thereafter.

### 6.2 Taglish (item 6)

Both `tagalog.js` files move from English-primary + Tagalog-secondary to a single casual
Taglish line on resident surfaces, keeping the existing register rules. The header comments in
both files state the superseded policy (*"English stays the primary label"*, *"the Tagalog
sits beside or beneath it"*) and must be rewritten, not just extended.

`STAGE_TL` and `TIMELINE_TL` keep their English companion per §3's stated exception.

Coverage gaps to fill: the wildlife form's species identification card, safety/handling copy,
the service request form, the tracker's detail rows, and the confirmation dialogs added in
Spec B.

## 7. Policy-reversal sweep

A grep for the *claim*, not the symbol — the lesson recorded in `CLAUDE.md` is that reversing
a decision falsifies prose in files the change never otherwise touches.

Copy and comments that become false under Spec A:

- `ComplaintFormPage.jsx:190`, `WildlifeFormPage.jsx:264`, `AnonymousReportPage.jsx:200`
  — *"Required: pin where it happened/was found"*
- `ComplaintFormScreen.js:185`, `WildlifeFormScreen.js:182`, `AnonymousReportScreen.js:216`
  — same strings
- `FORM_TL.location` in BOTH `tagalog.js` files — *"Kailangan. Ituro sa mapa..."*
- `LocationField.jsx:56` and `LocationField.js` empty-state and error copy
- `MapPicker.js:189` — *"Tap the map to pin the location"*
- `complaint.validators.js:34-43` and `wildlife.validators.js:43-46` — the rationale blocks
- `detail.jsx:49` — *"requests never have coordinates, so only complaint/wildlife pages use
  this"*
- `backend/tests/locationRequired.test.js` — the whole suite inverts, including the
  `'the staff walk-in form is deliberately exempt'` block, which §3 also reverses

**Already-stale copy this sweep should correct:** `ReportsMap.jsx:123` reads *"location is
optional when filing"* — false since 2026-09-29 and missed then. Spec A makes the first half
true again, but its second half (*"service requests are barangay-level and are not mapped"*)
becomes false and needs rewriting.

Comments that become false under Spec B: `RequestFormScreen.js:156-158` (the "no min or max"
rationale).

`docs/PRD-resident.md` and `docs/PRD-staff-admin.md` need the location rule, the request
coordinates, the proof-of-closure requirement, and the Taglish policy. Dated specs under
`docs/superpowers/specs/` are left alone with a "Superseded" note rather than rewritten.

## 8. Deploy order

```
1.  Plan A tasks 14, 16, 17, 18, 19, 20          (prerequisite)
2.  Spec A  API  — migration + the disjunction rule   (clients still send a pin; inert)
3.  Spec A  web  — landmark fields + validate()
4.  Spec A  MOBILE OTA
5.  Spec B  API  — proof columns + date rule + multipart
6.  Spec B  web  — ConfirmDialog, proof upload, date bounds
7.  Spec B  MOBILE OTA — ConfirmDialog + submission confirms + date min
8.  Spec C  API  — local-name migration
9.  Spec C  web + MOBILE OTA — Taglish, findability
10. Docs sweep
```

**Non-negotiable ordering:** the API's relaxed location rule ships BEFORE the clients that
rely on it, because a client posting only a landmark against the old API gets a 422 on a
field the form says is optional. Relaxing a rule is safe in the other direction — an old
client that still sends a pin keeps working, which is what makes steps 2–4 safe to stagger.
Spec B's API likewise precedes its clients: a form that uploads proof to a route without
multer silently drops the file.

Mobile cannot close synchronously — an OTA lands on each phone at its next launch, so every
mobile step has a window where installed builds run the previous copy.

## 9. Test plan

Per item, the case that would catch a regression:

- **Location:** accepted with a pin and no address; accepted with an address and no pin;
  **rejected with neither**; still rejected for out-of-range coordinates; accepted for a
  walk-in with an address only. The existing suite's assertions invert, so the file is
  rewritten rather than extended — and it needs a both-present case so the disjunction is
  not satisfiable by accident.
- **Request coordinates:** a request round-trips lat/lng/address; `address_details`
  encrypts and decrypts; a `where` on it throws (proving the extension covers it).
- **Date bounds:** yesterday rejected with 422 for `preferred_schedule` and
  `scheduled_date`; today accepted; `observed_at` still accepts past dates and still
  rejects future ones — the inverse case, so the two rules cannot be conflated.
- **Proof:** `Resolved` without proof rejected; with proof accepted; `Rejected` accepted
  **without** proof (the exemption, asserted explicitly so a future "require it everywhere"
  edit fails a test); wildlife `Released` rejected with zero custody photos and accepted
  with one.
- **Confirmation:** web has no test runner, so these are Playwright — cancel leaves state
  unchanged, confirm performs the action. The cancel case is the one that matters.
- **Species findability:** searching "sawa" returns Reticulated Python; searching a name
  with no local name still works.
- **Taglish:** a `statusPartitions`-style completeness check that every status value has a
  `STAGE_TL`/`TIMELINE_TL` entry, so a new status cannot ship untranslated.

Deployed verification uses the accounts in memory, on `cenrowatch-project.pages.dev` — not
localhost.

## 10. Open questions

1. Should `preferred_schedule` have a **minimum lead time** (e.g. 3 working days) rather
   than merely "not in the past"? CENRO cannot usually service a request booked for today.
   Treated as "not in the past" until told otherwise.
2. Is there a maximum horizon for `preferred_schedule`? Unbounded today; a date in 2041 is
   currently accepted.
3. Does proof-of-closure need a **minimum** (one file) or should multiple be allowed?
   Assumed one required, following the walk-in photo pattern; wildlife already allows ten.
4. Who may **delete** a proof file once uploaded? Assumed nobody — it is the evidence the
   closure rests on. Admin archive remains the escape hatch.
