// Guard against the migration bug that has now bitten this project twice.
//
// Prisma generates migration SQL using the table names it reads from the
// DATABASE. On a Windows MySQL install, which is case-insensitive, it reads
// them back lowercase - so `prisma migrate dev` emits
// "ALTER TABLE `complaint`" even though the model is `Complaint`. That runs
// fine on the machine that generated it and HARD-FAILS on the Linux container
// with "Table 'cenrowatch_db.complaint' doesn't exist".
//
// Three migrations shipped with this bug and silently never applied in Docker
// (fixed in commit fc6f264); the working-days SLA migration was generated with
// it too and corrected before being applied. It is not a one-off mistake, it is
// what the tool does here every time, so it needs a permanent check rather than
// a habit.
//
// AFTER GENERATING ANY MIGRATION: run the suite. If this fails, fix the casing
// in the .sql file BEFORE applying it. Once a migration has been applied,
// editing it breaks its _prisma_migrations checksum.

const fs = require('fs');
const path = require('path');

const PRISMA_DIR = path.join(__dirname, '..', 'prisma');
const MIGRATIONS_DIR = path.join(PRISMA_DIR, 'migrations');

// Model names are the authoritative table names: this schema declares no @@map,
// so Prisma uses the model name verbatim.
function modelNames() {
  const schema = fs.readFileSync(path.join(PRISMA_DIR, 'schema.prisma'), 'utf8');
  expect(schema).not.toMatch(/@@map\s*\(/); // if this ever changes, so must this test
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
}

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((d) => fs.existsSync(path.join(MIGRATIONS_DIR, d, 'migration.sql')))
    .map((d) => ({ name: d, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, d, 'migration.sql'), 'utf8') }));
}

describe('migration SQL uses the same table casing as the Prisma models', () => {
  const models = modelNames();
  const files = migrationFiles();

  test('the schema declares models and migrations exist', () => {
    expect(models.length).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files.map((f) => [f.name, f.sql]))('%s', (_name, sql) => {
    // Every backtick-quoted identifier that names a known table, in the
    // positions where a table name can appear.
    const refs = [...sql.matchAll(/\b(?:ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|INSERT\s+INTO|UPDATE|REFERENCES|TABLE\s+IF\s+NOT\s+EXISTS)\s+`([^`]+)`/gi)]
      .map((m) => m[1]);

    const wrong = [];
    for (const ref of refs) {
      const match = models.find((m) => m.toLowerCase() === ref.toLowerCase());
      // Ignore identifiers that are not models at all (e.g. _prisma_migrations).
      if (match && match !== ref) wrong.push(`${ref} should be ${match}`);
    }

    // Named explicitly so a failure says what to change, not just that it failed.
    expect(wrong).toEqual([]);
  });
});
