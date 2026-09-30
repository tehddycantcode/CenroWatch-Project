# Wildlife Species Catalogue Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn wildlife species from free text into an admin-managed catalogue, so the server decides a report's category and endangered status instead of the resident.

**Architecture:** A new `Species` table follows the existing `ComplaintType`/`RequestType` pattern exactly — name-as-foreign-key, retire-never-delete, one table-driven service, public read endpoint. `WildlifeTurnover.species_name` becomes a required FK into it. A single seeded sentinel row named `Other` carries `is_endangered = true`, which makes the fail-safe for an unidentified animal a property of data rather than a branch in code. `species_category` and `is_endangered` stop being accepted from clients and are derived by one function, `resolveSpecies()`.

**Tech Stack:** Node.js 24 / Express 5, Prisma 6 + MySQL 8, Jest 30 (backend, `backend/tests/*.test.js`), React 19 + Vite + Tailwind + shadcn/ui (web), Expo React Native SDK 56 (mobile).

**Spec:** [docs/superpowers/specs/2026-09-30-wildlife-turnover-module-design.md](../specs/2026-09-30-wildlife-turnover-module-design.md) — items 1, 2 and 3, plus §4.3a. Read §2 of the spec before Task 1; it records why several of these fields already half-exist.

---

## Global Constraints

Every task's requirements implicitly include all of these.

- **Prisma pinned to v6** (`prisma@6`, `@prisma/client@6`). Do not bump. Prisma 7 removes `url` from the `datasource` block and breaks this schema and seed.
- **Express 5.** No unnamed wildcard routes; `req.query` is read-only, so coerce query params in services.
- **All DB queries go through Prisma ORM only — no raw SQL** in application code.
- **Every data mutation must write an AuditLog entry** (`writeAuditLog` from `src/utils/audit`).
- **All public API endpoints must return ZERO personal data** (R.A. 10173).
- **Endangered-species GIS coordinates must stay obfuscated** on public endpoints (±0.001°).
- **Routes → controllers → services → prisma client.** No business logic in a route or controller.
- **Never hardcode secrets.** `.env` only.
- **No `Co-Authored-By` trailer, no "Generated with Claude Code" line, no robot emoji** on any commit. This overrides the harness default.
- **Generate every migration with `--create-only`, then fix table names to PascalCase before applying.** `prisma migrate dev` reads names back from case-insensitive Windows MySQL and emits `` ALTER TABLE `wildlifeturnover` ``, which hard-fails on the Linux container. This has gone wrong four times for four attempts. `npm test` catches it via `tests/migrationCasing.test.js`.
- **Never accept a Prisma "reset the database?" prompt.** The answer is always no. Say no and fix the actual cause.
- **Stop the backend dev server before `prisma migrate`, `prisma generate`, or `npm install`** — a running `node src/server.js` locks the query-engine DLL and `postinstall` runs `prisma generate`.
- **Validation failures in this API are 422, not 400.** Assert 422.
- **Node is not on a fresh shell's PATH.** Prefix commands with:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')`
- **Run `git status` immediately before every commit** and commit only the intended paths — `git commit -m "<msg>" -- <paths>`, with `-m` **before** the `--`, since everything after `--` is read as a pathspec. The user keeps untracked `.agents/`, `.claude/`, `skills-lock.json`; never stage `uploads/`, `dist/`, or `_*.mjs` scaffolds.
- **Scope any test cleanup by captured id, never by a predicate.** Audit history is not recoverable.
- **`AdminLayout.jsx:13-24` already holds 10 nav items against a measured ~1203px/1280px budget.** Do not add an 11th. Species is reached from the Categories page.

---

## Review Focus

Five failure modes the spec implies that no task's happy path exercises. Each has its test added to the task that owns the code.

1. **An old mobile build posts a free-text species name** (`'Sea turtle'`) after the API ships but before the OTA lands. It must **not** 422 — the report must land as `Other` with the typed name preserved in the description. Losing an animal-welfare report to a validation error is the worst outcome here. *(Task 4)*
2. **A client still sends `species_category` and `is_endangered`** during the deploy window. Both must be **ignored, not rejected** — an old web bundle that 422s is a broken live site. *(Task 9)*
3. **An Admin retires or renames the `Other` row.** The specify box keys off that literal name, so the form silently loses its "Other" option and `resolveSpecies` loses its fallback. Both must be refused. *(Task 5)*
4. **Existing `species_category` free text outside the three values** (a resident typed `Reptile / Bird`) must not be silently corrupted or block the enum migration. It becomes `NULL`, never a wrong enum value. *(Task 11)*
5. **The species fetch fails** on web or mobile. The picker must show a visible error, never render empty — a form with no options cannot be submitted and looks like a bug in the app. *(Tasks 13, 18)*

---

## File Structure

**Backend — create**

| File | Responsibility |
|---|---|
| `backend/src/services/species.service.js` | All species reads/writes, plus `resolveSpecies()` — the single place a report's category and endangered flag are decided. |
| `backend/src/controllers/species.controller.js` | HTTP layer for the public list. |
| `backend/src/routes/species.routes.js` | `GET /api/v1/species`, public. |
| `backend/src/validators/species.validators.js` | Admin create/update rules. |
| `backend/scripts/audit-species-names.mjs` | One-off: reports which existing `species_name` / `species_category` values have no catalogue row, before the FK lands. |
| `backend/tests/species.service.test.js` | Catalogue CRUD guards. |
| `backend/tests/speciesResolution.test.js` | `resolveSpecies()` + the derivation in `wildlife.service`. |

**Backend — modify**

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | 4 new enums, `Species` model, `WildlifeTurnover` FK + `species_category` enum. |
| `backend/prisma/seed.js` | 10 species + the `Other` sentinel. |
| `backend/src/services/wildlife.service.js` | Call `resolveSpecies()`; stop trusting client fields. |
| `backend/src/services/staff.wildlife.service.js` | Endangered override. |
| `backend/src/validators/wildlife.validators.js` | Drop the old `species_category` / `is_endangered` rules. |
| `backend/src/validators/staff.validators.js` | Allow `is_endangered` on staff update. |
| `backend/src/routes/admin.routes.js` | Species CRUD + photo. |
| `backend/src/controllers/admin.controller.js` | Species handlers. |

**Web — create** `lib/useSpecies.js`, `pages/admin/AdminSpeciesPage.jsx`
**Web — modify** `lib/api.js`, `App.jsx`, `pages/admin/AdminCategoriesPage.jsx` (link), `pages/resident/WildlifeFormPage.jsx`, `pages/public/WildlifePage.jsx`, `pages/staff/WildlifeDetailPage.jsx`
**Web — delete** `lib/species.js`

**Mobile — create** `lib/useSpecies.js`
**Mobile — modify** `components/Select.js`, `api/client.js`, `lib/reports.js`, `screens/resident/WildlifeFormScreen.js`

---

## Task 1: Species enums, model and the additive migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (enums after `AnimalCondition` at :65-71; new model after `Barangay` at :182-208)
- Test: `backend/tests/migrationCasing.test.js` (existing — must stay green)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `prisma.species` with fields `species_id, name, scientific_name, local_name, category, biome, indicator, hazard, is_endangered, body_description, handling_note, photo_path, photo_credit, is_active, sort_order, created_at, updated_at`. Enums `SpeciesCategory`, `SpeciesBiome`, `SpeciesIndicator`, `SpeciesHazard`.

- [ ] **Step 1: Add the four enums to `schema.prisma`**

Place immediately after the `AnimalCondition` enum.

```prisma
// ============================================================
// SPECIES CATALOGUE
// ============================================================

// The three exclusive wildlife categories. An ENUM rather than a table -
// deliberately breaking the ComplaintType/RequestType precedent - because
// "exclusive" is the whole point of automatic assignment, and only an enum lets
// the database enforce that a fourth value cannot appear. Cost, accepted
// knowingly: Amphibian or Fish would need a migration.
enum SpeciesCategory {
  Bird
  Mammal
  Reptile
}

// Primary habitat, as an identification aid ("where you would expect to find
// it"). One value per species: several of these animals use more than one
// habitat, so if filtering by biome is ever required this becomes a join table.
enum SpeciesBiome {
  Forest
  Freshwater
  Lakeshore_Wetland
  Agricultural
  Urban
  Cave
}

// Conservation standing. DESCRIPTIVE ONLY - it does not decide obfuscation.
// See Species.is_endangered for why that is separate and explicit.
enum SpeciesIndicator {
  Common
  Native
  Endemic
  Near_Threatened
  Vulnerable
  Endangered
  Critically_Endangered
}

// Physical risk to whoever approaches the animal. Separate from
// SpeciesIndicator on purpose: conservation standing and danger are unrelated.
// A Reticulated Python is Native but dangerous; a Philippine Duck is Vulnerable
// but harmless.
enum SpeciesHazard {
  None
  Venomous
  Aggressive
  Disease_Risk
  Powerful_Bite_Or_Talons
}
```

- [ ] **Step 2: Add the `Species` model**

```prisma
// Admin-managed species catalogue. Follows ComplaintType/RequestType: reports
// store the species NAME with a foreign key to it, so the database guarantees a
// report can never name a species that does not exist, and every groupBy, PDF
// row and badge keeps reading the value it already reads.
//
// Species are RETIRED (is_active = false), never deleted. A species with reports
// against it cannot be removed without making that history unreadable, and the
// FK is RESTRICT so the database refuses it outright.
model Species {
  species_id      Int    @id @default(autoincrement())
  name            String @unique @db.VarChar(200)
  scientific_name String? @db.VarChar(200)
  local_name      String? @db.VarChar(200) // e.g. "musang"

  // NULLABLE, all three. The catalogue holds one sentinel row, `Other`, which
  // has no taxonomy at all. Real species always carry these, enforced by
  // species.validators.js rather than by the column.
  category  SpeciesCategory?
  biome     SpeciesBiome?
  indicator SpeciesIndicator?
  hazard    SpeciesHazard     @default(None)

  // EXPLICIT, never derived from `indicator`. DENR/legal protected status does
  // not map cleanly onto IUCN categories, and this boolean drives public-map
  // coordinate obfuscation - a privacy control is set deliberately, not
  // inferred from a taxonomy label.
  is_endangered Boolean @default(false)

  body_description String? @db.Text // size, colour, markings, distinctive traits
  handling_note    String? @db.Text // species-specific safety guidance
  photo_path       String? @db.VarChar(500)
  photo_credit     String? @db.VarChar(255)

  is_active  Boolean  @default(true)
  sort_order Int      @default(0)
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  turnovers WildlifeTurnover[]

  @@index([category])
  @@index([is_endangered])
  @@index([is_active])
}
```

- [ ] **Step 3: Stop the backend dev server, then generate the migration WITHOUT applying it**

```bash
# in backend/
npx prisma migrate dev --name species_catalogue --create-only
```

- [ ] **Step 4: Read the generated SQL and fix every table name to PascalCase**

Open `backend/prisma/migrations/<timestamp>_species_catalogue/migration.sql`. The new table must be `` CREATE TABLE `Species` ``, not `` `species` ``. This is expected to be wrong — see Global Constraints.

- [ ] **Step 5: Run the casing test to confirm the SQL is safe to apply**

Run: `npx jest tests/migrationCasing.test.js`
Expected: PASS. If it fails, fix the casing in the `.sql` file **before** applying — editing an applied migration breaks its `_prisma_migrations` checksum.

- [ ] **Step 6: Apply the migration and regenerate the client**

```bash
npx prisma migrate dev
```
Expected: `Species` table created. **If prompted to reset the database, answer no and stop.**

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, same count as before plus nothing. This migration is purely additive; no existing test should change.

- [ ] **Step 8: Commit**

```bash
git status --short
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "Add the species catalogue table" -- backend/prisma/schema.prisma backend/prisma/migrations
```

---

## Task 2: Seed the catalogue

**Files:**
- Modify: `backend/prisma/seed.js` (species array beside `complaintTypes` at :52-74; upsert loop beside :106-122)
- Reference (delete later, in Task 16): `web/src/lib/species.js` — the source of this content

**Interfaces:**
- Consumes: `prisma.species` from Task 1.
- Produces: 11 catalogue rows — 10 real species plus `Other`. `Other` is referenced by name from `species.service.js` (Task 4) as `OTHER_SPECIES`.

- [ ] **Step 1: Add the species array to `seed.js`**

Content migrated from `web/src/lib/species.js`. `blurb` → `body_description`, `note` → `handling_note`, `group` → `category`, `status` → `indicator`. Philippine Cobra's `'Caution: Venomous'` splits into `indicator: 'Native'` + `hazard: 'Venomous'`, per the spec's decision that conservation standing and danger are unrelated.

```js
// Wildlife species catalogue. Migrated from web/src/lib/species.js, which was a
// frozen array compiled into the web bundle and invisible to mobile.
//
// biome and is_endangered are NEW judgements - they were not in the old array.
// is_endangered decides public-map coordinate obfuscation, so it is a legal
// DENR/protected-species call rather than an IUCN label: `indicator` carries the
// IUCN-flavoured standing separately. The values below are the conservative
// reading and are flagged for verification in the spec (section 10, item 5).
const species = [
  {
    name: 'Philippine Duck', scientific_name: 'Anas luzonica',
    category: 'Bird', biome: 'Lakeshore_Wetland', indicator: 'Vulnerable',
    hazard: 'None', is_endangered: true, sort_order: 1,
    photo_credit: 'Ken Billington, CC BY-SA 3.0',
    body_description: 'A medium-sized dabbling duck with a cinnamon head, black crown and stripe through the eye, and a blue-grey bill. Endemic to the Philippines.',
    handling_note: 'Do not capture. Report sightings so CENRO can monitor wetland populations.',
  },
  {
    name: 'Philippine Eagle-Owl', scientific_name: 'Bubo philippensis',
    category: 'Bird', biome: 'Forest', indicator: 'Endemic',
    hazard: 'Powerful_Bite_Or_Talons', is_endangered: true, sort_order: 2,
    photo_credit: 'Aimee Valencia, CC BY-SA 4.0',
    body_description: "The country's largest owl. Rufous-brown plumage, prominent ear tufts, large orange eyes. Found only in the Philippines, near rivers and forest edges.",
    handling_note: 'If found grounded or injured, keep your distance and arrange a turnover. Talons are powerful.',
  },
  {
    name: 'Large Flying Fox', scientific_name: 'Pteropus vampyrus',
    category: 'Mammal', biome: 'Forest', indicator: 'Near_Threatened',
    hazard: 'Disease_Risk', is_endangered: true, sort_order: 3,
    photo_credit: 'NobbiP, CC BY-SA 3.0',
    body_description: 'A very large fruit bat with a fox-like reddish-brown head, dark wings and a wingspan up to 1.5 m. Roosts in colonies in tall trees.',
    handling_note: 'Never handle bats with bare hands (rabies risk). Report roosts or grounded individuals.',
  },
  {
    name: 'Asian Palm Civet', scientific_name: 'Paradoxurus hermaphroditus',
    local_name: 'musang',
    category: 'Mammal', biome: 'Urban', indicator: 'Native',
    hazard: 'Aggressive', is_endangered: false, sort_order: 4,
    photo_credit: 'Bernard DUPONT, CC BY-SA 2.0',
    body_description: 'A cat-sized nocturnal mammal, shaggy grey-brown coat with dark spots and stripes, a black mask across the face and a long tail.',
    handling_note: 'Do not keep as a pet. It may bite if cornered. Turn over to CENRO for safe release.',
  },
  {
    name: 'Asian Water Monitor', scientific_name: 'Varanus salvator',
    local_name: 'bayawak',
    category: 'Reptile', biome: 'Freshwater', indicator: 'Native',
    hazard: 'Powerful_Bite_Or_Talons', is_endangered: false, sort_order: 5,
    photo_credit: 'Carlos Delgado, CC BY-SA 4.0',
    body_description: 'A large semi-aquatic lizard, up to 2 m, dark grey-brown with yellow spots and bands, a long forked tongue and a strong flattened tail.',
    handling_note: 'Usually harmless if left alone, but it can bite and lash with its tail. If trapped in a property, request a turnover rather than harming it.',
  },
  {
    name: 'Reticulated Python', scientific_name: 'Malayopython reticulatus',
    local_name: 'sawa',
    category: 'Reptile', biome: 'Freshwater', indicator: 'Native',
    hazard: 'Aggressive', is_endangered: false, sort_order: 6,
    photo_credit: 'Mariluna, CC BY-SA 3.0',
    body_description: "The world's longest snake. Olive to tan with a bold black net-like (reticulated) pattern and a thin dark line along the top of the head. Non-venomous.",
    handling_note: 'Do not attempt to catch large individuals. Keep people and pets back and call for a turnover.',
  },
  {
    name: 'Philippine Cobra', scientific_name: 'Naja philippinensis',
    local_name: 'ulupong',
    category: 'Reptile', biome: 'Agricultural', indicator: 'Native',
    hazard: 'Venomous', is_endangered: false, sort_order: 7,
    photo_credit: 'Mario Lutz, CC BY-SA 3.0',
    body_description: 'A stocky snake, uniform light to medium brown, about 1 m long. Rears up and spreads a hood when threatened. HIGHLY VENOMOUS and able to spit venom.',
    handling_note: 'Do NOT approach. Move people away, keep it in sight from a safe distance, and report immediately.',
  },
  {
    name: 'Black-crowned Night Heron', scientific_name: 'Nycticorax nycticorax',
    category: 'Bird', biome: 'Lakeshore_Wetland', indicator: 'Common',
    hazard: 'None', is_endangered: false, sort_order: 8,
    photo_credit: 'ramidos, CC BY 4.0',
    body_description: 'A stocky, short-necked wading bird with a black crown and back, pale grey wings, white underparts and red eyes. Often seen at dusk.',
    handling_note: 'A healthy part of the wetland ecosystem. Report only if injured or entangled.',
  },
  {
    name: 'Collared Kingfisher', scientific_name: 'Todiramphus chloris',
    category: 'Bird', biome: 'Lakeshore_Wetland', indicator: 'Common',
    hazard: 'None', is_endangered: false, sort_order: 9,
    photo_credit: 'JJ Harrison, CC BY-SA 3.0',
    body_description: 'A bright turquoise-blue and white kingfisher with a broad white collar, a heavy black bill and a white stripe above the eye.',
    handling_note: 'Protect creekside vegetation where they nest. Report injured birds.',
  },
  {
    name: 'Southeast Asian Box Turtle', scientific_name: 'Cuora amboinensis',
    local_name: 'pagong',
    category: 'Reptile', biome: 'Freshwater', indicator: 'Vulnerable',
    hazard: 'None', is_endangered: true, sort_order: 10,
    photo_credit: 'Cuora (English Wikipedia), CC BY-SA 3.0',
    body_description: 'A semi-aquatic turtle with a high domed dark-olive shell and three yellow stripes on each side of a black head. The shell closes fully.',
    handling_note: 'Never buy or sell. Turn over to CENRO for assessment and release.',
  },
  // THE SENTINEL ROW. species_name is a required foreign key, so a name a
  // resident types cannot be stored in it - the same problem ComplaintType
  // solves with a real "Other" category and otherCategory.js folding the typed
  // detail into the description's first line. Wildlife follows that.
  //
  // No category/biome/indicator: an unidentified animal has no taxonomy.
  // is_endangered is TRUE, which is what makes the fail-safe for an unknown
  // animal a property of this row rather than a branch in the service - it is
  // routed to Priority_Review and its location is obfuscated on the public map.
  //
  // DO NOT rename or retire this row. species.service.js refuses both, because
  // the specify box and resolveSpecies()'s fallback both key off this literal
  // name.
  {
    name: 'Other', category: null, biome: null, indicator: null,
    hazard: 'None', is_endangered: true, sort_order: 999,
    body_description: null,
    handling_note: 'Treat any unidentified animal as potentially dangerous and possibly protected. Keep your distance, keep children and pets away, and do not attempt to handle it.',
  },
];
```

- [ ] **Step 2: Add the idempotent upsert loop inside `main()`**

Place beside the existing category loops.

```js
  for (const s of species) {
    await prisma.species.upsert({
      where: { name: s.name },
      update: s,
      create: s,
    });
  }
  console.log(`  ${species.length} species seeded (including the "Other" sentinel).`);
```

- [ ] **Step 3: Run the seed**

```bash
npx prisma db seed
```
Expected: `11 species seeded (including the "Other" sentinel).`

- [ ] **Step 4: Run it a second time to prove it is idempotent**

```bash
npx prisma db seed
```
Expected: same output, still 11 rows. The seed runs on every deploy, so a non-idempotent seed would duplicate or crash.

- [ ] **Step 5: Verify the row count and the sentinel with a temporary script**

Create `backend/_check-species.mjs` (**delete it in step 7** — never commit `_*.mjs` scaffolds):

```js
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const all = await prisma.species.findMany({ orderBy: { sort_order: 'asc' }, select: { name: true, category: true, is_endangered: true, hazard: true } });
console.log(`rows: ${all.length}`);
console.table(all);
const other = all.find((s) => s.name === 'Other');
console.log('Other is endangered (must be true):', other?.is_endangered);
console.log('Other has no category (must be null):', other?.category);
await prisma.$disconnect();
```

Run: `node _check-species.mjs`
Expected: 11 rows; `Other` shows `is_endangered: true` and `category: null`.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Delete the scaffold and commit**

```bash
rm backend/_check-species.mjs
git status --short
git commit -m "Seed the wildlife species catalogue" -- backend/prisma/seed.js
```

---

## Task 3: `species.service.js` — the two read paths

**Files:**
- Create: `backend/src/services/species.service.js`
- Create: `backend/tests/species.service.test.js`

**Interfaces:**
- Consumes: `prisma.species` (Task 1).
- Produces:
  - `OTHER_SPECIES` — the string `'Other'`.
  - `listActive(): Promise<{ species: Array<{name, scientific_name, local_name, category, biome, indicator, hazard, is_endangered, body_description, handling_note, photo_path, photo_credit, sort_order}> }>`
  - `listAll(): Promise<{ species: Array<row & { in_use: number }> }>`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/species.service.test.js`:

```js
// Admin-managed wildlife species catalogue.
//
// The guards here are what turn "an Admin can edit a list" into something safe
// to hand over. Two of them protect things a reasonable Admin would not expect
// to be load-bearing: the LAST ACTIVE species (retiring it leaves residents
// staring at an empty dropdown with no way to file anything) and the `Other`
// SENTINEL ROW, whose literal name is what the specify box and
// resolveSpecies()'s fallback both key off.

jest.mock('../src/utils/prisma', () => ({
  species: {
    findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(),
    update: jest.fn(), count: jest.fn(),
  },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));

const prisma = require('../src/utils/prisma');
const svc = require('../src/services/species.service');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.species.findUnique.mockResolvedValue(null);
  prisma.species.findMany.mockResolvedValue([]);
  prisma.species.count.mockResolvedValue(5);
});

describe('listActive - what the report forms and the public page read', () => {
  test('returns only active species, ordered for display', async () => {
    prisma.species.findMany.mockResolvedValue([{ name: 'Philippine Duck' }]);
    const out = await svc.listActive();
    expect(out.species).toEqual([{ name: 'Philippine Duck' }]);
    const args = prisma.species.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ is_active: true });
    expect(args.orderBy).toEqual([{ sort_order: 'asc' }, { name: 'asc' }]);
  });

  test('CARRIES NO PERSONAL DATA - this endpoint is public (R.A. 10173)', async () => {
    await svc.listActive();
    const selected = Object.keys(prisma.species.findMany.mock.calls[0][0].select);
    // An allowlist, so adding a column to the model cannot silently widen a
    // public response.
    expect(selected.sort()).toEqual([
      'biome', 'body_description', 'category', 'handling_note', 'hazard',
      'indicator', 'is_endangered', 'local_name', 'name', 'photo_credit',
      'photo_path', 'scientific_name', 'sort_order',
    ]);
  });
});

describe('listAll - the admin view', () => {
  test('reports how many reports use each species', async () => {
    prisma.species.findMany.mockResolvedValue([
      { species_id: 1, name: 'Philippine Duck', _count: { turnovers: 3 } },
    ]);
    const out = await svc.listAll();
    expect(out.species[0].in_use).toBe(3);
    expect(out.species[0]._count).toBeUndefined();
  });

  test('includes retired species, which listActive hides', async () => {
    await svc.listAll();
    expect(prisma.species.findMany.mock.calls[0][0].where).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/species.service.test.js`
Expected: FAIL — `Cannot find module '../src/services/species.service'`.

- [ ] **Step 3: Write the service**

Create `backend/src/services/species.service.js`:

```js
// Admin-managed wildlife species catalogue, and the one place a report's
// category and endangered status are decided.
//
// Modelled on category.service.js, which solved the same problem for complaint
// and request types: reference data an Admin can edit without a redeploy, stored
// as rows, referenced by NAME so every groupBy, PDF row and badge keeps reading
// the value it already reads.
//
// Species are RETIRED (is_active = false), never deleted: a species with reports
// against it cannot be removed without making that history unreadable, and the
// FK is RESTRICT so the database refuses it outright.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');

// The sentinel row seeded by prisma/seed.js. species_name is a required foreign
// key, so free text a resident types cannot go in it - this is the row that
// stands in for "an animal not in the catalogue", and its is_endangered = true
// is what makes an unidentified animal fail safe without a branch anywhere.
const OTHER_SPECIES = 'Other';

// What a resident, the public education page and both report forms may see.
// An ALLOWLIST rather than a spread: this response is public, so adding a column
// to the model must not silently widen it (R.A. 10173).
const PUBLIC_FIELDS = {
  name: true,
  scientific_name: true,
  local_name: true,
  category: true,
  biome: true,
  indicator: true,
  hazard: true,
  is_endangered: true,
  body_description: true,
  handling_note: true,
  photo_path: true,
  photo_credit: true,
  sort_order: true,
};

/**
 * Active species, for the wildlife form and the public species guide.
 * Zero personal data, so this is safe on a public endpoint (R.A. 10173).
 */
async function listActive() {
  const species = await prisma.species.findMany({
    where: { is_active: true },
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    select: PUBLIC_FIELDS,
  });
  return { species };
}

/**
 * Admin view: every species including retired ones, each with the number of
 * reports using it. The count is what tells an Admin whether retiring a species
 * will affect existing records, so it is worth the extra query.
 */
async function listAll() {
  const rows = await prisma.species.findMany({
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { turnovers: true } } },
  });
  return {
    species: rows.map(({ _count, ...row }) => ({ ...row, in_use: _count.turnovers })),
  };
}

module.exports = { OTHER_SPECIES, PUBLIC_FIELDS, listActive, listAll };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/species.service.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git status --short
git add backend/src/services/species.service.js backend/tests/species.service.test.js
git commit -m "Add the species catalogue read paths" -- backend/src/services/species.service.js backend/tests/species.service.test.js
```

---

## Task 4: `resolveSpecies()` — deriving category and endangered status

This is the heart of spec items 2 and 3. Everything else is plumbing around it.

**Files:**
- Modify: `backend/src/services/species.service.js`
- Create: `backend/tests/speciesResolution.test.js`

**Interfaces:**
- Consumes: `OTHER_SPECIES`, `prisma.species` (Task 3).
- Produces: `resolveSpecies(submittedName: string, submittedCategory?: string): Promise<{ name: string, category: 'Bird'|'Mammal'|'Reptile'|null, is_endangered: boolean, hazard: string, unlisted: string|null }>`. `unlisted` carries whatever the caller submitted when it matched no row, so `wildlife.service` can fold it into the description. Also `CATEGORY_VALUES: string[]`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/speciesResolution.test.js`:

```js
// Deriving a wildlife report's category and endangered status from the species.
//
// WHY THIS SUITE EXISTS. Both values used to come from the CLIENT: the resident
// typed a category into a free-text box and ticked "I believe this is an
// endangered or protected species". That second checkbox drives THREE things,
// and the third is a privacy control - is_priority_review, the initial status,
// and PUBLIC-MAP COORDINATE OBFUSCATION (gis.service.js). A resident deciding
// whether a rescue site is hidden from a poacher is the wrong author for that
// decision, and a resident deciding the category made "only three exclusive
// categories" untrue in practice.
//
// THE ASSERTION THIS SUITE EXISTS FOR is "a client cannot override either
// value". Everything else here protects the path that must never lose a report.

jest.mock('../src/utils/prisma', () => ({
  species: { findUnique: jest.fn() },
}));

const prisma = require('../src/utils/prisma');
const { resolveSpecies, OTHER_SPECIES } = require('../src/services/species.service');

const COBRA = { name: 'Philippine Cobra', category: 'Reptile', is_endangered: false, hazard: 'Venomous' };
const DUCK = { name: 'Philippine Duck', category: 'Bird', is_endangered: true, hazard: 'None' };
const OTHER = { name: 'Other', category: null, is_endangered: true, hazard: 'None' };

// Answer findUnique from a small table, so each test states only what it cares
// about rather than re-stubbing call order.
function catalogue(rows) {
  prisma.species.findUnique.mockImplementation(({ where }) =>
    Promise.resolve(rows.find((r) => r.name === where.name) || null));
}

beforeEach(() => jest.clearAllMocks());

describe('a catalogued species decides its own category and status', () => {
  test('category comes from the row', async () => {
    catalogue([COBRA]);
    const out = await resolveSpecies('Philippine Cobra');
    expect(out.category).toBe('Reptile');
    expect(out.name).toBe('Philippine Cobra');
    expect(out.unlisted).toBeNull();
  });

  test('A CLIENT CANNOT OVERRIDE THE CATEGORY', async () => {
    // The assertion item 2 rests on. The old form shipped an editable text box
    // for this, so an old bundle still posts a value - it must be ignored, not
    // honoured and not rejected.
    catalogue([COBRA]);
    const out = await resolveSpecies('Philippine Cobra', 'Bird');
    expect(out.category).toBe('Reptile');
  });

  test('A CLIENT CANNOT OVERRIDE THE ENDANGERED FLAG', async () => {
    // The assertion item 3 rests on, and a privacy control: this boolean is what
    // gis.service.js fuzzes coordinates on.
    catalogue([DUCK]);
    const out = await resolveSpecies('Philippine Duck');
    expect(out.is_endangered).toBe(true);
  });

  test('carries the hazard through, for the safety guidance in Plan B', async () => {
    catalogue([COBRA]);
    expect((await resolveSpecies('Philippine Cobra')).hazard).toBe('Venomous');
  });
});

describe('the Other sentinel', () => {
  test('is endangered, so an unidentified animal fails SAFE', async () => {
    // Not a branch in this function - a property of the seeded row. An unknown
    // animal might be protected, and the cost of guessing wrong the other way is
    // publishing a poaching target.
    catalogue([OTHER]);
    const out = await resolveSpecies('Other', 'Reptile');
    expect(out.is_endangered).toBe(true);
    expect(out.name).toBe(OTHER_SPECIES);
  });

  test('takes its category from the resident, since the row has none', async () => {
    catalogue([OTHER]);
    expect((await resolveSpecies('Other', 'Reptile')).category).toBe('Reptile');
  });

  test('accepts a missing category rather than refusing the report', async () => {
    // species_category is nullable. A resident who cannot say whether it is a
    // bird, mammal or reptile must still be able to file; staff can set it.
    catalogue([OTHER]);
    expect((await resolveSpecies('Other')).category).toBeNull();
  });

  test('ignores a category that is not one of the three', async () => {
    catalogue([OTHER]);
    expect((await resolveSpecies('Other', 'Dinosaur')).category).toBeNull();
  });
});

describe('AN UNKNOWN SPECIES NAME MUST NOT LOSE THE REPORT', () => {
  // Review Focus 1. After this ships, every installed APK keeps posting
  // free-text species names until its owner opens the app and takes the OTA -
  // and there is no telemetry to say when that has happened. A 422 here would
  // throw away animal-welfare reports for as long as that takes, so an
  // uncatalogued name is treated exactly as "Other".
  test('falls back to the Other row instead of throwing', async () => {
    catalogue([OTHER]);
    const out = await resolveSpecies('Sea turtle');
    expect(out.name).toBe('Other');
    expect(out.is_endangered).toBe(true);
  });

  test('PRESERVES what the resident typed, so staff still learn the species', async () => {
    catalogue([OTHER]);
    expect((await resolveSpecies('Sea turtle')).unlisted).toBe('Sea turtle');
  });

  test('an empty name also falls back, with nothing to preserve', async () => {
    catalogue([OTHER]);
    const out = await resolveSpecies('');
    expect(out.name).toBe('Other');
    expect(out.unlisted).toBeNull();
  });

  test('a RETIRED species is still accepted on a new report', async () => {
    // Deliberately unlike category.service.isSelectable, which 422s a retired
    // complaint type. A stale client still offers a species an Admin retired
    // yesterday, the row still exists so the foreign key holds, and staff see
    // the real species name - strictly better than degrading it to "Other".
    catalogue([{ ...DUCK, is_active: false }]);
    const out = await resolveSpecies('Philippine Duck');
    expect(out.name).toBe('Philippine Duck');
    expect(out.unlisted).toBeNull();
  });
});

describe('a catalogue with no Other row', () => {
  test('fails loudly rather than writing a broken foreign key', async () => {
    // Only reachable if someone deletes the seeded row directly in SQL.
    catalogue([]);
    await expect(resolveSpecies('Sea turtle')).rejects.toThrow(/catalogue/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/speciesResolution.test.js`
Expected: FAIL — `resolveSpecies is not a function`.

- [ ] **Step 3: Add `resolveSpecies` to the service**

Append to `backend/src/services/species.service.js`, before `module.exports`:

```js
// The three exclusive categories, mirroring the SpeciesCategory enum. Duplicated
// here rather than imported because Prisma does not export enum values usable in
// a plain Set; tests/statusPartitions.test.js reads schema.prisma directly if you
// need the authoritative list.
const CATEGORY_VALUES = ['Bird', 'Mammal', 'Reptile'];

/**
 * Decide a report's species, category, endangered flag and hazard.
 *
 * THE ONLY PLACE those values are decided. They used to come from the client -
 * a free-text category box and a self-declared "I believe this is endangered"
 * checkbox - which made "three exclusive categories" untrue and put a privacy
 * control (public-map obfuscation) in the reporter's hands.
 *
 * NEVER THROWS FOR AN UNRECOGNISED SPECIES. Every installed APK keeps posting
 * free-text names until its owner takes the OTA, and there is no telemetry to
 * say when that has happened. An unknown name is therefore treated exactly as
 * "Other": the report lands, the Other row's is_endangered = true makes it fail
 * safe, and what the resident typed is returned in `unlisted` so the caller can
 * keep it in the description. Refusing would throw away animal-welfare reports
 * for an unbounded window.
 *
 * A RETIRED species is still accepted - deliberately unlike
 * category.service.isSelectable. The row exists, so the foreign key holds, and
 * recording the real species beats degrading it to "Other".
 *
 * @param {string} submittedName
 * @param {string} [submittedCategory] only consulted when the row has no category
 */
async function resolveSpecies(submittedName, submittedCategory) {
  const typed = String(submittedName || '').trim();
  const pick = String(submittedCategory || '').trim();
  const usablePick = CATEGORY_VALUES.includes(pick) ? pick : null;

  const select = { name: true, category: true, is_endangered: true, hazard: true };
  const row = typed
    ? await prisma.species.findUnique({ where: { name: typed }, select })
    : null;

  if (row) {
    return {
      name: row.name,
      // The row wins. A client-sent category is only a fallback for a row that
      // has none, which today means the Other sentinel alone.
      category: row.category || usablePick,
      is_endangered: row.is_endangered,
      hazard: row.hazard,
      unlisted: null,
    };
  }

  const other = await prisma.species.findUnique({ where: { name: OTHER_SPECIES }, select });
  if (!other) {
    // Unreachable through the app: seed.js creates this row and update()/retire()
    // both refuse to touch it. Reachable by deleting it in SQL, and the failure
    // would otherwise be a foreign-key error on an unrelated insert.
    throw new HttpError(500, `The species catalogue is missing its "${OTHER_SPECIES}" entry. Re-run the seed.`);
  }

  return {
    name: other.name,
    category: other.category || usablePick,
    is_endangered: other.is_endangered,
    hazard: other.hazard,
    unlisted: typed || null,
  };
}
```

- [ ] **Step 4: Export it**

```js
module.exports = {
  OTHER_SPECIES, PUBLIC_FIELDS, CATEGORY_VALUES,
  listActive, listAll, resolveSpecies,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/speciesResolution.test.js`
Expected: PASS (13 tests).

- [ ] **Step 6: Commit**

```bash
git status --short
git add backend/src/services/species.service.js backend/tests/speciesResolution.test.js
git commit -m "Derive a wildlife report's category and endangered status from the species" -- backend/src/services/species.service.js backend/tests/speciesResolution.test.js
```

---

## Task 5: Catalogue writes, with the guards that make it safe to hand over

**Files:**
- Modify: `backend/src/services/species.service.js`
- Modify: `backend/tests/species.service.test.js`

**Interfaces:**
- Consumes: `OTHER_SPECIES`, `CATEGORY_VALUES`, `prisma.species`, `writeAuditLog`.
- Produces: `createSpecies(adminId, input, ctx): Promise<row>`, `updateSpecies(adminId, id, input, ctx): Promise<row>`. Audit actions `SPECIES_CREATE`, `SPECIES_UPDATE`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/species.service.test.js`:

```js
describe('createSpecies', () => {
  test('creates an active species and writes an audit row', async () => {
    const { writeAuditLog } = require('../src/utils/audit');
    prisma.species.create.mockImplementation(({ data }) => Promise.resolve({ species_id: 7, ...data }));
    const row = await svc.createSpecies(3, { name: 'Luzon Hornbill', category: 'Bird', biome: 'Forest', indicator: 'Endemic' }, { ipAddress: '1.2.3.4' });
    expect(row.name).toBe('Luzon Hornbill');
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPECIES_CREATE', targetTable: 'Species', performedBy: 3,
    }));
  });

  test('refuses a duplicate name with 409, not a database error', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck' });
    await expect(svc.createSpecies(3, { name: 'Philippine Duck' }, {}))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('requires a name', async () => {
    await expect(svc.createSpecies(3, { name: '   ' }, {})).rejects.toMatchObject({ statusCode: 422 });
  });

  test('refuses a category outside the three', async () => {
    await expect(svc.createSpecies(3, { name: 'Frog', category: 'Amphibian' }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});

describe('updateSpecies', () => {
  beforeEach(() => {
    prisma.species.update.mockImplementation(({ data }) => Promise.resolve({ species_id: 1, ...data }));
  });

  test('updates editable fields', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    const row = await svc.updateSpecies(3, 1, { body_description: 'A duck.' }, {});
    expect(row.body_description).toBe('A duck.');
  });

  test('THE NAME IS NOT EDITABLE', async () => {
    // It is the foreign key every report stores, and it also appears in exported
    // PDFs and audit payloads that cannot be rewritten - a rename would silently
    // split one species' history in two. Retire and replace instead.
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    await svc.updateSpecies(3, 1, { name: 'Anas luzonica', body_description: 'x' }, {});
    expect(prisma.species.update.mock.calls[0][0].data.name).toBeUndefined();
  });

  test('refuses an update with nothing in it', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'X', is_active: true });
    await expect(svc.updateSpecies(3, 1, {}, {})).rejects.toMatchObject({ statusCode: 422 });
  });

  test('404s on a species that does not exist', async () => {
    prisma.species.findUnique.mockResolvedValue(null);
    await expect(svc.updateSpecies(3, 99, { body_description: 'x' }, {}))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('REFUSES TO RETIRE THE LAST ACTIVE SPECIES', async () => {
    // Residents would be left with an empty dropdown and no way to file
    // anything - discovered by a resident, not by the Admin who caused it.
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', is_active: true });
    prisma.species.count.mockResolvedValue(1);
    await expect(svc.updateSpecies(3, 1, { is_active: false }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('REFUSES TO RETIRE THE "Other" SENTINEL', async () => {
    // Review Focus 3. Retiring it removes the specify box from the form AND
    // resolveSpecies()'s only fallback, so every uncatalogued species would
    // start erroring - with nothing about the Admin's action to explain it.
    prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true });
    prisma.species.count.mockResolvedValue(11);
    await expect(svc.updateSpecies(3, 11, { is_active: false }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test('allows harmless edits to the "Other" row', async () => {
    // Its handling_note is real safety copy worth improving; only retiring it
    // and changing its endangered flag are refused.
    prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true });
    const row = await svc.updateSpecies(3, 11, { handling_note: 'Keep back.' }, {});
    expect(row.handling_note).toBe('Keep back.');
  });

  test('REFUSES to make the "Other" row non-endangered', async () => {
    // That flag is the fail-safe for every unidentified animal. Clearing it
    // would start publishing exact locations for exactly the reports we know
    // least about.
    prisma.species.findUnique.mockResolvedValue({ species_id: 11, name: 'Other', is_active: true });
    await expect(svc.updateSpecies(3, 11, { is_endangered: false }, {}))
      .rejects.toMatchObject({ statusCode: 422 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/species.service.test.js`
Expected: FAIL — `svc.createSpecies is not a function`.

- [ ] **Step 3: Implement the writes**

Append to `backend/src/services/species.service.js` before `module.exports`:

```js
const BIOME_VALUES = ['Forest', 'Freshwater', 'Lakeshore_Wetland', 'Agricultural', 'Urban', 'Cave'];
const INDICATOR_VALUES = ['Common', 'Native', 'Endemic', 'Near_Threatened', 'Vulnerable', 'Endangered', 'Critically_Endangered'];
const HAZARD_VALUES = ['None', 'Venomous', 'Aggressive', 'Disease_Risk', 'Powerful_Bite_Or_Talons'];

// A species NAME is displayed verbatim (it is a real common name, not an
// enum-shaped value like Illegal_Dumping), so it allows spaces and hyphens -
// unlike category.service's NAME_RE. It still cannot be blank or absurd.
function cleanName(value) {
  const name = String(value || '').trim();
  if (!name) throw new HttpError(422, 'A species name is required.');
  if (name.length > 200) throw new HttpError(422, 'Species name is too long.');
  return name;
}

function enumOrThrow(value, allowed, label) {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value).trim();
  if (!allowed.includes(v)) {
    throw new HttpError(422, `${label} must be one of: ${allowed.join(', ')}.`);
  }
  return v;
}

const text = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

async function createSpecies(adminId, input, ctx = {}) {
  const name = cleanName(input.name);

  const clash = await prisma.species.findUnique({ where: { name } });
  if (clash) throw new HttpError(409, 'A species with that name already exists.');

  const row = await prisma.species.create({
    data: {
      name,
      scientific_name: text(input.scientific_name),
      local_name: text(input.local_name),
      category: enumOrThrow(input.category, CATEGORY_VALUES, 'Category'),
      biome: enumOrThrow(input.biome, BIOME_VALUES, 'Biome'),
      indicator: enumOrThrow(input.indicator, INDICATOR_VALUES, 'Indicator'),
      hazard: enumOrThrow(input.hazard, HAZARD_VALUES, 'Hazard') || 'None',
      is_endangered: Boolean(input.is_endangered),
      body_description: text(input.body_description),
      handling_note: text(input.handling_note),
      sort_order: Number.isInteger(input.sort_order) ? input.sort_order : 0,
    },
  });

  await writeAuditLog({
    performedBy: adminId,
    action: 'SPECIES_CREATE',
    targetTable: 'Species',
    targetId: row.species_id,
    data: { name: row.name, category: row.category, is_endangered: row.is_endangered },
    ipAddress: ctx.ipAddress || null,
  });

  return row;
}

async function updateSpecies(adminId, id, input, ctx = {}) {
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) throw new HttpError(404, 'Species not found.');

  const existing = await prisma.species.findUnique({ where: { species_id: targetId } });
  if (!existing) throw new HttpError(404, 'Species not found.');

  const isSentinel = existing.name === OTHER_SPECIES;

  const data = {};
  // The name is deliberately NOT editable. It is the foreign key every report
  // stores; ON UPDATE CASCADE would rewrite those, but the name also appears in
  // exported PDFs and audit-log payloads that cannot be rewritten, so a rename
  // would silently split one species' history in two. Retire it and add a
  // replacement instead - that keeps both halves legible.
  if (input.scientific_name !== undefined) data.scientific_name = text(input.scientific_name);
  if (input.local_name !== undefined) data.local_name = text(input.local_name);
  if (input.category !== undefined) data.category = enumOrThrow(input.category, CATEGORY_VALUES, 'Category');
  if (input.biome !== undefined) data.biome = enumOrThrow(input.biome, BIOME_VALUES, 'Biome');
  if (input.indicator !== undefined) data.indicator = enumOrThrow(input.indicator, INDICATOR_VALUES, 'Indicator');
  if (input.hazard !== undefined) data.hazard = enumOrThrow(input.hazard, HAZARD_VALUES, 'Hazard') || 'None';
  if (input.is_endangered !== undefined) data.is_endangered = Boolean(input.is_endangered);
  if (input.body_description !== undefined) data.body_description = text(input.body_description);
  if (input.handling_note !== undefined) data.handling_note = text(input.handling_note);
  if (input.sort_order !== undefined) data.sort_order = Number(input.sort_order) || 0;
  if (input.is_active !== undefined) data.is_active = Boolean(input.is_active);

  if (Object.keys(data).length === 0) throw new HttpError(422, 'Nothing to change.');

  // THE SENTINEL'S TWO LOAD-BEARING PROPERTIES. Its name is what the specify box
  // and resolveSpecies()'s fallback key off, and its is_endangered = true is the
  // fail-safe for every unidentified animal. Both are refused explicitly, with a
  // message that says why, because nothing about the Admin's action would
  // otherwise explain the breakage that follows.
  if (isSentinel && data.is_active === false) {
    throw new HttpError(422, 'The "Other" entry cannot be retired. Residents need it to report an animal that is not in the catalogue.');
  }
  if (isSentinel && data.is_endangered === false) {
    throw new HttpError(422, 'The "Other" entry must stay marked endangered. It is what hides the location of an animal nobody has identified yet.');
  }

  // Retiring the last active species would leave the wildlife form with no
  // options and no way for a resident to file anything - refused rather than
  // discovered by a resident staring at an empty dropdown.
  if (data.is_active === false && existing.is_active) {
    const remaining = await prisma.species.count({ where: { is_active: true } });
    if (remaining <= 1) {
      throw new HttpError(422, 'This is the last active species. Add another one before retiring it.');
    }
  }

  const row = await prisma.species.update({ where: { species_id: targetId }, data });

  await writeAuditLog({
    performedBy: adminId,
    action: 'SPECIES_UPDATE',
    targetTable: 'Species',
    targetId: row.species_id,
    data: { name: row.name, changed: Object.keys(data) },
    ipAddress: ctx.ipAddress || null,
  });

  return row;
}
```

- [ ] **Step 4: Extend the exports**

```js
module.exports = {
  OTHER_SPECIES, PUBLIC_FIELDS, CATEGORY_VALUES, BIOME_VALUES, INDICATOR_VALUES, HAZARD_VALUES,
  listActive, listAll, resolveSpecies, createSpecies, updateSpecies,
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/species.service.test.js`
Expected: PASS (all describe blocks).

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git status --short
git commit -m "Let an Admin manage the species catalogue" -- backend/src/services/species.service.js backend/tests/species.service.test.js
```

---

## Task 6: Public `GET /species`

**Files:**
- Create: `backend/src/controllers/species.controller.js`
- Create: `backend/src/routes/species.routes.js`
- Modify: `backend/src/routes/index.js` (beside `:22`)
- Modify: `backend/tests/routing.test.js`

**Interfaces:**
- Consumes: `speciesService.listActive` (Task 3).
- Produces: `GET /api/v1/species` → `{ success: true, data: { species: [...] } }`, unauthenticated.

- [ ] **Step 1: Write the failing test**

Read `backend/tests/routing.test.js` first and match its style. Add this, which inspects the species router directly and the mount as source text — both deterministic, unlike matching a compiled Express path regexp:

```js
describe('public species route', () => {
  test('the species router exposes GET /', () => {
    const router = require('../src/routes/species.routes');
    const routes = router.stack
      .filter((l) => l.route)
      .map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);
    expect(routes).toContain('GET /');
  });

  test('IT IS MOUNTED, AND CARRIES NO authenticate MIDDLEWARE', () => {
    // The wildlife form reads it and so does the public species guide, which is
    // reachable without an account. A router.use(authenticate) added here later
    // would break the signed-out guide with a 401 - so the absence is asserted,
    // not just the presence of the mount.
    const fs = require('fs');
    const index = fs.readFileSync(require.resolve('../src/routes/index'), 'utf8');
    expect(index).toMatch(/router\.use\('\/species'/);
    const routeFile = fs.readFileSync(require.resolve('../src/routes/species.routes'), 'utf8');
    expect(routeFile).not.toMatch(/authenticate/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/routing.test.js`
Expected: FAIL — `Cannot find module '../src/routes/species.routes'`.

- [ ] **Step 3: Write the controller**

Create `backend/src/controllers/species.controller.js`:

```js
// Species catalogue controllers — thin HTTP layer over species.service.

const asyncHandler = require('../utils/asyncHandler');
const speciesService = require('../services/species.service');

// Public: the species a resident may pick on the wildlife form, and the content
// behind the public species guide. Zero personal data, so it is safe
// unauthenticated (R.A. 10173).
const listActive = asyncHandler(async (req, res) => {
  const data = await speciesService.listActive();
  res.status(200).json({ success: true, data });
});

module.exports = { listActive };
```

- [ ] **Step 4: Write the route**

Create `backend/src/routes/species.routes.js`:

```js
// Public wildlife species list — mounted at /api/v1/species.
// Backs the species picker on both report forms and the public species guide,
// which used to read a hardcoded array shipped in each client's bundle.

const express = require('express');
const router = express.Router();

const speciesController = require('../controllers/species.controller');

router.get('/', speciesController.listActive);

module.exports = router;
```

- [ ] **Step 5: Mount it**

In `backend/src/routes/index.js`, beside the `/categories` mount:

```js
router.use('/species', require('./species.routes'));
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest tests/routing.test.js`
Expected: PASS.

- [ ] **Step 7: Verify against the running server**

Start the backend, then:

```bash
curl -s http://localhost:5000/api/v1/species | head -c 400
```
Expected: `{"success":true,"data":{"species":[{"name":"Philippine Duck",...`. Confirm **no** `species_id`, `is_active`, `created_at` or `updated_at` appears — the allowlist in `PUBLIC_FIELDS` is what keeps them out.

- [ ] **Step 8: Commit**

```bash
git status --short
git add backend/src/controllers/species.controller.js backend/src/routes/species.routes.js
git commit -m "Serve the species catalogue to the report forms" -- backend/src/controllers/species.controller.js backend/src/routes/species.routes.js backend/src/routes/index.js backend/tests/routing.test.js
```

---

## Task 7: Admin species CRUD

**Files:**
- Create: `backend/src/validators/species.validators.js`
- Modify: `backend/src/controllers/admin.controller.js`
- Modify: `backend/src/routes/admin.routes.js` (beside the categories block at :38-42)

**Interfaces:**
- Consumes: `speciesService.listAll`, `.createSpecies`, `.updateSpecies` (Tasks 3, 5).
- Produces: `GET /api/v1/admin/species`, `POST /api/v1/admin/species`, `PATCH /api/v1/admin/species/:id`. All Admin-only (the router-level `authenticate, authorize('Admin')` at `admin.routes.js:14` covers them).

- [ ] **Step 1: Write the validators**

Create `backend/src/validators/species.validators.js`:

```js
// Admin species-catalogue validators.
//
// These are a FIRST pass only: species.service.js re-checks every enum and the
// name, because the service is also reached from the seed and from scripts. The
// duplication is deliberate - the validator gives a good 422 per field, the
// service guarantees the invariant.

const { body } = require('express-validator');
const {
  CATEGORY_VALUES, BIOME_VALUES, INDICATOR_VALUES, HAZARD_VALUES,
} = require('../services/species.service');

const optionalEnum = (field, values, label) =>
  body(field).optional({ values: 'falsy' }).trim().isIn(values)
    .withMessage(`${label} must be one of: ${values.join(', ')}.`);

const shared = [
  body('scientific_name').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('local_name').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  optionalEnum('category', CATEGORY_VALUES, 'Category'),
  optionalEnum('biome', BIOME_VALUES, 'Biome'),
  optionalEnum('indicator', INDICATOR_VALUES, 'Indicator'),
  optionalEnum('hazard', HAZARD_VALUES, 'Hazard'),
  body('is_endangered').optional().isBoolean().toBoolean(),
  body('body_description').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
  body('handling_note').optional({ values: 'falsy' }).trim().isLength({ max: 5000 }),
  body('sort_order').optional({ values: 'falsy' }).isInt({ min: 0, max: 9999 }).toInt(),
];

const createSpeciesRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('A species name is required.')
    .bail()
    .isLength({ max: 200 }).withMessage('Species name is too long.'),
  ...shared,
];

// `name` is absent on purpose - it is the foreign key reports store and is not
// editable. See the comment in species.service.updateSpecies.
const updateSpeciesRules = [
  ...shared,
  body('is_active').optional().isBoolean().toBoolean(),
];

module.exports = { createSpeciesRules, updateSpeciesRules };
```

- [ ] **Step 2: Add the controller handlers**

Append to `backend/src/controllers/admin.controller.js` (import `speciesService` at the top alongside the other services):

```js
// Species catalogue. The PUBLIC species cache on both clients is keyed per
// session, so a mutation here is only visible after that cache is invalidated -
// web/src/lib/api.js does that in adminApi.
const listSpecies = asyncHandler(async (req, res) => {
  const data = await speciesService.listAll();
  res.json({ success: true, data });
});

const createSpecies = asyncHandler(async (req, res) => {
  const species = await speciesService.createSpecies(req.user.user_id, req.body, { ipAddress: req.ip });
  res.status(201).json({ success: true, message: 'Species created.', data: { species } });
});

const updateSpecies = asyncHandler(async (req, res) => {
  const species = await speciesService.updateSpecies(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Species updated.', data: { species } });
});
```

Add all three to that file's `module.exports`.

- [ ] **Step 3: Add the routes**

In `backend/src/routes/admin.routes.js`, after the categories block:

```js
// Wildlife species catalogue — admin-managed, no redeploy. The report's
// category and endangered flag are derived from these rows, so editing one
// changes what NEW reports get; existing reports keep the snapshot they were
// filed with.
const sv = require('../validators/species.validators');
router.get('/species', controller.listSpecies);
router.post('/species', sv.createSpeciesRules, validate, controller.createSpecies);
router.patch('/species/:id', sv.updateSpeciesRules, validate, controller.updateSpecies);
```

Move the `require` to the top of the file with the other imports rather than leaving it inline.

- [ ] **Step 4: Verify the endpoints against the running server**

Sign in as an Admin (native DB: `admin@cenrowatch.local / AdminPass123` — **if the login fails, do not reset the password; check `User.updated_at` and ask**). Then:

```bash
# expect 11 rows, each with in_use
curl -s -b cookies.txt http://localhost:5000/api/v1/admin/species | head -c 300
# expect 422 naming the three categories
curl -s -b cookies.txt -X POST http://localhost:5000/api/v1/admin/species \
  -H 'Content-Type: application/json' -H 'x-requested-with: XMLHttpRequest' \
  -d '{"name":"Test Frog","category":"Amphibian"}'
```

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git status --short
git add backend/src/validators/species.validators.js
git commit -m "Add admin endpoints for the species catalogue" -- backend/src/validators/species.validators.js backend/src/controllers/admin.controller.js backend/src/routes/admin.routes.js
```

---

## Task 8: Species reference photo upload

**Files:**
- Modify: `backend/src/services/species.service.js`
- Modify: `backend/src/controllers/admin.controller.js`
- Modify: `backend/src/routes/admin.routes.js`
- Modify: `backend/tests/species.service.test.js`

**Interfaces:**
- Consumes: `diskUpload` from `src/middlewares/upload`, `storage.save`/`storage.remove` from `src/services/storage`.
- Produces: `setSpeciesPhoto(adminId, id, file, ctx): Promise<row>`; `POST /api/v1/admin/species/:id/photo` (multipart, field `photo`). Audit action `SPECIES_PHOTO_SET`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/species.service.test.js`. Add `jest.mock('../src/services/storage', ...)` near the other mocks at the top of the file:

```js
jest.mock('../src/services/storage', () => ({
  save: jest.fn(async () => '/uploads/species/new.jpg'),
  remove: jest.fn(async () => {}),
}));
```

```js
describe('setSpeciesPhoto', () => {
  const storage = require('../src/services/storage');
  const file = { originalname: 'duck.jpg', buffer: Buffer.from('x') };

  beforeEach(() => {
    prisma.species.update.mockImplementation(({ data }) => Promise.resolve({ species_id: 1, name: 'Philippine Duck', ...data }));
  });

  test('stores the file and records the path', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', photo_path: null });
    const row = await svc.setSpeciesPhoto(3, 1, file, {});
    expect(storage.save).toHaveBeenCalledWith('species', file);
    expect(row.photo_path).toBe('/uploads/species/new.jpg');
  });

  test('REMOVES THE PREVIOUS FILE so replacing a photo does not orphan bytes', async () => {
    // Species photos are replaced far more often than report evidence is, and
    // nothing else ever cleans this directory up.
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'Philippine Duck', photo_path: '/uploads/species/old.jpg' });
    await svc.setSpeciesPhoto(3, 1, file, {});
    expect(storage.remove).toHaveBeenCalledWith('/uploads/species/old.jpg');
  });

  test('does NOT remove anything when there was no previous photo', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'X', photo_path: null });
    await svc.setSpeciesPhoto(3, 1, file, {});
    expect(storage.remove).not.toHaveBeenCalled();
  });

  test('422s when no file was uploaded', async () => {
    prisma.species.findUnique.mockResolvedValue({ species_id: 1, name: 'X', photo_path: null });
    await expect(svc.setSpeciesPhoto(3, 1, null, {})).rejects.toMatchObject({ statusCode: 422 });
  });

  test('404s on an unknown species', async () => {
    prisma.species.findUnique.mockResolvedValue(null);
    await expect(svc.setSpeciesPhoto(3, 99, file, {})).rejects.toMatchObject({ statusCode: 404 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/species.service.test.js`
Expected: FAIL — `svc.setSpeciesPhoto is not a function`.

- [ ] **Step 3: Implement it**

Add `const storage = require('./storage');` to the imports of `species.service.js`, then append before `module.exports`:

```js
/**
 * Replace a species' reference photo.
 *
 * These are the "sample pictures" a resident matches the animal against, so
 * they are admin-uploaded rather than committed to the repo: it keeps a
 * licensing decision out of the codebase, lets CENRO add a species without a
 * redeploy, and means mobile can reach them (it cannot read web/public).
 *
 * Served through the existing signed /uploads route - no new access path.
 */
async function setSpeciesPhoto(adminId, id, file, ctx = {}) {
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) throw new HttpError(404, 'Species not found.');

  const existing = await prisma.species.findUnique({
    where: { species_id: targetId },
    select: { species_id: true, name: true, photo_path: true },
  });
  if (!existing) throw new HttpError(404, 'Species not found.');
  if (!file) throw new HttpError(422, 'Choose an image to upload.');

  const photo_path = await storage.save('species', file);
  const row = await prisma.species.update({
    where: { species_id: targetId },
    data: { photo_path },
  });

  // Best-effort, and AFTER the row points at the new file: if this throws we
  // have an orphaned file, whereas removing first would risk a species with no
  // photo at all. Nothing else cleans this directory up, so replacing a photo
  // ten times must not leave ten files behind.
  if (existing.photo_path) await storage.remove(existing.photo_path);

  await writeAuditLog({
    performedBy: adminId,
    action: 'SPECIES_PHOTO_SET',
    targetTable: 'Species',
    targetId: row.species_id,
    data: { name: row.name, photo_path },
    ipAddress: ctx.ipAddress || null,
  });

  return row;
}
```

Add `setSpeciesPhoto` to the exports.

- [ ] **Step 4: Wire the controller and route**

Controller, in `admin.controller.js`:

```js
const setSpeciesPhoto = asyncHandler(async (req, res) => {
  const species = await speciesService.setSpeciesPhoto(req.user.user_id, req.params.id, req.file, { ipAddress: req.ip });
  res.json({ success: true, message: 'Species photo updated.', data: { species } });
});
```

Route, in `admin.routes.js` — multer first so the multipart body is parsed, matching the walk-in complaint route:

```js
const { diskUpload } = require('../middlewares/upload');
const speciesUpload = diskUpload('species'); // IMAGE_MIME by default; magic-byte sniffed
router.post('/species/:id/photo', speciesUpload.single('photo'), controller.setSpeciesPhoto);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/species.service.test.js`
Expected: PASS.

- [ ] **Step 6: Verify a real upload end to end**

Upload a small JPEG as Admin, then confirm `photo_path` appears in `GET /api/v1/species` and that the file renders through a **signed** `/uploads` link (a bare path must 403 — that is the security model, see the note in `local.driver.js`).

- [ ] **Step 7: Run the full suite and commit**

Run: `npm test`

```bash
git status --short  # confirm backend/uploads/ is NOT staged
git commit -m "Let an Admin upload a reference photo per species" -- backend/src/services/species.service.js backend/src/controllers/admin.controller.js backend/src/routes/admin.routes.js backend/tests/species.service.test.js
```

---

## Task 9: Wildlife reports derive their own category and status

The behaviour change. After this, a client cannot set either value.

**Files:**
- Modify: `backend/src/services/wildlife.service.js` (`createTurnover`, currently around :58-135)
- Modify: `backend/src/validators/wildlife.validators.js` (:16-19 `species_category`, :26-28 `is_endangered`)
- Modify: `backend/tests/speciesResolution.test.js`

**Interfaces:**
- Consumes: `resolveSpecies` (Task 4), `isOtherCategory`/`withOtherDetail` conventions from `web/src/lib/otherCategory.js`.
- Produces: no new exports. `createTurnover(userId, input, photoPath, ctx)` keeps its signature; `input.species_category` and `input.is_endangered` are no longer read.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/speciesResolution.test.js`. This needs the service's own mocks, so add a second file-level describe with its own `jest.mock` calls — or, simpler, create the mocks at the top of the file alongside the existing `prisma` mock:

```js
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));
jest.mock('../src/utils/notify', () => ({ notifyReportSubmitted: jest.fn() }));
jest.mock('../src/utils/sla', () => ({
  getSlaMinutes: jest.fn(async () => 3218),
  computeSlaDeadline: jest.fn(async () => new Date('2026-10-08T09:00:00Z')),
}));
jest.mock('../src/utils/createSequential', () => ({
  createSequential: jest.fn(async ({ data }) => ({ turnover_id: 1, reference_id: 'WLD-2026-00001', ...data })),
}));
```

Extend the `prisma` mock to include `barangay` and `user`:

```js
jest.mock('../src/utils/prisma', () => ({
  species: { findUnique: jest.fn() },
  barangay: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
}));
```

```js
describe('createTurnover uses the catalogue, not the client', () => {
  const { createSequential } = require('../src/utils/createSequential');
  const { createTurnover } = require('../src/services/wildlife.service');

  const base = {
    barangay_id: 1,
    species_name: 'Philippine Cobra',
    animal_condition: 'Healthy',
    description: 'Seen in the rice field behind the barangay hall.',
    latitude: 14.2756,
    longitude: 121.1289,
  };

  beforeEach(() => {
    prisma.barangay.findUnique.mockResolvedValue({ barangay_id: 1, name: 'Pulo' });
    prisma.user.findUnique.mockResolvedValue({ email: 'r@example.com', first_name: 'Ana' });
    catalogue([COBRA, DUCK, OTHER]);
  });

  const written = () => createSequential.mock.calls[0][0].data;

  test('IGNORES a client-sent species_category', async () => {
    // Review Focus 2. The old web bundle posts this field, and it must be
    // ignored rather than rejected - a 422 here would break the live site for
    // the window between the API deploy and the web deploy.
    await createTurnover(7, { ...base, species_category: 'Bird' }, null, {});
    expect(written().species_category).toBe('Reptile');
  });

  test('IGNORES a client-sent is_endangered', async () => {
    // Same window, and this one is a privacy control: a resident must not be
    // able to decide whether a rescue site is hidden from a poacher.
    await createTurnover(7, { ...base, is_endangered: true }, null, {});
    expect(written().is_endangered).toBe(false);
    expect(written().is_priority_review).toBe(false);
    expect(written().status).toBe('Pending_Review');
  });

  test('a catalogued endangered species is promoted to priority review', async () => {
    await createTurnover(7, { ...base, species_name: 'Philippine Duck' }, null, {});
    expect(written().is_endangered).toBe(true);
    expect(written().is_priority_review).toBe(true);
    expect(written().status).toBe('Priority_Review');
  });

  test('an uncatalogued species lands as Other, at priority review', async () => {
    await createTurnover(7, { ...base, species_name: 'Sea turtle' }, null, {});
    expect(written().species_name).toBe('Other');
    expect(written().status).toBe('Priority_Review');
  });

  test('KEEPS the typed species name, as the first line of the description', async () => {
    // Mirrors withOtherDetail() in otherCategory.js. Without this the species a
    // resident actually saw is lost, and the report reads as "Other" with no
    // indication of what was reported.
    await createTurnover(7, { ...base, species_name: 'Sea turtle' }, null, {});
    expect(written().description).toBe(`Other: Sea turtle\n\n${base.description}`);
  });

  test('does not double-prefix when the client already folded it in', async () => {
    // The new clients fold the typed name in themselves and post
    // species_name: 'Other', so the row IS found and nothing is added here.
    const desc = 'Other: Sea turtle\n\nSeen near the lakeshore.';
    await createTurnover(7, { ...base, species_name: 'Other', description: desc }, null, {});
    expect(written().description).toBe(desc);
  });

  test('never exceeds the 5000-character description limit', async () => {
    // The folded line has to fit inside the same cap the validator enforces, or
    // the insert fails on a column length after validation already passed.
    await createTurnover(7, { ...base, species_name: 'S'.repeat(200), description: 'd'.repeat(4990) }, null, {});
    expect(written().description.length).toBeLessThanOrEqual(5000);
  });

  test('stores the resident-picked category for an Other report', async () => {
    await createTurnover(7, { ...base, species_name: 'Other', species_category: 'Reptile' }, null, {});
    expect(written().species_category).toBe('Reptile');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest tests/speciesResolution.test.js`
Expected: FAIL — `species_category` is `'Bird'`, the client's value.

- [ ] **Step 3: Rewrite the species handling in `createTurnover`**

In `backend/src/services/wildlife.service.js`, add the import and replace the `endangered` line and the four `data` fields:

```js
const { resolveSpecies } = require('./species.service');

// Same cap the validator enforces and the column allows.
const DESCRIPTION_MAX = 5000;

// Keep an uncatalogued species name in the report, as the description's first
// line, so it is the first thing staff read. Mirrors withOtherDetail() in
// otherCategory.js, which does the same for an "Other" complaint type.
//
// This runs only for a client that posted a name the catalogue does not have -
// an APK built before the catalogue existed. The current clients fold the line
// in themselves and post species_name: 'Other', so nothing is added twice.
function foldUnlistedSpecies(description, unlisted) {
  if (!unlisted) return description;
  const folded = `Other: ${unlisted}\n\n${description}`;
  return folded.length <= DESCRIPTION_MAX ? folded : folded.slice(0, DESCRIPTION_MAX);
}
```

Inside `createTurnover`, replace `const endangered = !!input.is_endangered;` with:

```js
  // THE CATEGORY AND THE ENDANGERED FLAG ARE DERIVED, NEVER READ FROM THE BODY.
  // Both used to come from the client - a free-text category box and a
  // self-declared "I believe this is endangered" checkbox - which made "three
  // exclusive categories" untrue and left a privacy control (public-map
  // obfuscation) in the reporter's hands. input.species_category is now only a
  // fallback for a species row that has no category, which today means the
  // "Other" sentinel alone; input.is_endangered is ignored entirely.
  const species = await resolveSpecies(input.species_name, input.species_category);
  const endangered = species.is_endangered;
```

Then in the `data` object:

```js
      species_name: species.name,
      species_category: species.category,
      is_endangered: endangered,
      is_priority_review: endangered,
      description: foldUnlistedSpecies(input.description, species.unlisted),
```

- [ ] **Step 4: Relax the validators so an old client is ignored, not rejected**

In `backend/src/validators/wildlife.validators.js`, replace the `species_category` and `is_endangered` rules:

```js
  // ONLY a fallback for a species with no category of its own (the "Other"
  // sentinel). For every catalogued species the row wins and this is ignored -
  // see resolveSpecies. Kept deliberately LENIENT rather than .isIn(...): an
  // old web bundle still posts whatever the resident typed into the category
  // box it used to show, and 422ing that would break the live site for the
  // window between the API deploy and the web deploy. The service drops
  // anything that is not one of the three.
  body('species_category')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }),
  // is_endangered IS NO LONGER ACCEPTED. It is derived from the species row,
  // because it drives public-map coordinate obfuscation and a reporter must not
  // decide whether a rescue site is hidden. There is no rule here on purpose:
  // express-validator ignores unknown fields, so an old client sending it is
  // silently ignored rather than refused. DO NOT "restore" this rule.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/speciesResolution.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. `wildlifeModule.test.js` asserts the endangered promotion — if it stubs `is_endangered` through the input, update it to stub the species row instead, and say so in its comment.

- [ ] **Step 7: Verify live, then commit**

File one wildlife report through the running API with `species_name=Philippine Cobra`, `species_category=Bird`, `is_endangered=true`. Read the row back with a temporary `.mjs` script and confirm `species_category = 'Reptile'` and `is_endangered = 0`. **Delete the script**, and clean up the report by its captured id only.

```bash
git status --short
git commit -m "Derive a wildlife report's category and priority from the species catalogue" -- backend/src/services/wildlife.service.js backend/src/validators/wildlife.validators.js backend/tests/speciesResolution.test.js
```

---

## Task 10: Staff can correct a wrongly-flagged species

An `Other` report is endangered by default, so staff need a way to downgrade it. Changing a privacy control gets its own audit action.

**Files:**
- Modify: `backend/src/services/staff.wildlife.service.js` (`updateTurnover`, at :196)
- Modify: `backend/src/validators/staff.validators.js` (`wildlifeUpdateRules` at :79-82)
- Create: `backend/tests/wildlifeEndangeredOverride.test.js`

**Interfaces:**
- Consumes: `prisma.wildlifeTurnover`, `writeAuditLog`.
- Produces: `PATCH /api/v1/staff/wildlife/:id` accepts `is_endangered`. Audit action `WILDLIFE_ENDANGERED_OVERRIDE`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/wildlifeEndangeredOverride.test.js`:

```js
// Staff correcting a wildlife report's endangered flag.
//
// WHY THIS EXISTS. An animal nobody could identify is filed against the "Other"
// species, which is marked endangered so its location is obfuscated on the
// public map - the fail-safe. Most of those turn out to be common animals, so
// without a downgrade the public map would slowly fill with fuzzed points for
// pigeons.
//
// It gets its OWN audit action rather than riding along in WILDLIFE_UPDATE,
// because this flag is a privacy control: "who un-hid this rescue site, and
// when" has to be answerable from the log without reading a diff of note fields.

jest.mock('../src/utils/prisma', () => ({
  wildlifeTurnover: { findFirst: jest.fn(), update: jest.fn() },
}));
jest.mock('../src/utils/audit', () => ({ writeAuditLog: jest.fn() }));

const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const svc = require('../src/services/staff.wildlife.service');

const ROW = {
  turnover_id: 4, reference_id: 'WLD-2026-00004', is_endangered: true,
  archived_at: null, status: 'Priority_Review',
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.wildlifeTurnover.findFirst.mockResolvedValue(ROW);
  prisma.wildlifeTurnover.update.mockImplementation(({ data }) => Promise.resolve({ ...ROW, ...data }));
});

test('a staff member can clear the flag', async () => {
  const out = await svc.updateTurnover(9, 'WLD-2026-00004', { is_endangered: false }, {});
  expect(out.is_endangered).toBe(false);
});

test('WRITES ITS OWN AUDIT ACTION, naming the direction of the change', async () => {
  await svc.updateTurnover(9, 'WLD-2026-00004', { is_endangered: false }, { ipAddress: '1.2.3.4' });
  expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action: 'WILDLIFE_ENDANGERED_OVERRIDE',
    performedBy: 9,
    data: expect.objectContaining({ from: true, to: false }),
  }));
});

test('does NOT write the override action when the flag was not touched', async () => {
  await svc.updateTurnover(9, 'WLD-2026-00004', { staff_notes: 'Called the reporter.' }, {});
  const actions = writeAuditLog.mock.calls.map((c) => c[0].action);
  expect(actions).not.toContain('WILDLIFE_ENDANGERED_OVERRIDE');
});

test('does NOT write it when the value is unchanged', async () => {
  await svc.updateTurnover(9, 'WLD-2026-00004', { is_endangered: true }, {});
  const actions = writeAuditLog.mock.calls.map((c) => c[0].action);
  expect(actions).not.toContain('WILDLIFE_ENDANGERED_OVERRIDE');
});

test('keeps is_priority_review in step with the flag', async () => {
  // They are set together at intake, so letting them drift apart would leave a
  // report in the priority queue with nothing explaining why.
  await svc.updateTurnover(9, 'WLD-2026-00004', { is_endangered: false }, {});
  expect(prisma.wildlifeTurnover.update.mock.calls[0][0].data.is_priority_review).toBe(false);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest tests/wildlifeEndangeredOverride.test.js`
Expected: FAIL — `is_endangered` is not applied by `updateTurnover`.

- [ ] **Step 3: Add the rule to the validator**

In `backend/src/validators/staff.validators.js`, inside `wildlifeUpdateRules`:

```js
  // Staff correcting the derived flag. An unidentified animal is filed against
  // the "Other" species and is endangered by default (the fail-safe), so most
  // of these are downgrades after someone looked at the photo.
  body('is_endangered').optional().isBoolean().toBoolean(),
```

- [ ] **Step 4: Apply it in the service**

In `staff.wildlife.service.js` `updateTurnover` (:196), ensure its `findFirst` select includes `is_endangered` and `reference_id`, then:

```js
  // This flag decides whether gis.service.js fuzzes the report's coordinates on
  // the PUBLIC map, so it is a privacy control rather than a data field. It gets
  // its own audit action for that reason: "who un-hid this rescue site" must be
  // answerable from the log directly.
  const flagChanged =
    input.is_endangered !== undefined && Boolean(input.is_endangered) !== existing.is_endangered;
  if (input.is_endangered !== undefined) {
    data.is_endangered = Boolean(input.is_endangered);
    // Kept in step: the two are set together at intake, and letting them drift
    // would leave a report in the priority queue with nothing explaining why.
    data.is_priority_review = Boolean(input.is_endangered);
  }
```

After the update, alongside the existing audit call:

```js
  if (flagChanged) {
    await writeAuditLog({
      performedBy: staffId,
      action: 'WILDLIFE_ENDANGERED_OVERRIDE',
      targetTable: 'WildlifeTurnover',
      targetId: existing.turnover_id,
      data: {
        reference_id: existing.reference_id,
        from: existing.is_endangered,
        to: Boolean(input.is_endangered),
      },
      ipAddress: ctx.ipAddress || null,
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest tests/wildlifeEndangeredOverride.test.js`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`

```bash
git status --short
git add backend/tests/wildlifeEndangeredOverride.test.js
git commit -m "Let staff correct a wildlife report's endangered flag" -- backend/tests/wildlifeEndangeredOverride.test.js backend/src/services/staff.wildlife.service.js backend/src/validators/staff.validators.js
```

---

## Task 11: The foreign key and the category enum

Two migrations that touch existing data. **Audit before either.**

**Files:**
- Create: `backend/scripts/audit-species-names.mjs`
- Modify: `backend/prisma/schema.prisma`
- Create: two migrations

**Interfaces:**
- Consumes: the populated catalogue (Task 2), `resolveSpecies` guaranteeing new rows are valid (Task 9).
- Produces: `WildlifeTurnover.species` relation; `species_category` typed `SpeciesCategory?`.

- [ ] **Step 1: Write the audit script**

Create `backend/scripts/audit-species-names.mjs`:

```js
// Pre-migration audit. Reports which values already in WildlifeTurnover have no
// home in the new schema, BEFORE a migration that would fail or silently
// corrupt them.
//
// Two questions:
//   1. Which species_name values have no Species row? Each one blocks the
//      foreign key. Fix by adding an INACTIVE Species row per name - that
//      preserves history without offering it on new forms. Never edit a
//      historical species_name.
//   2. Which species_category values are outside Bird/Mammal/Reptile? The old
//      column was free text with an editable input, so anything is possible.
//      Each becomes NULL rather than a guessed enum value.
//
// RUN THIS ON ALL THREE DATABASES - native 3306, Docker 3307, Railway. They hold
// different data, and the Docker one has previously been found missing rows
// entirely.

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CATEGORIES = ['Bird', 'Mammal', 'Reptile'];

const turnovers = await prisma.wildlifeTurnover.findMany({
  select: { turnover_id: true, reference_id: true, species_name: true, species_category: true },
});
const known = new Set((await prisma.species.findMany({ select: { name: true } })).map((s) => s.name));

const orphanNames = new Map();
const badCategories = new Map();
for (const t of turnovers) {
  if (!known.has(t.species_name)) {
    if (!orphanNames.has(t.species_name)) orphanNames.set(t.species_name, []);
    orphanNames.get(t.species_name).push(t.reference_id);
  }
  const c = t.species_category;
  if (c && !CATEGORIES.includes(c)) {
    if (!badCategories.has(c)) badCategories.set(c, []);
    badCategories.get(c).push(t.reference_id);
  }
}

console.log(`Reports: ${turnovers.length}   Catalogue rows: ${known.size}`);
console.log(`\n1. species_name values with NO catalogue row: ${orphanNames.size}`);
for (const [name, refs] of orphanNames) {
  console.log(`   ${JSON.stringify(name)}  (${refs.length}): ${refs.slice(0, 5).join(', ')}${refs.length > 5 ? ' …' : ''}`);
}
if (orphanNames.size) {
  console.log('\n   Add each as an INACTIVE species before adding the foreign key:');
  for (const name of orphanNames.keys()) {
    console.log(`   await prisma.species.create({ data: { name: ${JSON.stringify(name)}, is_active: false, is_endangered: true } });`);
  }
}

console.log(`\n2. species_category values outside ${CATEGORIES.join('/')}: ${badCategories.size}`);
for (const [cat, refs] of badCategories) {
  console.log(`   ${JSON.stringify(cat)}  (${refs.length}): ${refs.slice(0, 5).join(', ')}${refs.length > 5 ? ' …' : ''}`);
}

console.log(orphanNames.size === 0 ? '\nSafe to add the foreign key.' : '\nFOREIGN KEY WILL FAIL. Resolve item 1 first.');
await prisma.$disconnect();
```

- [ ] **Step 2: Run the audit**

```bash
node scripts/audit-species-names.mjs
```
Expected: a list. **Do not continue until item 1 reports zero.**

- [ ] **Step 3: Backfill any orphan names as inactive species**

Using the `create` lines the script printed. `is_endangered: true` on each, because an unreviewed historical name is exactly the unknown case the fail-safe exists for. **Do not edit any historical `species_name`.**

- [ ] **Step 4: Re-run the audit to confirm item 1 is zero**

```bash
node scripts/audit-species-names.mjs
```
Expected: `Safe to add the foreign key.`

- [ ] **Step 5: Add the relation to the schema**

In `WildlifeTurnover`:

```prisma
  // REQUIRED relation, exactly like Complaint.type: the scalar FK field is
  // required, so the relation must be too. Restrict, so a species with reports
  // against it cannot be deleted and make that history unreadable.
  //
  // Free text never reaches this column - resolveSpecies maps an unrecognised
  // name onto the seeded "Other" row and keeps what was typed in the
  // description. That is what makes a required key safe here.
  species Species @relation(fields: [species_name], references: [name], onUpdate: Cascade, onDelete: Restrict)
```

- [ ] **Step 6: Generate, fix casing, test, apply**

```bash
npx prisma migrate dev --name wildlife_species_fk --create-only
# fix table names to PascalCase in the generated .sql
npx jest tests/migrationCasing.test.js   # must PASS before applying
npx prisma migrate dev
```

- [ ] **Step 7: Change `species_category` to the enum**

```prisma
  species_category SpeciesCategory?
```

- [ ] **Step 8: Generate the second migration and hand-write the safe conversion**

```bash
npx prisma migrate dev --name wildlife_species_category_enum --create-only
```

Prisma will emit a `MODIFY COLUMN`. Edit the generated SQL so any value outside the three becomes `NULL` **before** the type changes — a wrong enum value is worse than a missing one, and MySQL would otherwise coerce or reject:

```sql
-- Free text from the old editable Category input. Anything that is not one of
-- the three enum values is cleared rather than guessed: NULL is honest and staff
-- can set it, a wrong category is silently wrong forever.
UPDATE `WildlifeTurnover`
   SET `species_category` = NULL
 WHERE `species_category` IS NOT NULL
   AND `species_category` NOT IN ('Bird', 'Mammal', 'Reptile');

ALTER TABLE `WildlifeTurnover`
  MODIFY `species_category` ENUM('Bird', 'Mammal', 'Reptile') NULL;
```

- [ ] **Step 9: Verify casing, apply, and confirm nothing was lost**

```bash
npx jest tests/migrationCasing.test.js
npx prisma migrate dev
node scripts/audit-species-names.mjs
```
Expected: both audit counts zero.

- [ ] **Step 10: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git status --short
git add backend/scripts/audit-species-names.mjs backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "Tie wildlife reports to the species catalogue" -- backend/scripts/audit-species-names.mjs backend/prisma/schema.prisma backend/prisma/migrations
```

> **Deploy note for whoever ships this.** Run the audit against Railway and the Docker database and backfill there too, **before** deploying these two migrations. `prisma migrate status` does not surface checksum drift, so a clean status is not evidence the databases agree — hash the migration files to check.

---

## Task 12: Web — the species API with a session cache

**Files:**
- Modify: `web/src/lib/api.js` (cache block at :164-204; `adminApi` at :290+)

**Interfaces:**
- Consumes: `GET /species`, `GET/POST/PATCH /admin/species` (Tasks 6, 7, 8).
- Produces: `speciesApi.list()`, `speciesApi.invalidate()`; `adminApi.listSpecies()`, `.createSpecies(payload)`, `.updateSpecies(id, payload)`, `.setSpeciesPhoto(id, formData)` — every mutation invalidating the public cache.

- [ ] **Step 1: Add the cached public reader**

Beside `categoriesPromise`:

```js
let speciesPromise = null;
```

Beside `categoryApi`:

```js
// Active wildlife species for the report form and the public species guide.
// Public: the response carries zero personal data (R.A. 10173).
export const speciesApi = {
  list: () => {
    if (!speciesPromise) {
      speciesPromise = apiFetch('/species', { auth: false }).catch((err) => {
        speciesPromise = null;
        throw err;
      });
    }
    return speciesPromise;
  },
  invalidate: () => { speciesPromise = null; },
};
```

- [ ] **Step 2: Add the admin methods, each invalidating the public cache**

Inside `adminApi`, following the shape the category mutations already use:

```js
  // Wildlife species catalogue. Every mutation invalidates the PUBLIC species
  // cache, or a species an Admin just retired keeps appearing in the wildlife
  // form for the rest of the session - and a photo they just uploaded does not.
  listSpecies: () => apiFetch('/admin/species'),
  createSpecies: (payload) =>
    apiFetch('/admin/species', { method: 'POST', body: payload }).then((r) => {
      speciesApi.invalidate();
      return r;
    }),
  updateSpecies: (id, payload) =>
    apiFetch(`/admin/species/${id}`, { method: 'PATCH', body: payload }).then((r) => {
      speciesApi.invalidate();
      return r;
    }),
  // FormData, so apiFetch must not set a JSON Content-Type - the same path the
  // report forms already use for a photo.
  setSpeciesPhoto: (id, form) =>
    apiFetch(`/admin/species/${id}/photo`, { method: 'POST', body: form }).then((r) => {
      speciesApi.invalidate();
      return r;
    }),
```

- [ ] **Step 3: Verify the build**

Run: `npm run build` in `web/`
Expected: clean. **Remember this does not catch an undefined JSX identifier** — esbuild does not scope-analyse them, which is how `AnonymousReportPage` shipped a crash.

- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "Add the species API to the web client" -- web/src/lib/api.js
```

---

## Task 13: Web — the `useSpecies` hook

**Files:**
- Create: `web/src/lib/useSpecies.js`

**Interfaces:**
- Consumes: `speciesApi.list()` (Task 12).
- Produces: `useSpecies(): { common: Species[], endangered: Species[], byName: Record<string, Species>, other: Species|null, loading: boolean, error: string }`. `Species` is a row from `PUBLIC_FIELDS`.

- [ ] **Step 1: Write the hook**

Create `web/src/lib/useSpecies.js`:

```js
import { useEffect, useMemo, useState } from 'react';
import { speciesApi } from '@/lib/api';

// The wildlife species catalogue, split for the two-group picker.
//
// This used to be a frozen array in web/src/lib/species.js - rich content that
// only the public education page could see, while the report form read a
// separate, barer copy on mobile. One source now serves both, and an Admin
// adding a species changes what residents see with nothing rebuilt.
//
// The split is by `is_endangered`, which is ALSO the column that drives
// public-map coordinate obfuscation. One source of truth on purpose: the group a
// resident sees and the privacy control applied to their report cannot disagree.
//
// `Other` is separated out because it is a sentinel, not a species: it belongs at
// the end of the picker, never inside either group.
const OTHER_NAME = 'Other';

export function useSpecies() {
  const [state, setState] = useState({ rows: [], loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    speciesApi
      .list()
      .then((r) => {
        if (!cancelled) setState({ rows: r.data.species || [], loading: false, error: '' });
      })
      .catch((e) => {
        // A picker with no options cannot be submitted, so the failure has to be
        // visible rather than presented as an empty dropdown.
        if (!cancelled) {
          setState({ rows: [], loading: false, error: e.message || 'Could not load the species list.' });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const real = state.rows.filter((s) => s.name !== OTHER_NAME);
    return {
      common: real.filter((s) => !s.is_endangered),
      endangered: real.filter((s) => s.is_endangered),
      other: state.rows.find((s) => s.name === OTHER_NAME) || null,
      byName: Object.fromEntries(state.rows.map((s) => [s.name, s])),
      loading: state.loading,
      error: state.error,
    };
  }, [state]);
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git status --short
git add web/src/lib/useSpecies.js
git commit -m "Add a web hook for the species catalogue" -- web/src/lib/useSpecies.js
```

---

## Task 14: Web — the admin species screen

**Files:**
- Create: `web/src/pages/admin/AdminSpeciesPage.jsx`
- Modify: `web/src/App.jsx` (beside `:128`)
- Modify: `web/src/pages/admin/AdminCategoriesPage.jsx` (add the link)

**Interfaces:**
- Consumes: `adminApi.listSpecies/createSpecies/updateSpecies/setSpeciesPhoto` (Task 12).
- Produces: route `/admin/species`.

- [ ] **Step 1: Build the page**

Create `web/src/pages/admin/AdminSpeciesPage.jsx`. **Follow the layout, state shape and inline-edit pattern of `web/src/pages/admin/AdminCategoriesPage.jsx` (289 lines) — read it first and mirror it**, so the two admin reference-data screens behave identically.

Required specifics:

```jsx
// Admin-managed wildlife species catalogue.
//
// Reached from the Categories page rather than the sidebar: AdminLayout's
// navItems already holds ten entries against a measured ~1203px of a 1280px
// header (see the note in AdminLayout.jsx), and an eleventh would overflow. The
// two screens are the same kind of thing - reference data an Admin edits without
// a redeploy - so they sit together.

const CATEGORIES = ['Bird', 'Mammal', 'Reptile'];
const BIOMES = ['Forest', 'Freshwater', 'Lakeshore_Wetland', 'Agricultural', 'Urban', 'Cave'];
const INDICATORS = ['Common', 'Native', 'Endemic', 'Near_Threatened', 'Vulnerable', 'Endangered', 'Critically_Endangered'];
const HAZARDS = ['None', 'Venomous', 'Aggressive', 'Disease_Risk', 'Powerful_Bite_Or_Talons'];
```

- The table lists name, category, biome, indicator, hazard, endangered, `in_use`, active.
- **Wrap the table in `<div className="overflow-x-auto">` between the `Card` and the `<table>`.** Every table in this app shipped inside `<Card className="overflow-hidden">`, which crops it invisibly on a phone with no way to scroll. Verify at 375px.
- Inline edit per row for every field except `name`, which is read-only with the tooltip *"The name is the key reports are stored under and cannot be changed. Retire this species and add a replacement instead."*
- A create form with `name` + the four selects + the two text areas.
- A photo upload button per row posting `FormData` with field `photo`, showing the current photo as a thumbnail through the signed URL.
- **The `Other` row renders with its retire toggle and endangered toggle disabled**, and the note *"This entry is what lets a resident report an animal that is not in the list. It stays active and stays marked endangered."* The server refuses both anyway (Task 5); this stops an Admin discovering that through an error.
- Surface `err.message` from the API directly — the service's 409/422 messages are written to be shown.

The data layer, which is the part that must not be improvised:

```jsx
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    adminApi.listSpecies()
      .then((r) => { setRows(r.data.species || []); setError(''); })
      .catch((e) => setError(e.message || 'Could not load the species catalogue.'));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // One handler for every field, so a row edit is a PATCH of just what changed.
  // adminApi.updateSpecies invalidates the PUBLIC species cache, which is what
  // stops a species retired here lingering in the wildlife form for the rest of
  // the session.
  async function saveField(species_id, patch) {
    setBusy(true);
    try {
      await adminApi.updateSpecies(species_id, patch);
      reload();
      setError('');
    } catch (e) {
      // The service writes these messages to be read by an Admin - the
      // last-active-species and "Other" refusals in particular explain WHY.
      setError(e.message || 'Could not update the species.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(species_id, file) {
    const fd = new FormData();
    fd.append('photo', file);
    setBusy(true);
    try {
      await adminApi.setSpeciesPhoto(species_id, fd);
      reload();
    } catch (e) {
      setError(e.message || 'Could not upload the photo.');
    } finally {
      setBusy(false);
    }
  }
```

The sentinel guard in the row renderer:

```jsx
  const isSentinel = row.name === 'Other';
  // Disabled rather than hidden, with the reason stated. The server refuses both
  // of these anyway, but an Admin should not have to discover that through an
  // error message.
  <Switch checked={row.is_active} disabled={isSentinel || busy} onCheckedChange={(v) => saveField(row.species_id, { is_active: v })} />
  <Switch checked={row.is_endangered} disabled={isSentinel || busy} onCheckedChange={(v) => saveField(row.species_id, { is_endangered: v })} />
```

If `web/src/components/ui/` has no `Switch`, use the existing `Checkbox` primitive instead — do not add a new shadcn component for this.

- [ ] **Step 2: Add the route**

In `web/src/App.jsx`, in the Admin group beside `/admin/categories`:

```jsx
        <Route path="/admin/species" element={<AdminSpeciesPage />} />
```

- [ ] **Step 3: Link it from the Categories page**

Add a link near the heading of `AdminCategoriesPage.jsx`:

```jsx
<Link to="/admin/species" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
  Wildlife species catalogue
</Link>
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 5: Exercise it in a browser**

Sign in as Admin. Create a species, edit it, retire it, upload a photo. Confirm the `Other` row's two toggles are disabled. **Resize to 375px and confirm the table scrolls sideways and no column is unreachable.** Check the console for a `ReferenceError` on every path, including the create form — a build does not catch an unimported component.

- [ ] **Step 6: Commit**

```bash
git status --short
git add web/src/pages/admin/AdminSpeciesPage.jsx
git commit -m "Add an admin screen for the species catalogue" -- web/src/pages/admin/AdminSpeciesPage.jsx web/src/App.jsx web/src/pages/admin/AdminCategoriesPage.jsx
```

---

## Task 15: Web — the resident wildlife form

**Files:**
- Modify: `web/src/pages/resident/WildlifeFormPage.jsx` (species block at :117-145; endangered checkbox at :169-172; submit at :77-82)

**Interfaces:**
- Consumes: `useSpecies()` (Task 13), `isOtherCategory`/`withOtherDetail` from `web/src/lib/otherCategory.js`.
- Produces: no exports. Posts `species_name` (a catalogue name or `Other`), `species_category` (only when the species has none), and **no** `is_endangered`.

- [ ] **Step 1: Wire the hook and derive the species state the rest of this task uses**

Add the imports and these derivations near the top of the component. Every later step references them.

```jsx
import { Input } from '@/components/ui/input';
import { humanize } from '@/lib/reports';
import { useSpecies } from '@/lib/useSpecies';
import { withOtherDetail, OTHER_DETAIL_MAX } from '@/lib/otherCategory';
```

```jsx
  const {
    common, endangered, byName,
    loading, error: speciesError,
  } = useSpecies();

  // The picked catalogue row, or null. `speciesChoice` already exists on this
  // page; it now holds a catalogue NAME or the literal 'Other'.
  const selected = byName[speciesChoice] || null;
  const isOther = speciesChoice === 'Other';

  // What the resident types when the animal is not in the list. It is NOT
  // posted as species_name - that is a foreign key - it becomes the
  // description's first line instead. See step 6.
  const [otherDetail, setOtherDetail] = useState('');
```

Remove `is_endangered` from the `form` state object while you are here; step 5 deletes its only consumer.

- [ ] **Step 2: Replace the species picker with two groups**

```jsx
      <FormField
        id="species_choice"
        label="Species"
        hint={FORM_TL.species_name}
        error={fieldErrors.species_name}
      >
        {speciesError ? (
          // A picker with no options cannot be submitted, so this is stated
          // rather than shown as an empty dropdown.
          <p className="text-sm text-destructive">{speciesError}</p>
        ) : (
          <Select id="species_choice" value={speciesChoice} onChange={onSpeciesChoice}>
            <option value="">{loading ? 'Loading species…' : 'Select a species'}</option>
            {common.length > 0 && (
              <optgroup label="Common species">
                {common.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </optgroup>
            )}
            {endangered.length > 0 && (
              <optgroup label="Endangered or protected species">
                {endangered.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </optgroup>
            )}
            <option value="Other">Other (not in this list)…</option>
          </Select>
        )}
      </FormField>
```

- [ ] **Step 3: Add the identification block, shown once a species is picked**

```jsx
      {selected && selected.name !== 'Other' && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          {selected.photo_path && (
            <img
              src={selected.photo_path}
              alt={`Reference photograph of a ${selected.name}`}
              className="mb-2 h-40 w-full rounded-md object-cover"
            />
          )}
          <p className="font-medium">
            {selected.name}
            {selected.scientific_name && <span className="ml-1 font-normal italic text-muted-foreground">{selected.scientific_name}</span>}
          </p>
          {selected.local_name && <p className="text-muted-foreground">Also called &ldquo;{selected.local_name}&rdquo;</p>}
          {selected.body_description && <p className="mt-1">{selected.body_description}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            {[
              selected.category,
              selected.biome && `Usually found in: ${humanize(selected.biome)}`,
              selected.indicator && humanize(selected.indicator),
            ].filter(Boolean).join(' · ')}
          </p>
          {selected.is_endangered && (
            <p className="mt-2 text-xs font-medium text-amber-700">
              Protected species. This report goes to priority review, and its exact location is
              hidden on the public map.
            </p>
          )}
        </div>
      )}
```

- [ ] **Step 4: Replace the free-text Category input with a read-only confirmation**

```jsx
      {/* READ-ONLY, not hidden. The server derives this from the species, so an
          editable box would be a lie - but a resident should still be able to
          notice they picked the wrong animal. The only case where a human picks
          is "Other", which has no category of its own. */}
      {selected && selected.category && (
        <FormField id="species_category" label="Category">
          <p className="rounded-md border bg-muted px-3 py-2 text-sm">
            {selected.category}
            <span className="ml-2 text-xs text-muted-foreground">Set automatically from the species you selected.</span>
          </p>
        </FormField>
      )}

      {isOther && (
        <FormField id="species_name" label="What kind of animal is it?" error={fieldErrors.species_category}>
          <Select id="species_category" value={form.species_category} onChange={set('species_category')}>
            <option value="">Select one</option>
            <option value="Bird">Bird</option>
            <option value="Mammal">Mammal</option>
            <option value="Reptile">Reptile</option>
          </Select>
        </FormField>
      )}

      {isOther && (
        <FormField id="species_other" label="Species name (if you know it)">
          <Input
            id="species_other"
            placeholder="e.g. Sea turtle, Tarsier"
            maxLength={OTHER_DETAIL_MAX}
            value={otherDetail}
            onChange={(e) => setOtherDetail(e.target.value)}
          />
        </FormField>
      )}
```

Import `Input` explicitly. `AnonymousReportPage` shipped a live crash from a missing `Input` import and neither the build nor any test caught it.

- [ ] **Step 5: Delete the endangered checkbox**

Remove the `<label>` block at :169-172 and `is_endangered` from the form state. Leave a comment in its place:

```jsx
      {/* The "I believe this is an endangered species" checkbox is GONE. It is
          derived from the species catalogue now: it drives public-map coordinate
          obfuscation, and a reporter must not decide whether a rescue site is
          hidden from a poacher. The server ignores the field if anything still
          sends it. */}
```

- [ ] **Step 6: Fold the typed species name into the description on submit**

```jsx
    // Mirrors the "Other" complaint type: species_name is a foreign key, so what
    // the resident typed cannot go in it. It becomes the description's first
    // line instead, where it is the first thing staff read.
    fd.append('species_name', isOther ? 'Other' : form.species_name);
    if (isOther && form.species_category) fd.append('species_category', form.species_category);
    fd.append('description', isOther ? withOtherDetail(form.description, otherDetail) : form.description);
    // is_endangered is deliberately NOT sent.
```

- [ ] **Step 7: Update `validate()`**

```jsx
  function validate() {
    const errs = {};
    if (!speciesChoice) errs.species_name = 'Select a species.';
    // Required only for "Other", which has no category of its own. The three
    // options are a question a resident who saw the animal can answer.
    if (isOther && !form.species_category) {
      errs.species_category = 'Tell us whether it is a bird, mammal or reptile.';
    }
    // The typed species name is deliberately NOT required. A resident who cannot
    // identify the animal is exactly who "Other" exists for, and demanding a
    // name would push them into guessing - which is worse than "Other" for both
    // the record and the staff reading it.
    if (!form.animal_condition) errs.animal_condition = 'Select the animal condition.';
    if (!form.barangay_id) errs.barangay_id = 'Please select a barangay.';
    if (!form.description.trim()) errs.description = 'Description is required.';
    if (location.latitude == null || location.longitude == null) {
      errs.location = 'Pin the location on the map.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }
```

Keep whatever description length rule the page already has; only the species clauses change.

- [ ] **Step 8: Verify the build, then exercise it**

Run: `npm run build`

In a browser as a verified resident: pick a common species (confirm the read-only category and the photo), pick an endangered one (confirm the obfuscation notice), pick **Other** (confirm both extra fields render with **no console `ReferenceError`**), submit each, and confirm in the database that `species_category` and `is_endangered` match the catalogue and not anything the client chose. Re-check at 375px.

**Then stop the backend and reload the form.** Review Focus 5: the species error must be visible text, never an empty dropdown — a picker with no options cannot be submitted, and it reads as a broken app rather than a server that is down. There is no web test runner, so this manual check is the only thing covering it.

- [ ] **Step 9: Commit**

```bash
git status --short
git commit -m "Group the species picker and derive the category on the web form" -- web/src/pages/resident/WildlifeFormPage.jsx
```

---

## Task 16: Web — the public species guide reads the API

**Files:**
- Modify: `web/src/pages/public/WildlifePage.jsx` (:4 import, :14 credits, :60 guidance, :88 grid)
- Delete: `web/src/lib/species.js`

**Interfaces:**
- Consumes: `useSpecies()` (Task 13).
- Produces: nothing. `FIELD_GUIDANCE` and `CONSERVATION_TONE` move into this page; `SPECIES` is gone.

- [ ] **Step 1: Move `FIELD_GUIDANCE` and re-key `CONSERVATION_TONE`**

`FIELD_GUIDANCE` is static editorial copy with one consumer, so it moves into `WildlifePage.jsx` verbatim. `CONSERVATION_TONE` re-keys from the old display strings onto the seven `SpeciesIndicator` values:

```jsx
// Keyed on SpeciesIndicator. The old map keyed on display strings and included
// 'Caution: Venomous', which conflated conservation standing with danger - those
// are separate fields now (indicator and hazard), because a Reticulated Python
// is Native but dangerous and a Philippine Duck is Vulnerable but harmless.
const INDICATOR_TONE = {
  Common: { bg: 'bg-slate-100', fg: 'text-slate-700' },
  Native: { bg: 'bg-emerald-100', fg: 'text-emerald-800' },
  Endemic: { bg: 'bg-purple-100', fg: 'text-purple-800' },
  Near_Threatened: { bg: 'bg-orange-100', fg: 'text-orange-800' },
  Vulnerable: { bg: 'bg-amber-100', fg: 'text-amber-800' },
  Endangered: { bg: 'bg-red-100', fg: 'text-red-800' },
  Critically_Endangered: { bg: 'bg-red-200', fg: 'text-red-900' },
};

const HAZARD_TONE = { bg: 'bg-red-100', fg: 'text-red-800' };
```

- [ ] **Step 2: Fetch instead of import**

Replace the `SPECIES` import with `useSpecies()`. Build the grid from `common.concat(endangered)` — **never include `other`**, which is a sentinel and not an animal. Derive credits from the fetched rows:

```jsx
const credits = rows.filter((s) => s.photo_path && s.photo_credit)
  .map((s) => ({ name: s.name, credit: s.photo_credit }));
```

- [ ] **Step 3: Keep the zero-photo and error paths working**

The page must render correctly when **every** species has `photo_path: null` — photos are admin-uploaded, so that is the state on a fresh install, and the old file's own comment required the text-only fallback. Show `error` as visible text and render a loading state; never an empty page that looks broken.

- [ ] **Step 4: Delete the old module**

```bash
git rm web/src/lib/species.js
```

- [ ] **Step 5: Confirm nothing still imports it**

```bash
grep -rn "lib/species" web/src/ || echo "no importers remain"
```
Expected: `no importers remain`. A `grep` against a path that does not exist exits non-zero exactly like "no match", so check the output, not the exit code.

- [ ] **Step 6: Verify the build and the page**

Run: `npm run build`
Then open `/wildlife` signed out: species render from the API, badges are coloured, credits list only photographed species, and the page is correct with no photos uploaded.

- [ ] **Step 7: Commit**

```bash
git status --short
git commit -m "Read the public species guide from the catalogue" -- web/src/pages/public/WildlifePage.jsx web/src/lib/species.js
```

---

## Task 17: Mobile — grouped options in `Select`

**Files:**
- Modify: `mobile/src/components/Select.js` (`renderItem` at :17-33)

**Interfaces:**
- Consumes: nothing.
- Produces: `Select` accepts option entries of the shape `{ header: true, label: string }`, rendered as non-pressable section headings. `{ value, label }` entries behave exactly as before. Three other call sites depend on that: `AnonymousReportScreen.js`, `ComplaintFormScreen.js`, `RequestFormScreen.js`.

- [ ] **Step 1: Add header support to `renderItem`**

```js
  // Section headings, so one list can show "Common species" and "Endangered or
  // protected species" as separate groups - web gets this free from <optgroup>.
  // A header entry is { header: true, label }: not pressable, no value, and
  // skipped by the selected-option lookup below.
  const renderItem = useCallback(({ item }) => {
    if (item.header) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.label}</Text>
        </View>
      );
    }
    const active = String(item.value) === String(value);
    return (
      <Pressable
        accessibilityRole="button"
        style={[styles.option, active && styles.optionActive]}
        onPress={() => {
          onChange(item.value);
          setOpen(false);
        }}
      >
        <Text style={[styles.optionText, active && styles.optionTextActive]}>
          {item.label}
        </Text>
      </Pressable>
    );
  }, [value, onChange]);
```

- [ ] **Step 2: Keep the selected lookup and keys header-safe**

```js
  // `header` entries have no value, so they must not be able to match - a
  // header whose label equalled the value would otherwise show as selected.
  const selected = options.find((o) => !o.header && String(o.value) === String(value));
```

If the `FlatList` uses `keyExtractor`, make it header-safe: `(item, i) => (item.header ? `h-${i}` : String(item.value))`.

- [ ] **Step 3: Add the styles**

```js
  sectionHeader: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  sectionHeaderText: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, color: colors.placeholder,
  },
```

- [ ] **Step 4: Verify the bundle and the three existing call sites**

Run: `npx expo export --platform android`
Expected: clean. This catches import and JSX errors a web build would not.

Then in Expo Go, open the complaint, request and anonymous forms and confirm their pickers are unchanged — none of them passes a header, so all three must behave exactly as before.

- [ ] **Step 5: Commit**

```bash
git status --short
git commit -m "Let the mobile picker show grouped options" -- mobile/src/components/Select.js
```

---

## Task 18: Mobile — species fetch and hook

**Files:**
- Modify: `mobile/src/api/client.js` (cache block at :142-159)
- Create: `mobile/src/lib/useSpecies.js`
- Modify: `mobile/src/lib/reports.js` (remove `WILDLIFE_SPECIES` at :21-33)

**Interfaces:**
- Consumes: `GET /species` (Task 6).
- Produces: `api.species()`; `useSpecies()` returning `{ common, endangered, other, byName, loading, error }` — the same shape as the web hook so the two can be diffed.

- [ ] **Step 1: Add the cached fetch to `api/client.js`**

Beside `categoriesPromise`, add `let speciesPromise = null;`, then inside `api`:

```js
  // Wildlife species catalogue. Tokenless: the endpoint is public and carries
  // zero personal data, and the public species guide reads it too.
  species: () => {
    if (!speciesPromise) {
      speciesPromise = request('/species').catch((err) => {
        speciesPromise = null;
        throw err;
      });
    }
    return speciesPromise;
  },
```

- [ ] **Step 2: Write the hook**

Create `mobile/src/lib/useSpecies.js`:

```js
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

// The wildlife species catalogue, split for the two-group picker.
//
// DUPLICATE IN SPIRIT of web/src/lib/useSpecies.js - mobile cannot import from
// web/src (see AGENTS.md) - and deliberately the SAME return shape, so the two
// can be diffed for drift. The difference is the fetch, which goes through
// api/client.js.
//
// This replaces WILDLIFE_SPECIES, a hardcoded array compiled into the app
// bundle: adding a species used to need an app release. It comes from the API
// now, so the app picks one up on its next launch.
//
// The split is by `is_endangered`, which is ALSO the column that drives
// public-map coordinate obfuscation - one source of truth, so the group a
// resident sees and the privacy control applied cannot disagree.
const OTHER_NAME = 'Other';

export default function useSpecies() {
  const [state, setState] = useState({ rows: [], loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    api
      .species()
      .then((r) => {
        if (!cancelled) setState({ rows: r.data.species || [], loading: false, error: '' });
      })
      .catch((e) => {
        // A picker with no options cannot be submitted, so this has to be
        // visible rather than looking like an empty list.
        if (!cancelled) {
          setState({ rows: [], loading: false, error: e.message || 'Could not load the species list.' });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const real = state.rows.filter((s) => s.name !== OTHER_NAME);
    return {
      common: real.filter((s) => !s.is_endangered),
      endangered: real.filter((s) => s.is_endangered),
      other: state.rows.find((s) => s.name === OTHER_NAME) || null,
      byName: Object.fromEntries(state.rows.map((s) => [s.name, s])),
      loading: state.loading,
      error: state.error,
    };
  }, [state]);
}
```

- [ ] **Step 3: Remove the hardcoded list**

Delete `WILDLIFE_SPECIES` from `mobile/src/lib/reports.js` and leave a pointer:

```js
// WILDLIFE_SPECIES has been REMOVED. Species come from GET /species now (see
// lib/useSpecies.js), so adding one no longer needs an app release, and the
// category and endangered flag are derived server-side from the catalogue rather
// than from this array's `group` field and a resident's checkbox.
```

- [ ] **Step 4: Confirm nothing still imports it**

```bash
grep -rn "WILDLIFE_SPECIES" mobile/src/ || echo "no importers remain"
```
Expected: `no importers remain`.

- [ ] **Step 5: Verify the bundle and commit**

Run: `npx expo export --platform android` and `npm test`
Expected: both clean.

```bash
git status --short
git add mobile/src/lib/useSpecies.js
git commit -m "Fetch the species catalogue in the mobile app" -- mobile/src/lib/useSpecies.js mobile/src/api/client.js mobile/src/lib/reports.js
```

---

## Task 19: Mobile — the wildlife form

**Files:**
- Modify: `mobile/src/screens/resident/WildlifeFormScreen.js` (state :20-36, `onSpeciesChoice` :40-53, `validate` :56-60, submit :73-74, picker :115-142, checkbox :178)

**Interfaces:**
- Consumes: `useSpecies()` (Task 18), grouped `Select` (Task 17), `withOtherDetail`/`OTHER_DETAIL_MAX` from `mobile/src/lib/otherCategory.js`.
- Produces: nothing. Posts the same fields as the web form and **no** `is_endangered`.

- [ ] **Step 1: Build the grouped options**

```js
  const { common, endangered, loading: speciesLoading, error: speciesError, byName } = useSpecies();

  // One flat list with header entries, which the Select renders as
  // non-pressable section headings (web gets this from <optgroup>).
  const speciesOptions = useMemo(() => {
    const out = [];
    if (common.length) {
      out.push({ header: true, label: 'Common species' });
      out.push(...common.map((s) => ({ value: s.name, label: s.name })));
    }
    if (endangered.length) {
      out.push({ header: true, label: 'Endangered or protected species' });
      out.push(...endangered.map((s) => ({ value: s.name, label: s.name })));
    }
    out.push({ value: 'Other', label: 'Other (not in this list)…' });
    return out;
  }, [common, endangered]);

  const selected = byName[speciesChoice] || null;
  const isOther = speciesChoice === 'Other';
```

- [ ] **Step 2: Replace `onSpeciesChoice`**

The old version copied `sp.group` into a `species_category` field the server no longer trusts. It becomes a plain setter:

```js
  // No category copying any more - the server derives it from the catalogue.
  // The only category a human picks is the 3-way one shown for "Other", which
  // has no category of its own.
  function onSpeciesChoice(v) {
    setSpeciesChoice(v);
    setForm((f) => ({ ...f, species_category: '' }));
    setOtherDetail('');
  }
```

- [ ] **Step 3: Render the picker, error state and identification block**

```jsx
      {speciesError ? (
        <Field label="Species">
          <Text style={{ color: colors.danger }}>{speciesError}</Text>
        </Field>
      ) : (
        <Select
          label="Species"
          hint={FORM_TL.species_name}
          options={speciesOptions}
          value={speciesChoice}
          onChange={onSpeciesChoice}
          placeholder={speciesLoading ? 'Loading species…' : 'Select a species'}
          error={fieldErrors.species_name}
        />
      )}

      {selected && !isOther && (
        <View style={styles.idCard}>
          {selected.photo_path ? (
            <Image
              source={{ uri: selected.photo_path }}
              style={styles.idPhoto}
              accessibilityLabel={`Reference photograph of a ${selected.name}`}
            />
          ) : null}
          <Text style={styles.idName}>{selected.name}</Text>
          {selected.scientific_name ? <Text style={styles.idSci}>{selected.scientific_name}</Text> : null}
          {selected.local_name ? <Text style={styles.idMeta}>Also called “{selected.local_name}”</Text> : null}
          {selected.body_description ? <Text style={styles.idBody}>{selected.body_description}</Text> : null}
          <Text style={styles.idMeta}>
            {[selected.category, selected.biome && humanize(selected.biome), selected.indicator && humanize(selected.indicator)]
              .filter(Boolean).join(' · ')}
          </Text>
          {selected.is_endangered ? (
            <Text style={styles.idProtected}>
              Protected species. This report goes to priority review, and its exact location is hidden
              on the public map.
            </Text>
          ) : null}
        </View>
      )}
```

- [ ] **Step 4: Read-only category, plus the two "Other" fields**

```jsx
      {selected && selected.category ? (
        <Field label="Category" hint="Set automatically from the species you selected.">
          <Text style={styles.readOnly}>{selected.category}</Text>
        </Field>
      ) : null}

      {isOther ? (
        <Select
          label="What kind of animal is it?"
          options={[
            { value: 'Bird', label: 'Bird' },
            { value: 'Mammal', label: 'Mammal' },
            { value: 'Reptile', label: 'Reptile' },
          ]}
          value={form.species_category}
          onChange={set('species_category')}
          placeholder="Select one"
          error={fieldErrors.species_category}
        />
      ) : null}

      {isOther ? (
        <Field label="Species name (if you know it)">
          <TextInput
            style={styles.input}
            placeholder="e.g. Sea turtle, Tarsier"
            placeholderTextColor={colors.placeholder}
            maxLength={OTHER_DETAIL_MAX}
            value={otherDetail}
            onChangeText={setOtherDetail}
          />
        </Field>
      ) : null}
```

- [ ] **Step 5: Delete the endangered checkbox and stop sending the field**

Remove the `<Checkbox>` block at :178 and `is_endangered` from the form state. Drop the `Checkbox` import if nothing else on the screen uses it. Leave the same explanatory comment the web form carries.

Submit becomes:

```js
    fd.append('species_name', isOther ? 'Other' : speciesChoice);
    if (isOther && form.species_category) fd.append('species_category', form.species_category);
    fd.append('description', isOther ? withOtherDetail(form.description, otherDetail) : form.description);
    // is_endangered is deliberately NOT sent - derived from the catalogue.
```

- [ ] **Step 6: Update `validate()`**

```js
  function validate() {
    const e = {};
    if (!speciesChoice) e.species_name = 'Select a species.';
    // Required only for "Other", which has no category of its own.
    if (isOther && !form.species_category) {
      e.species_category = 'Tell us whether it is a bird, mammal or reptile.';
    }
    // The typed species name is deliberately NOT required - see the web form.
    if (!form.animal_condition) e.animal_condition = 'Select the animal condition.';
    if (!form.barangay_id) e.barangay_id = 'Please select a barangay.';
    if (!form.description.trim()) e.description = 'Description is required.';
    if (location.latitude == null || location.longitude == null) {
      e.location = 'Pin the location on the map.';
    }
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  }
```

The old `validate()` checked `form.species_name.trim()`; that field is gone, replaced by `speciesChoice`.

- [ ] **Step 7: Verify the bundle and test on a device**

Run: `npx expo export --platform android` and `npm test`

Then in **Expo Go on the SDK 56 build** against the LAN API: both groups and their headings appear and headings are not tappable; the identification card renders with and without a photo; **Other** shows both extra fields; a submitted report lands with the catalogue's category and endangered flag; and killing the API shows the species error instead of an empty picker.

- [ ] **Step 8: Commit**

```bash
git status --short
git commit -m "Group the species picker and derive the category on the mobile form" -- mobile/src/screens/resident/WildlifeFormScreen.js
```

> **Before publishing the OTA:** run `eas fingerprint:compare --build-id <id>`. CRLF silently turns a successful `eas update` into one that reaches nobody, with no error — check bytes with `tr -cd '\r' | wc -c`, never `grep`. Then `eas update --channel preview --message "..." --environment preview`.

---

## Task 20: Staff detail — the control that reaches the override

Task 10 added the API. Without this, nothing can call it, and every `Other` report stays endangered forever — which would slowly fill the public map with fuzzed points for pigeons.

**Files:**
- Modify: `web/src/pages/staff/WildlifeDetailPage.jsx` (endangered badge at :47, summary row at :56, an update call in the shape of :119)

**Interfaces:**
- Consumes: `staffApi.wildlife.update(id, body)` — **already exists** via `staffResource` at `api.js:259`. No API-layer change.
- Produces: nothing.

- [ ] **Step 1: Add the correction control to the summary card**

Place it beside the existing Endangered row, not buried in a modal — this is a one-click correction staff make while looking at the photo.

```jsx
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState('');

  // Correcting the DERIVED endangered flag. An animal nobody could identify is
  // filed against the "Other" species, which is marked endangered so its
  // location is fuzzed on the public map - the fail-safe. Most turn out to be
  // common, so without this the map fills with hidden points for nothing.
  //
  // The server writes WILDLIFE_ENDANGERED_OVERRIDE for this, separately from a
  // general update, because it changes what the public can see.
  async function setEndangered(next) {
    setFlagBusy(true);
    try {
      await staffApi.wildlife.update(id, { is_endangered: next });
      setFlagError('');
      load();
    } catch (e) {
      setFlagError(e.message || 'Could not update the endangered flag.');
    } finally {
      setFlagBusy(false);
    }
  }
```

```jsx
      <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">
        <p className="font-medium">
          {w.is_endangered ? 'Treated as endangered' : 'Not treated as endangered'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {w.is_endangered
            ? "This report is in priority review and its exact location is hidden on the public map. An animal reported as “Other” starts here until someone confirms what it is."
            : 'This report shows its exact location on the public map.'}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={flagBusy}
          onClick={() => setEndangered(!w.is_endangered)}
        >
          {w.is_endangered ? 'Not an endangered species' : 'Mark as endangered'}
        </Button>
        {flagError && <p className="mt-2 text-xs text-destructive">{flagError}</p>}
      </div>
```

- [ ] **Step 2: Verify the build**

Run: `npm run build` in `web/`
Expected: clean. Confirm `Button` is imported on the page; if not, add it.

- [ ] **Step 3: Exercise it against the running API**

As staff, open an `Other` report. Confirm it reads "Treated as endangered", click the button, and confirm the card flips and the public GIS endpoint now returns that report's **exact** coordinates (it returned fuzzed ones before). Click back and confirm they are fuzzed again. Then check `/admin/audit-logs` shows **two** `WILDLIFE_ENDANGERED_OVERRIDE` rows with `from`/`to` in opposite directions.

- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "Let staff correct a wildlife report's endangered flag from the detail page" -- web/src/pages/staff/WildlifeDetailPage.jsx
```

---

## Done when

1. `cd backend && npm test` — green, including the three new suites.
2. `cd web && npm run build` — clean. It cannot catch an undefined JSX identifier; the browser passes in Tasks 14, 15 and 16 are what cover that.
3. `cd mobile && npx expo export --platform android && npm test` — clean.
4. `node backend/scripts/audit-species-names.mjs` — both counts zero, on **each** of the three databases.
5. A resident files a common species (exact location on the public map), an endangered one (fuzzed), and an `Other` (fuzzed, typed name as the description's first line) — and none of the three can be influenced by a tampered request body.
6. An Admin creates, edits, retires and photographs a species, and cannot retire or un-endanger `Other`.
6a. Staff downgrade an `Other` report from the detail page, its public coordinates become exact, and `WILDLIFE_ENDANGERED_OVERRIDE` appears in the audit log.
7. `/wildlife` renders signed out with zero photos uploaded.
8. `grep -rn "lib/species" web/src/` and `grep -rn "WILDLIFE_SPECIES" mobile/src/` both print nothing.
