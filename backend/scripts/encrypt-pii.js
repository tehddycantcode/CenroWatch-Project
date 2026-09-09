#!/usr/bin/env node
// Encrypts the personal fields that were written before field encryption
// existed. Widening the columns (migration 20260910093000) made room for the
// ciphertext; this puts the existing rows into it.
//
//   npm run encrypt-pii              dry run - reports what would change
//   npm run encrypt-pii -- --apply   performs the writes
//
// WHY THIS NEEDS ITS OWN PRISMA CLIENT
// src/utils/prisma.js is wrapped in the encryption extension, so reading a row
// through it ALWAYS yields plaintext - whether the stored bytes are plaintext or
// ciphertext. That view is exactly right for the application and useless here:
// this script's whole job is to tell those two states apart. So it opens an
// unextended client to see what is physically stored, and writes back through
// the extended one so the encryption happens through the same code path the app
// uses. Two clients, each doing the thing it is the right tool for.
//
// SAFETY PROPERTIES:
//  - Idempotent. A row already carrying the "enc:v1:" envelope is skipped, and
//    encrypt() is itself a no-op on an already-encrypted value, so a second run
//    (or a crash halfway through a first) cannot double-encrypt anything.
//  - Every write is by primary key. No updateMany, no predicate.
//  - Values are printed MASKED. A backfill log that prints the phone numbers it
//    is protecting, into a terminal and a scrollback buffer, would defeat the
//    exercise.
//  - One audit row recording which rows and which columns - never the values.
//
// NOTE: there is no reverse script, on purpose. Decryption needs only the key,
// which the app already has; a "decrypt everything back to plaintext" tool is a
// liability sitting in the repo.

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = require('../src/utils/prisma'); // extended: writes encrypt
const raw = new PrismaClient(); //              unextended: reads show stored bytes
const { writeAuditLog } = require('../src/utils/audit');
const { isEncrypted, isConfigured } = require('../src/utils/crypto.util');

const APPLY = process.argv.includes('--apply');

// model accessor -> { id column, columns to encrypt, label for the report }
const TARGETS = [
  { model: 'user', idField: 'user_id', label: 'User', fields: ['contact_number'] },
  {
    model: 'complaint',
    idField: 'complaint_id',
    label: 'Complaint',
    fields: ['reporter_name', 'reporter_contact', 'address_details'],
  },
  {
    model: 'wildlifeTurnover',
    idField: 'turnover_id',
    label: 'WildlifeTurnover',
    fields: ['address_details'],
  },
];

// "09171234567" -> "09*********7". Enough to recognise a row you are looking at,
// not enough to be a leak if this scrolls past someone.
function mask(value) {
  if (typeof value !== 'string' || value.length === 0) return '-';
  if (value.length <= 3) return '*'.repeat(value.length);
  return value.slice(0, 2) + '*'.repeat(Math.max(1, value.length - 3)) + value.slice(-1);
}

(async () => {
  if (!isConfigured()) {
    console.error(
      '\n  FIELD_ENCRYPTION_KEY is not set, so there is nothing to encrypt WITH.\n' +
        '  Add it to backend/.env first. Generate one with:\n' +
        '    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n'
    );
    process.exitCode = 1;
    await Promise.all([prisma.$disconnect(), raw.$disconnect()]);
    return;
  }

  const planned = [];
  let alreadyDone = 0;

  for (const target of TARGETS) {
    const select = { [target.idField]: true };
    for (const f of target.fields) select[f] = true;

    const rows = await raw[target.model].findMany({ select });

    for (const row of rows) {
      const data = {};
      const columns = [];

      for (const field of target.fields) {
        const value = row[field];
        if (value === null || value === undefined || value === '') continue;
        if (isEncrypted(value)) {
          alreadyDone += 1;
          continue;
        }
        // Assigning the PLAINTEXT here is correct: the write goes through the
        // extended client, which encrypts on the way past.
        data[field] = value;
        columns.push({ field, masked: mask(value) });
      }

      if (columns.length) {
        planned.push({ target, id: row[target.idField], data, columns });
      }
    }
  }

  console.log('\n  ENCRYPT PERSONAL FIELDS AT REST\n');

  if (!planned.length) {
    console.log(
      alreadyDone
        ? `  Nothing to do - all ${alreadyDone} populated value(s) are already encrypted.\n`
        : '  Nothing to do - no populated values found in the target columns.\n'
    );
    await Promise.all([prisma.$disconnect(), raw.$disconnect()]);
    return;
  }

  console.log('  TABLE               ID     COLUMN              VALUE (masked)');
  for (const p of planned) {
    for (const c of p.columns) {
      console.log(
        `  ${p.target.label.padEnd(19)} ${String(p.id).padEnd(6)} ${c.field.padEnd(19)} ${c.masked}`
      );
    }
  }

  const valueCount = planned.reduce((n, p) => n + p.columns.length, 0);
  console.log(
    `\n  ${valueCount} value(s) across ${planned.length} row(s) would be encrypted.` +
      (alreadyDone ? ` ${alreadyDone} already encrypted, skipped.` : '')
  );

  if (!APPLY) {
    console.log('\n  DRY RUN - nothing written. Re-run with --apply.\n');
    await Promise.all([prisma.$disconnect(), raw.$disconnect()]);
    return;
  }

  for (const p of planned) {
    await prisma[p.target.model].update({
      where: { [p.target.idField]: p.id },
      data: p.data,
    });
  }

  await writeAuditLog({
    performedBy: null, // system action; AuditLog.performed_by is nullable
    action: 'PII_ENCRYPTED',
    targetTable: 'User',
    targetId: null,
    data: {
      reason: 'Field-level encryption at rest (AES-256-GCM) applied to existing rows',
      // Columns and row ids only. The values are the thing being protected and
      // must not be copied into the audit log in either form.
      rows: planned.map((p) => ({
        table: p.target.label,
        id: p.id,
        columns: p.columns.map((c) => c.field),
      })),
    },
  });

  console.log(`\n  Encrypted ${valueCount} value(s), recorded as one PII_ENCRYPTED audit entry.\n`);
  await Promise.all([prisma.$disconnect(), raw.$disconnect()]);
})();
