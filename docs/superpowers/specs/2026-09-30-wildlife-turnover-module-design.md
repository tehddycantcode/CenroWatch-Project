# Wildlife Turnover module — species catalogue, safety handling, and the Citizens Charter flow

**Date:** 2026-09-30
**Status:** Design approved, not implemented
**Scope:** backend (Prisma/Express), web (React+Vite), mobile (Expo React Native)
**Supersedes nothing.** This is the first design pass over the wildlife module since Sprint 0.

---

## 1. Intent

Make wildlife reporting **easier for residents**, **safer for the animal**, and **closer to the
Citizens Charter process CENRO actually follows**.

Seven requested changes:

| # | Item |
|---|---|
| 1 | Species module: biome, indicator, body description, sample pictures |
| 2 | Category auto-assigned from the species (only 3, exclusive) |
| 3 | Species picker split into Common vs Endangered |
| 4 | Turnover method: CENRO pick-up or walk-in (**4a** resident choice, **4b** staff-side intake) |
| 5 | Animal safety handling guidance |
| 6 | Submission requirements checklist + cage disclaimer |
| 7 | Statuses and updates aligned to the Citizens Charter agency actions |

**Success criteria.** A resident who has never seen the animal before can match it to a species from
pictures and a body description; they cannot pick a wrong category because they no longer pick one;
they are told how to keep themselves and the animal safe *before* they submit; they can see where
their report sits in CENRO's actual process; and staff can process an in-person turnover without
pretending it was a pick-up.

**Non-goal.** This design does not change the public GIS map's obfuscation *rule* (±0.001°). It
changes **who decides** that a report is subject to it — see §4.3.

---

## 2. What already exists (read this before estimating)

Archaeology done 2026-09-30. Several items are much smaller than they look, and one is much larger.

### 2.1 There is no `Species` table

`WildlifeTurnover.species_name` is a free-text `VarChar(200)` and `species_category` a free-text
`VarChar(100)`. The species list lives in **two hand-synchronised client files**:

- `web/src/lib/species.js` — 10 species, rich: `scientific`, `status`, `photo`, `credit`, `blurb`,
  `note`. **Read only by the public education page** `web/src/pages/public/WildlifePage.jsx`.
- `mobile/src/lib/reports.js:21` (`WILDLIFE_SPECIES`) — the same 10 species, bare: `value`, `label`,
  `group`. This is the list the **form** uses.

So the richest species content in the codebase is invisible on the form where it would help most.
Items 1–3 are all one change: make species a row.

### 2.2 The three categories already exist, as `group`

**Bird / Mammal / Reptile.** Both client lists carry it. But the auto-fill is client-side and merely
advisory — `web/src/pages/resident/WildlifeFormPage.jsx:143` still renders an **editable free-text
`Input`** for Category, and both clients only fill it when blank (`f.species_category || sp.group`).
A resident can type anything. Item 2 is about moving that decision server-side.

### 2.3 `is_endangered` is self-declared, and it is a privacy control

The form shows a checkbox reading *"I believe this is an endangered or protected species (flags it
for priority review)."* That single resident-supplied boolean drives **three** things:

1. `is_priority_review` — `backend/src/services/wildlife.service.js`
2. the initial status, `Priority_Review` instead of `Pending_Review`
3. **public-map coordinate obfuscation** — `backend/src/services/gis.service.js:55`

Item 3 changes who makes that call, so it changes a privacy control. Treat it accordingly.

### 2.4 Nine Citizens Charter columns exist and are completely dead

Present in `schema.prisma` on `WildlifeTurnover`, under the comment
`// Citizens Charter workflow / SLA tracking (Part 20.3)`:

`reported_via`, `wildlife_info_form_filled`, `vet_clearance_secured`, `vet_clearance_date`,
`rescue_date`, `transport_date`, `rescue_report_prepared`, `rescue_report_date`,
`assigned_staff_role`

**Verified 2026-09-30: nothing in `backend/src`, `web/src` or `mobile/src` reads or writes any of
them.** They arrived with the Sprint 0 scaffold (`0161964`), so whoever wrote it had the charter in
hand and the implementation never followed. The `WildlifeReportedVia` and `CenroPersonRole` enums are
likewise unused.

**Consequence: item 7 is mostly wiring up columns that already exist.** Far less migration risk than
it appears.

### 2.5 There is no transition guard on wildlife status

`wildlifeStatusRules` (`backend/src/validators/staff.validators.js:73`) only checks
`isIn(WILDLIFE_STATUSES)`, and `updateTurnoverStatus` does not compare old to new. **Any status can
jump to any other**, including `Released` → `Pending_Review`. Item 7 adds the guard that was never
there.

Note also: the header comment on `staff.wildlife.service.js` claims *"Wildlife has no status-history
table, so transitions are recorded via AuditLog."* **That is stale** — `WildlifeStatusHistory` exists
and is written at `staff.wildlife.service.js:154`. Fix the comment while in the file.

### 2.6 Wildlife walk-in does not exist at all

`POST /staff/complaints` and `web/src/pages/staff/LogWalkInPage.jsx` are **complaint-only**. There is
no staff-side wildlife intake route, page, validator or service function. Item 5 is **new
construction**, not an improvement, and it is the largest single piece of work here.

### 2.7 Other facts that constrain the work

- **Photo is optional** on wildlife (`wildlife.routes.js`: *"Photo is an optional multipart field"*),
  unlike complaints where it is required.
- **`latitude`/`longitude` are required** since 2026-09-29.
- Mobile `Select` (`mobile/src/components/Select.js`) is a flat `FlatList` of `{value,label}` with
  **no group support**. Item 3 needs a component change there. Web's `Select` takes `<option>`
  children, so `<optgroup>` works natively.
- Both `ReportFormShell`s already gate submit with `disabled={unverified}` — web
  `ReportFormShell.jsx:113`, mobile `ReportFormShell.js:134`. Item 6 extends that, it does not
  invent a mechanism.
- Encrypted field names live in **one** set: `ENCRYPTED_FIELDS` in
  `backend/src/utils/prismaEncryption.js:52` — `contact_number`, `reporter_name`,
  `reporter_contact`, `address_details`. Matching is **by field name at any depth**, so adding
  `reporter_name` to a second model needs no change here. Confirm this when implementing §8.
- SLA is `wildlife_sla_minutes = 3218` working minutes (~6.7 working days), clock starting **at
  submission** — deliberately, because *"an animal's welfare clock starts when someone reports
  it"* (`wildlife.service.js`). There is no `Approved` gate in `WildlifeStatus` and there should not
  be one.
- `category.service.js` is the established precedent for admin-managed reference data: one
  table-driven service, name-as-FK rather than surrogate id, retire (`is_active = false`) never
  delete, FK `ON DELETE RESTRICT`. **The species catalogue follows it.**

---

## 3. Decisions made

Confirmed with the requester on 2026-09-30.

| Decision | Choice | Reason |
|---|---|---|
| Citizens Charter source | **Reconstruct from the nine dead columns**, mark every step and duration `REQUIRES VERIFICATION` | The charter text is not in the repo. Column names came from it at Sprint 0, so they are the best available evidence. |
| Uncatalogued species ("Other") | **Endangered until staff confirm** — obfuscate, `Priority_Review` | An unlisted animal might be endangered. Guessing wrong the other way publishes a poaching target. |
| Sample pictures | **Admin uploads them** through the existing signed-upload pipeline | No licensing decision baked into code; CENRO adds species without a redeploy; mobile can reach them (it cannot reach `web/public`). |
| Photo on submit | **Required, with a stated escape** (`photo_waiver_reason`) | The checklist must mean something, but requiring a photograph of a cobra is the wrong instruction. |
| `SpeciesCategory` | **Enum of 3**, breaking the ComplaintType precedent | "Exclusive" is the point of item 2, and only an enum lets the database enforce it. Cost: Amphibian/Fish would need a migration. Accepted knowingly. |
| Status flow | **Add exactly one status (`Verified`)**, wire the nine milestone columns | A status missing from the OPEN/TERMINAL arrays vanishes silently from every SLA figure, and those arrays live in five files. |
| Existing reports' endangered flag | **Left untouched** | Deriving retroactively would overwrite a human judgement made at intake and could *un-obfuscate* a location someone deliberately flagged. |
| Conservation indicator vs hazard | **Two separate fields** | A Reticulated Python is `Native` but dangerous; a Philippine Duck is `Vulnerable` but harmless. `web/src/lib/species.js` conflates them (`status: 'Caution: Venomous'`), and item 5 needs hazard independently. |
| Biome cardinality | **One primary biome per species** | A join table is more accurate (a water monitor is freshwater *and* urban) but nothing filters by biome yet. YAGNI; upgrade path noted in §4.1. |

---

## 4. Data model

All schema changes in one place, because the seven items share them.

> **Every migration in this project must be generated with `--create-only` and have its table names
> corrected to PascalCase before applying.** `prisma migrate dev` reads names back from Windows MySQL
> (case-insensitive) and emits `` ALTER TABLE `wildlifeturnover` ``, which **hard-fails on the Linux
> container**. This has gone wrong **four times for four attempts** on this setup — assume the next
> one is wrong too. `backend/tests/migrationCasing.test.js` fails the suite if it is.

### 4.1 New enums

```prisma
enum SpeciesCategory {
  Bird
  Mammal
  Reptile
}

// Primary habitat, as an identification aid ("where you would expect to find it").
// One value per species: several of these animals use more than one habitat, so if
// filtering by biome is ever required this becomes a join table.
enum SpeciesBiome {
  Forest
  Freshwater
  Lakeshore_Wetland
  Agricultural
  Urban
  Cave
}

// Conservation standing. Descriptive only - it does NOT decide obfuscation.
// See Species.is_endangered for why that is a separate, explicit field.
enum SpeciesIndicator {
  Common
  Native
  Endemic
  Near_Threatened
  Vulnerable
  Endangered
  Critically_Endangered
}

// Physical risk to the person handling or approaching the animal. Separate from
// SpeciesIndicator on purpose: conservation standing and danger are unrelated.
enum SpeciesHazard {
  None
  Venomous
  Aggressive
  Disease_Risk
  Powerful_Bite_Or_Talons
}

// How the animal reaches CENRO. NOT the same axis as WildlifeReportedVia, which is
// how CENRO heard about the report - someone can phone a report in and then walk
// the animal in. Conflating them would be a silent data bug.
enum WildlifeTurnoverMethod {
  CENRO_Pickup
  Walk_In
}
```

### 4.2 New `Species` model

```prisma
model Species {
  species_id       Int              @id @default(autoincrement())
  // The FK target. Reports store the NAME, not a surrogate id - the same call
  // made for ComplaintType/RequestType, and for the same reason: the name is
  // what every groupBy, PDF row, badge and humanize() call already reads.
  name             String           @unique @db.VarChar(200)
  scientific_name  String?          @db.VarChar(200)
  local_name       String?          @db.VarChar(200)   // e.g. "musang"
  // NULLABLE, all three. The catalogue holds one sentinel row, `Other`, which
  // has no taxonomy at all - see "The Other row" below. Real species always
  // carry these, enforced by the validator rather than by the column.
  category         SpeciesCategory?
  biome            SpeciesBiome?
  indicator        SpeciesIndicator?
  hazard           SpeciesHazard    @default(None)
  // EXPLICIT, not derived from `indicator`. DENR/legal protected status does not
  // map cleanly onto IUCN categories, and this boolean drives public-map
  // obfuscation - a privacy control should be set deliberately, never inferred
  // from a taxonomy label.
  is_endangered    Boolean          @default(false)
  body_description String?          @db.Text   // size, colour, markings, traits
  handling_note    String?          @db.Text   // species-specific safety guidance
  photo_path       String?          @db.VarChar(500)
  photo_credit     String?          @db.VarChar(255)
  is_active        Boolean          @default(true)
  sort_order       Int              @default(0)
  created_at       DateTime         @default(now())
  updated_at       DateTime         @updatedAt

  turnovers WildlifeTurnover[]

  @@index([category])
  @@index([is_endangered])
  @@index([is_active])
}
```

### 4.3 Changes to `WildlifeTurnover`

```prisma
  // --- item 1/2/3: species becomes a catalogue reference -------------------
  species_name     String  @db.VarChar(200)   // UNCHANGED type; FK added below
  species_category SpeciesCategory?           // WAS VarChar(100). Server-derived.
  // REQUIRED relation, exactly like Complaint.type - the scalar FK field is
  // required, so the relation must be too. Restrict, so a species with reports
  // against it cannot be deleted and make that history unreadable.
  species          Species @relation(fields: [species_name], references: [name], onUpdate: Cascade, onDelete: Restrict)

  // --- item 4: how the animal arrives -------------------------------------
  turnover_method  WildlifeTurnoverMethod?

  // --- item 5/6: safety + checklist ---------------------------------------
  safety_ack_at       DateTime?          // resident confirmed they read the guidance
  photo_waiver_reason String?  @db.VarChar(255)  // set only when no photo

  // --- item 5: staff-logged walk-in (mirrors Complaint) -------------------
  reported_by      Int?                  // WAS NOT NULL - see §8 for the risk
  logged_by        Int?
  reporter_name    String?  @db.VarChar(200)   // ENCRYPTED at rest
  reporter_contact String?  @db.VarChar(100)   // ENCRYPTED at rest
```

**`species_name` keeps its type and becomes an FK.** Existing free-text values must all exist as
`Species` rows before the constraint can be added — see §8.

**Do not drop `is_endangered` / `is_priority_review` from `WildlifeTurnover`.** They stay as the
*snapshot* of the decision made at intake. Deriving them live from `Species` would mean an admin
editing a species row silently rewrites the obfuscation of historical reports.

### 4.3a The `Other` row — how an uncatalogued species is stored

`species_name` is a required FK, so **a value the resident types cannot be stored in it** — that
would break the key and let residents invent catalogue entries. This project already solved exactly
this problem for complaint and request categories, and wildlife follows it rather than inventing a
second answer:

- The catalogue holds a **real seeded row named `Other`** with `category`, `biome` and `indicator`
  all `NULL`, `is_endangered = true` (the fail-safe decision in §3) and `hazard = None`.
- A resident choosing it stores `species_name = 'Other'`, and **the species they typed is folded into
  the description as its first line** — `Other: Sea turtle\n\n<description>` — so it is the first
  thing staff read. This mirrors `withOtherDetail()` in `mobile/src/lib/otherCategory.js` /
  `web/src/lib/otherCategory.js` exactly, including the combined-length guard against the
  5000-character description limit.
- Because the `Other` row has no `category`, the **resident picks one** (`Bird`/`Mammal`/`Reptile`)
  and it is stored on the report. That is the only case where a human picks a category.

**Consequence for the specify box:** detection keys off the literal seeded name `Other`, so an Admin
renaming that row breaks the specify box. `otherCategory.js` documents this coupling for complaints
and keeps the string in one place; the wildlife helper must do the same. **Do not make the `Other`
row editable or retirable** — guard it in `species.service.js`.

### 4.4 `WildlifeStatus` gains exactly one value

```prisma
enum WildlifeStatus {
  Pending_Review
  Priority_Review
  Verified          // NEW: information form filled + vet clearance secured
  Under_Care
  Released
  Transferred
  Deceased
}
```

---

## 5. Item-by-item plan

### Item 1 — Species module: biome, indicator, body description, sample pictures

**Backend**

- `backend/src/services/species.service.js` (**new**) — modelled on `category.service.js`:
  `listActive()` (public, zero personal data), `listAll()`, `create()`, `update()`, `retire()`.
  `AuditLog` on every mutation (`SPECIES_CREATE`, `SPECIES_UPDATE`, `SPECIES_RETIRE`).
- `backend/src/routes/species.routes.js` (**new**) — `GET /api/v1/species`, public, mirroring
  `category.routes.js`. Public because the education page is public and species data carries no
  personal data.
- `backend/src/routes/admin.routes.js` — `GET /admin/species`, `POST /admin/species`,
  `PATCH /admin/species/:id`, `POST /admin/species/:id/photo`.
- `backend/src/validators/species.validators.js` (**new**) — enum membership for `category`,
  `biome`, `indicator`, `hazard`; length caps; `name` uniqueness surfaced as 409 not 500.
- Photo upload: `diskUpload('species')` with `IMAGE_MIME`. Served through the **existing signed
  `/uploads` route** — no new access path. `storage.remove()` the old file when replaced.

**Web**

- `web/src/pages/admin/AdminSpeciesPage.jsx` (**new**) — table + create/edit form + photo upload,
  laid out like `AdminCategoriesPage.jsx`. Route under `<ProtectedRoute roles={['Admin']}>`.
- `web/src/lib/useSpecies.js` (**new**) — fetch hook mirroring `useCategories.js`.
- `web/src/lib/species.js` — **delete**. Its content migrates to seed data. `CONSERVATION_TONE`
  moves to a small presentational map keyed on `SpeciesIndicator` (7 values, not 6 strings).
- `web/src/pages/public/WildlifePage.jsx` — fetch instead of import. It currently derives photo
  credits from the array (`:14`); that becomes a field on the fetched rows. **Must keep working with
  zero photos**, as the file's own comment requires.
- Wildlife form gains, under the species picker: sample photo, body description, biome, indicator
  badge, scientific/local name.

**Mobile**

- `mobile/src/lib/useSpecies.js` (**new**) — parallel implementation, not a copy (mobile cannot
  import from `web/src`). Same `{value,label}` shaping convention as `useCategories.js`.
- `mobile/src/lib/reports.js` — remove `WILDLIFE_SPECIES`.
- Form shows the same identification block. Photo via `Image` with the signed URL.
- **Offline:** no offline write support exists anywhere in this app, and this design does not add
  any. The species list is fetched per launch like categories; a failed fetch must show a visible
  error, not an empty picker (`useCategories.js` documents exactly this).

**Seed** — `backend/prisma/seed.js` gains the 10 species from `web/src/lib/species.js`, mapped:
`scientific` → `scientific_name`, `group` → `category`, `blurb` → `body_description`,
`note` → `handling_note`, `status` → `indicator` **except** `'Caution: Venomous'` → Philippine Cobra
becomes `indicator: Native, hazard: Venomous`. Biome and `is_endangered` are new judgements — see
§10. Photos are **not** seeded (admin-uploaded per §3); `photo_credit` carries over for any that are.

**Plus the `Other` sentinel row** (§4.3a): `name: 'Other'`, `category`/`biome`/`indicator` all
`null`, `is_endangered: true`, `sort_order: 999` so it sorts last in both groups' wake.

**Existing reports** — untouched. `species_category` values that are already `Bird`/`Mammal`/
`Reptile` map straight onto the enum; anything else needs the §8 audit.

**Tests**
- `speciesModule.test.js`: create/update/retire writes audit rows; retire sets `is_active=false` and
  never deletes; duplicate `name` → 409; invalid enum → 422.
- `GET /species` returns zero personal data and only active rows.
- A species with `photo_path = null` serialises fine (the no-photo path must not throw).
- Photo replacement removes the previous file.

---

### Item 2 — Category auto-assigned from the species

**Backend**

- `wildlife.validators.js` — **remove the `species_category` body rule entirely.** The field is no
  longer accepted from clients. Add a comment saying so, or someone will restore it.
- `wildlife.service.js` `createTurnover()` — look the species up by name and copy `species_category`
  from the row. **Resolution rule, in order:** the row's `category` if it has one; otherwise the
  resident's 3-way pick; otherwise 422.
- `species_name` must name an **active** catalogue row, or 422 — the same `isSelectable` check
  `category.service.js` already provides for complaint types. A retired species stays valid on the
  reports that already reference it but must not be selectable on a new one. Free text never reaches
  this column; see §4.3a.

**Web / Mobile** — the Category input is **deleted**. In its place, a **read-only confirmation**:

> Category: **Reptile** — set automatically from the species you selected.

Read-only rather than hidden, so a resident can notice a wrong species pick; not editable, which is
the whole point of item 2. For "Other", a 3-way `Bird / Mammal / Reptile` picker — a resident who
saw the animal can answer that reliably, and it keeps the column populated for analytics.

**Existing reports** — free-text `species_category` values outside the three must be reconciled
before the column becomes an enum. §8.

**Tests**
- A client sending `species_category: 'Dinosaur'` has it **ignored**, and the stored value comes
  from the species row. (This is the assertion the item rests on.)
- Species with no catalogue match + no category pick → 422.
- Every seeded species resolves to exactly one of the three.

---

### Item 3 — Common vs Endangered selection

**Backend**

- `wildlife.service.js` — `is_endangered` is **derived from the `Species` row**, not read from the
  body. `wildlife.validators.js` drops the `is_endangered` rule.
- The `Other` row carries `is_endangered = true` (decision §3), so the ordinary derivation yields
  `is_priority_review = true` and status `Priority_Review` for an uncatalogued animal with **no
  special-casing anywhere** — the fail-safe is a property of one seeded row, not a branch.
  **No change to `gis.service.js`** — it reads the stored boolean and keeps doing so.
- Staff need a way to **downgrade** a wrongly-flagged "Other": add `is_endangered` to
  `wildlifeUpdateRules` and to `staff.wildlife.service.js` `update()`, with an audit action of its
  own (`WILDLIFE_ENDANGERED_OVERRIDE`) — changing a privacy control deserves its own trail, not a
  generic update row.

**Web** — one `<Select>`, two `<optgroup>`s: *Common species* / *Endangered or protected species*,
then *Other (specify)*. **Which group a species falls in is decided by `Species.is_endangered` — the
same column that drives obfuscation, so the grouping a resident sees and the privacy control applied
cannot disagree.** The endangered group carries a visible notice that the location will be obfuscated
on the public map and the report prioritised.

**Mobile** — `mobile/src/components/Select.js` **needs group support**. Minimal change: accept
options with `{ header: true, label }` entries and render them as non-pressable section rows inside
the existing `FlatList`. Keep `{value,label}` working unchanged — `Select` has three other call
sites.

**Existing reports** — self-declared flags **left as they are** (decision §3). Do **not** write a
backfill that re-derives them; it could un-obfuscate a location a resident deliberately flagged.

**Tests**
- A client sending `is_endangered: false` for a catalogued endangered species is **overridden to
  true** — the deanonymisation-equivalent assertion for this item.
- "Other" → `is_endangered = true`, status `Priority_Review`.
- `GET /gis/...` still obfuscates every endangered point and leaves common ones exact.
- A staff downgrade writes `WILDLIFE_ENDANGERED_OVERRIDE`.
- Mobile `Select` with header rows: headers are not selectable.

---

### Item 4a — Turnover method (resident choice)

**Backend** — `turnover_method` added to `createWildlifeRules` as a required enum member; persisted
by `createTurnover`. Surfaced in `DETAIL_SELECT`, `QUEUE_SELECT`, and the PDF
(`staff.report.service.js` `writeWildlifeReport` summary block).

**Web / Mobile** — a two-option choice on the form. Selecting **Walk-in** reveals the cage/container
notice (item 6) and the office address and hours; selecting **CENRO pick-up** reveals the
"keep the animal contained and wait" guidance. Default: **unselected**, so it is a real choice and a
checklist item rather than a silent default.

**Existing reports** — `turnover_method` is `NULL` for every existing row. Render as
*"Not recorded"*, consistent with how the PDF already handles unset fields. **Do not backfill a
guess.**

**Tests**
- Missing `turnover_method` → 422.
- Invalid value → 422.
- A pre-existing row with `NULL` still renders in queue, detail and PDF.

---

### Item 4b — Staff walk-in intake for wildlife (new construction)

Mirrors the complaint walk-in end to end.

**Backend**

- `POST /staff/wildlife` in `staff.routes.js`, multer first so multipart text fields populate
  `req.body` (the existing comment on the complaint route explains why).
- `createWalkInWildlifeRules` in `staff.validators.js`, modelled on `createWalkInComplaintRules`:
  `reporter_name`, `reporter_contact`, `reported_via` (`Walk_In | Phone_Call | Social_Media`),
  plus every field the resident route takes.
- `staff.wildlife.service.js` `createWalkIn()` — `reported_by = null`, `logged_by = staffId`,
  `turnover_method = 'Walk_In'`, `reported_via` from the body. Audit
  `WILDLIFE_WALKIN_CREATE`. **No resident receipt email** — there may be no account to email.
- `assigned_staff_role` set here (defaulting to `Wildlife_Enforcer_Officer`), finally giving the
  `CenroPersonRole` enum a reader.

**The hard part: `reported_by` becomes nullable.** Every place that assumes a resident exists must be
audited — `listMyTurnovers`, `getMyTurnoverByRef`, the `resident` relation in `QUEUE_SELECT` /
`DETAIL_SELECT`, `notifyStatusChange`, and `staff.report.service.js` `reporterBlock` (which already
handles `logged_by` and anonymous for complaints — reuse that shape). See §8.

**Web** — `LogWalkInPage.jsx` gains a wildlife mode, or a sibling page. **Recommendation: a sibling
`LogWalkInWildlifePage.jsx`.** The forms share little beyond reporter identity, and the existing page
is already the largest in the staff console; one page with a kind switch would be harder to read than
two focused ones.

**Mobile** — **no change.** The staff console is web-only; the mobile app has no staff surface. The
resident-side half of item 4a (choosing walk-in) is mobile's entire involvement here.

**Existing reports** — none have `logged_by`; `reporterBlock` already prints *"Not recorded"* for
missing reporter fields.

**Tests**
- `createWalkIn` stores `reported_by = null`, `logged_by = staffId`, and **no receipt email is
  sent**.
- A walk-in row appears in the staff queue and renders in the PDF with the reporter name from
  `reporter_name`, not from a `resident` relation.
- `GET /wildlife/mine` for any resident **never** returns a walk-in row.
- `reporter_name` / `reporter_contact` round-trip through the encryption extension (read back equal,
  stored bytes not equal to plaintext).
- A resident-filed row still behaves exactly as before (regression).

---

### Item 5 — Animal safety handling

**Content model.** Safety guidance is assembled from three layers, most specific last:

1. **Category-level** (`SpeciesCategory`) — "birds", "mammals", "reptiles".
2. **Hazard-level** (`SpeciesHazard`) — the "what NOT to do" and distance rules. This is where
   venomous/aggressive/disease-risk warnings live.
3. **Species-level** (`Species.handling_note`) — free text for the specific animal.

Layers 1 and 2 are **static copy shipped in both clients** (no DB round trip, so it renders even if
the species fetch is slow). Layer 3 comes from the species row. `FIELD_GUIDANCE` in
`web/src/lib/species.js` is the seed for layer 1 — it already exists and is already good.

**Backend** — none for display. `safety_ack_at` is written on submit (item 6).

**Web / Mobile** — a Safety block on the form that reacts to the selected species: hazard banner
(colour-coded, `Venomous` most prominent), then do/don't lists, then the species note. For "Other",
show the **most cautious** generic set — consistent with treating unknown species as endangered.

**Where the copy lives.** One shared module per client (`web/src/lib/wildlifeSafety.js`,
`mobile/src/lib/wildlifeSafety.js`) keyed on category + hazard, so the two apps can be diffed for
drift. Note in both headers that they are parallel implementations, following the convention
`useCategories.js` already sets.

> **Copy is a feature commitment.** CLAUDE.md records that a promise in user-facing copy must be
> backed by something that exists. Safety copy must not say CENRO will do something the system has
> no path for — do not write "CENRO will call you within the hour" unless that is true.

**Existing reports** — none. Display-only.

**Tests**
- Every `SpeciesCategory` × `SpeciesHazard` pair resolves to non-empty copy (a missing combination
  must fail the suite, not render a blank panel).
- `hazard: Venomous` produces a do-not-approach instruction.
- "Other"/unknown resolves to the most cautious set.

---

### Item 6 — Submission checklist and the cage disclaimer

**The checklist gates submit.** Items:

| Item | Satisfied by | Persisted as |
|---|---|---|
| Species identified | species picked (catalogue or Other) | `species_name` |
| Location confirmed | map pin | `latitude`/`longitude` (already required) |
| Photo attached **or** waiver reason given | photo or reason | `photo_path` / `photo_waiver_reason` |
| Turnover method selected | item 4 | `turnover_method` |
| Safety guidance read | explicit tick | `safety_ack_at` |
| Container/cage notice acknowledged — **walk-in only** | explicit tick | `safety_ack_at` — **one timestamp for both ticks** |

`safety_ack_at` is a **single timestamp meaning "the resident completed every acknowledgement their
chosen turnover method required"** — it deliberately does not distinguish the safety tick from the
cage tick. Two columns would let them disagree, and nothing downstream needs to tell them apart.

**Persistence principle: do not store a checkbox that duplicates a field you already have.** Four of
the six are evidenced by real data. Only two need storage:

- `safety_ack_at` — the one claim nothing else evidences, and worth keeping as a record.
- `photo_waiver_reason` — the server must see it, because it **relaxes a validation rule**.

**Backend**

- Photo becomes **required unless `photo_waiver_reason` is present** (decision §3). Implement as a
  custom validator in `createWildlifeRules`, and **also enforce it in the service**, because
  `POST /staff/wildlife` is a second caller.
  - Waiver reasons are a **closed list**, not free text: `Unsafe_To_Approach`,
    `Animal_Fled`, `No_Camera`. Free text here would become an un-auditable bypass of the photo rule.
- `safety_ack_at` required on the resident route. **Not** required on the staff walk-in route — a
  staff member logging an intake is not the person who needs the safety briefing.

**Web / Mobile** — checklist above the submit button; `disabled={unverified || !checklistComplete}`
on the existing shell prop. Each unmet item names what is missing rather than just greying out — a
disabled button with no explanation is the failure mode to avoid.

The **cage/container notice** appears only for walk-in, stating what a suitable container is, that
CENRO cannot accept an animal in an unsafe container, and that the resident should not transport a
venomous or aggressive animal at all (for those, force CENRO pick-up — a `Venomous` hazard should
**disable** the walk-in option, not merely warn).

**Existing reports** — `safety_ack_at` and `photo_waiver_reason` are `NULL`; photos may be absent.
**The new photo rule applies to new submissions only.** No backfill, and no report becomes invalid
retroactively.

**Tests**
- No photo and no waiver → 422.
- No photo **with** a valid waiver reason → 201.
- Invalid waiver reason → 422.
- Missing `safety_ack_at` on the resident route → 422; **absent** on the staff route → 201.
- A `Venomous` species cannot be submitted with `turnover_method = Walk_In`.
- A pre-existing photo-less row still renders and still exports to PDF.

---

### Item 7 — Citizens Charter process and updates

> **Every step, role and duration in this section is reconstructed from the nine dead column names
> and REQUIRES VERIFICATION against the actual CENRO Citizens Charter before implementation.**

**Reconstructed agency actions**

| # | Agency action (reconstructed) | Column(s) | Responsible role (reconstructed) |
|---|---|---|---|
| 1 | Receive report; fill the wildlife information form | `wildlife_info_form_filled`, `reported_via` | `Administrative_Staff` |
| 2 | Secure veterinary clearance | `vet_clearance_secured`, `vet_clearance_date` | `Environmental_Management_Specialist` |
| 3 | Conduct rescue / retrieval | `rescue_date` | `Wildlife_Enforcer_Officer` |
| 4 | Transport to holding facility | `transport_date` | `Wildlife_Enforcer_Officer` |
| 5 | Prepare the rescue report | `rescue_report_prepared`, `rescue_report_date` | `Technical_Enforcement_Division_Personnel` |

**Status flow** — one new status, `Verified`, placed between review and custody:

```
Pending_Review  ──▶ Priority_Review ──▶ Verified ──▶ Under_Care ──▶ Released
       │                  │                │             │        ├▶ Transferred
       │                  │                │             │        └▶ Deceased
       └──────────────────┴────────────────┴─────────────┴──▶ Deceased
```

Explicit transition map (the guard that §2.5 shows does not exist today):

| From | Allowed to |
|---|---|
| `Pending_Review` | `Priority_Review`, `Verified`, `Deceased` |
| `Priority_Review` | `Verified`, `Deceased` |
| `Verified` | `Under_Care`, `Transferred`, `Deceased` |
| `Under_Care` | `Released`, `Transferred`, `Deceased` |
| `Released` / `Transferred` / `Deceased` | *(terminal)* |

`Deceased` is reachable from everywhere: an animal reported dead
(`animal_condition: Dead`) or one that dies before rescue.

> **ADDING A STATUS TOUCHES FIVE FILES.** A status absent from the OPEN/TERMINAL arrays never matches
> the overdue query, so every report in that state **silently drops out of breach counts and SLA
> figures with no error**. `Verified` must be added to: `admin.analytics.service.js`,
> `staff.overview.service.js`, `staff.validators.js`, `web/src/lib/staff.js`, and
> `mobile/src/lib/reports.js` (`STAGE_REVIEW`). `backend/tests/statusPartitions.test.js` reads the
> enum from `schema.prisma` and fails if any value is unaccounted for — **let that test be the
> checklist.**

**Milestones, not more statuses.** The five agency actions are recorded as the existing date/boolean
columns, edited on the staff detail page, each writing a `WildlifeStatusHistory`-adjacent audit row.
This is what keeps the enum small while still making the charter visible.

**Resident-visible updates.** `DETAIL_SELECT` in `wildlife.service.js` gains the milestone
columns — they are **process facts, not staff identities**, so they are safe under the existing rule
that `status_history` omits `changed_by`. `TrackReportPage.jsx` and `TrackReportScreen.js` render a
charter progress list: each action, its date, and whether it is done. That is the actual deliverable
of item 7 for the person waiting.

**SLA and notifications**

- `wildlife_sla_minutes = 3218` stays a **single total from submission**. Per-step deadlines are
  deliberately **not** introduced — see §10, this is the top verification question.
- `notifyStatusChange` and `notifyReportStatus` need a `Verified` case. **Missing it means the new
  status emails nothing**, which reads as the system going quiet halfway through.
- Push notification copy must stay non-identifying (readable on a locked phone); tests assert that
  absence, so "make it more useful" correctly fails the suite.

**Existing reports** — all nine milestone columns are already `NULL`/`false` on every row, so they
render as "not recorded" with no backfill. **No existing report is in `Verified`**, so the transition
map must permit the states historical rows are actually in. Verify against real data before
enabling the guard: a row sitting in `Under_Care` must still be able to reach `Released`.

**Tests**
- Transition map: each allowed transition succeeds; a representative illegal one
  (`Released` → `Pending_Review`) → 422.
- `statusPartitions.test.js` passes — i.e. `Verified` is accounted for in every array.
- `Verified` appears in SLA/overdue counts (the silent-vanish regression).
- `Verified` produces a resident notification.
- Milestone updates write audit rows and appear in `DETAIL_SELECT`.
- Resident-visible payload for a milestone update contains **no staff identity**.
- A legacy row with all-NULL milestones renders in queue, detail, tracker and PDF.

---

## 6. Backend file inventory

| File | Change |
|---|---|
| `prisma/schema.prisma` | 5 new enums, `Species` model, `WildlifeTurnover` changes, `WildlifeStatus` + `Verified` |
| `prisma/migrations/…` | See §8. **`--create-only`, PascalCase, one concern per migration** |
| `prisma/seed.js` | 10 species + safety copy |
| `src/services/species.service.js` | **new** |
| `src/services/wildlife.service.js` | derive category + endangered; milestones in `DETAIL_SELECT` |
| `src/services/staff.wildlife.service.js` | `createWalkIn`, transition guard, milestone updates, endangered override; fix the stale header comment (§2.5) |
| `src/services/staff.report.service.js` | turnover method, milestones, walk-in reporter block |
| `src/services/gis.service.js` | **no change** (reads the stored boolean) |
| `src/controllers/species.controller.js` | **new** |
| `src/controllers/staff.wildlife.controller.js` | walk-in + milestone handlers |
| `src/routes/species.routes.js` | **new**, public |
| `src/routes/index.js` | mount `/species` |
| `src/routes/admin.routes.js` | species CRUD + photo |
| `src/routes/staff.routes.js` | `POST /staff/wildlife`, milestone PATCH |
| `src/validators/wildlife.validators.js` | drop `species_category` + `is_endangered`; add method, ack, waiver |
| `src/validators/staff.validators.js` | walk-in rules, transition-aware status rules, milestone rules |
| `src/validators/species.validators.js` | **new** |
| `src/services/admin.analytics.service.js` | `Verified` in the status arrays |
| `src/services/staff.overview.service.js` | `Verified` in the status arrays |
| `src/utils/notify.js` | `Verified` case |
| `src/utils/prismaEncryption.js` | verify `reporter_name`/`reporter_contact` need no change (§2.7) |

## 7. Client file inventory

**Web** — `pages/admin/AdminSpeciesPage.jsx` *(new)*, `lib/useSpecies.js` *(new)*,
`lib/wildlifeSafety.js` *(new)*, `lib/species.js` *(delete)*,
`pages/resident/WildlifeFormPage.jsx`, `pages/public/WildlifePage.jsx`,
`pages/staff/LogWalkInWildlifePage.jsx` *(new)*, `pages/staff/WildlifeDetailPage.jsx`,
`pages/staff/WildlifeQueuePage.jsx`, `pages/resident/TrackReportPage.jsx`, `lib/staff.js`,
`App.jsx`, `components/admin/AdminLayout.jsx` *(nav entry)*.

**Mobile** — `lib/useSpecies.js` *(new)*, `lib/wildlifeSafety.js` *(new)*, `lib/reports.js`
*(remove `WILDLIFE_SPECIES`, add `Verified` to `STAGE_REVIEW`)*,
`screens/resident/WildlifeFormScreen.js`, `screens/resident/TrackReportScreen.js`,
`components/Select.js` *(group support)*, `api/client.js` *(`species()`)*.

> **Mobile ships JS-only, so this is an OTA update.** Run
> `eas fingerprint:compare --build-id <id>` **before** `eas update` — CRLF silently turns a
> successful publish into one that reaches nobody, with no error. Check bytes with
> `tr -cd '\r' | wc -c`, not grep.

---

## 8. Migration strategy and existing data

Seven migrations, in this order. Every one `--create-only` with PascalCase table names verified.

1. **`species_catalogue`** — new enums + `Species` table. Purely additive, deployable alone.
2. **Seed the catalogue** — `prisma/seed.js`, idempotent upsert by `name`. Must run before 3.
3. **`wildlife_species_fk`** — add the FK on `species_name`. **This is the gate:**
   - Audit first: `SELECT DISTINCT species_name FROM WildlifeTurnover` and compare with the
     catalogue. Any value with no row **blocks the FK**.
   - Resolution: add the missing name as an **inactive** `Species` row
     (`is_active = false`) — preserving history without offering it on new forms. Do **not** edit
     historical `species_name` values. This is what lets the relation be **required** (§4.3): once
     every historical value has a row, no report is left pointing at nothing.
   - Run this audit on **all three databases** — native 3306, Docker 3307, Railway. They hold
     different data, and the Docker database has previously been found missing rows entirely.
4. **`wildlife_species_category_enum`** — `species_category` `VarChar(100)` → `SpeciesCategory?`.
   - Audit `SELECT DISTINCT species_category` first. Values outside `Bird`/`Mammal`/`Reptile`
     (including free text a resident typed into the old editable input) must be mapped by hand or
     set `NULL`. **`NULL` is acceptable**; a wrong enum value is not.
5. **`wildlife_turnover_method_and_checklist`** — `turnover_method`, `safety_ack_at`,
   `photo_waiver_reason`. Additive, all nullable.
6. **`wildlife_walkin_intake`** — `reported_by` → nullable, add `logged_by`, `reporter_name`,
   `reporter_contact`. **The riskiest migration here.** Relaxing `NOT NULL` is safe for existing
   rows, but every reader that assumes a resident must be audited *before* this lands (item 4b).
7. **`wildlife_status_verified`** — add `Verified`. Ship **with** the five array updates in the same
   deploy, or SLA figures go wrong silently.

**Impact summary on existing reports**

| Concern | Effect |
|---|---|
| `species_name` | Unchanged. Unknown values become inactive catalogue rows. |
| `species_category` | Normalised to enum or `NULL`. Free-text values need a mapping pass. |
| `is_endangered` | **Untouched.** No re-derivation, so no obfuscation changes. |
| `turnover_method`, `safety_ack_at`, `photo_waiver_reason` | `NULL`; render as "Not recorded". |
| Photo-less existing rows | Remain valid. The new rule is create-time only. |
| Milestone columns | Already `NULL`/`false` on every row. No backfill. |
| Status | No row is in `Verified`. The transition map must permit states real rows occupy. |
| `reported_by` | Every existing row keeps a value; only new walk-ins are `NULL`. |

**Verify the running system, not just the repo.** Check migrations actually applied on each database
(`prisma migrate status` does **not** surface checksum drift — hash the files), and run
`node scripts/preflight.mjs` on the Docker machine before the defense.

---

## 9. Deploy order

```
1.  API   species catalogue + seed + public GET /species    (inert; nothing reads it yet)
2.  API   admin species CRUD + photo upload
3.  WEB   AdminSpeciesPage — catalogue populated by a human before any client depends on it
4.  API   FK + category enum + derive category/endangered   (clients still send the old fields;
          they are ignored, so behaviour is unchanged)
5.  API   turnover method, checklist, safety ack, waiver
6.  WEB   resident form: grouped picker, identification block, safety, checklist, method
    ── deploy API + web together ──
7.  API   walk-in intake  +  WEB  LogWalkInWildlifePage
8.  API   Verified status + transition map + five array updates + notifications   (one deploy)
9.  WEB   staff detail milestones + resident charter progress
10. MOBILE one OTA: species fetch, grouped Select, identification, safety, checklist, method,
          charter progress, Verified stage
11. docs  PRD-resident, PRD-staff-admin, CLAUDE.md
```

**Two orderings are not negotiable.** Step 4 must precede step 6 (otherwise the web form sends a
category the server ignores while still *displaying* it as authoritative — a silent disagreement).
Step 8 must be a **single deploy** across the API and both status arrays in `web/src/lib/staff.js`,
or `Verified` reports vanish from SLA counts.

Steps 1–5 are safe to ship ahead of any client, because the server ignoring a field a client still
sends is behaviour-neutral. **The mobile OTA is last**, as it is the only client that cannot be
rolled back quickly.

### This spec is too large for one implementation plan

Deliberately so: items 1–3 share a single data model, and splitting the spec would have meant
describing the `Species` table three times. The **implementation** should be split into three plans
along the seams the deploy order already exposes:

| Plan | Steps | Covers | Independently shippable? |
|---|---|---|---|
| **A — Species catalogue** | 1–4, 6 (web form), 10 (partial) | Items 1, 2, 3 | Yes. Ends with a working grouped picker and server-derived category/endangered. |
| **B — Resident safety and intake** | 5–7 | Items 4a, 4b, 5, 6 | Yes, but depends on A for `Species.hazard` and `handling_note`. |
| **C — Citizens Charter flow** | 8–9 | Item 7 | Yes, and **independent of A and B** — it touches statuses and milestones, not species. Blocked only on the §10 verification questions. |

Plan **C can start first** if the charter is confirmed before the catalogue is populated; nothing in
item 7 depends on items 1–6.

---

## 10. Open questions requiring verification

These do not block starting items 1–6. They **do** block finalising item 7.

1. **Does the Citizens Charter state per-step deadlines or one total turnaround?** The system
   currently promises a single 3218-working-minute budget from submission. If the charter sets
   per-action deadlines, `SystemSetting` needs one key per step and the SLA model changes shape.
   **This is the most consequential open question.**
2. **Are the five reconstructed agency actions correct, in that order, with those responsible
   roles?** Derived from column names, not from the document.
3. **Where does `3218` come from?** No comment in the repo explains it. ~6.7 working days is an odd
   figure; if the charter says "7 working days" the correct value is 3360.
4. **Is there a rejection path?** `WildlifeStatus` has no `Rejected`, so a report that is not
   wildlife at all (a stray dog) has nowhere to go and must be archived instead. Confirm whether the
   charter has a "not within mandate" outcome. *(Note: `mobile/src/lib/reports.js` lists `Rejected`
   in `STAGE_CLOSED`, but that value belongs to Complaint/Request, not Wildlife.)*
5. **Biome and `is_endangered` per species** — the 10 seeded species need a biome and an explicit
   protected-status call from someone who knows DENR listings. `web/src/lib/species.js` `status`
   values are IUCN-flavoured and **not** a legal protected-status list. Do not guess: this field
   decides public-map obfuscation.
6. **Should `SpeciesCategory` ever include Amphibian or Fish?** Decided as an enum of 3 on the
   requester's statement that the categories are exclusive (§3). Frogs and lake fish are plausible
   in Cabuyao; if either is expected, make it a table now rather than migrating later.

---

## 11. Out of scope

- **Offline report submission.** No offline write support exists anywhere in the app; this design
  does not add it.
- **EXIF stripping on uploads.** A known, documented limitation: photos are stored as received, so
  GPS and device metadata survive. `sharp` is now a dependency (added for PDF photo conversion),
  which would make a stripping pipeline straightforward — but it is a separate change affecting all
  three report types.
- **Anonymous wildlife reporting.** Complaints have it; wildlife does not. Not requested here.
- **Data retention / archival policy.** Still an open decision elsewhere.
- **Per-barangay biome mapping**, species distribution analytics, and multi-habitat species.
- **Rewriting `docs/superpowers/specs/` history.** Earlier dated designs stay as they are.
