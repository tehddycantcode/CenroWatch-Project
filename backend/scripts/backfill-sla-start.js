#!/usr/bin/env node
// Backfill sla_started_at / sla_deadline after the move to approval-gated,
// working-day SLAs.
//
//   npm run backfill-sla              dry run - prints the table, writes nothing
//   npm run backfill-sla -- --apply   performs the writes
//
// SAFETY PROPERTIES, all deliberate:
//  - Idempotent, by COMPARING each row against the value it would be given and
//    skipping when they already match. An earlier version guarded on
//    "sla_started_at IS NULL" instead, which looks equivalent and is not: a
//    complaint that was never accepted is legitimately left null, so it matched
//    the guard on every subsequent run and kept being re-reported and re-audited.
//    Comparing outcomes is the only guard that survives a row whose correct
//    value is itself null.
//  - Every write is by primary key. There is no deleteMany and no update on a
//    predicate, so nothing outside the printed table can be affected.
//  - No data is invented. An approval time is read verbatim from status history
//    or from approval_date; where there is no evidence, the fields are set null
//    rather than guessed.
//  - One audit row carrying per-row before/after, so a manual revert is possible.
//
// WHAT CHANGES, STATED PLAINLY: a complaint still sitting in Pending loses its
// deadline. Under the new model no commitment exists until CENRO accepts the
// report, so a submission-based deadline was a promise the office never made.
// Those rows drop out of the breach counts and the dashboard numbers move in the
// flattering direction. That is the intended semantic change - the "Awaiting
// acknowledgement" figure on the staff dashboard is what keeps it honest.

require('dotenv').config();
const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const {
  getSlaMinutes,
  computeSlaDeadline,
  computeExceededSla,
} = require('../src/utils/sla');
const { slaForRequestType } = require('../src/services/category.service');

const APPLY = process.argv.includes('--apply');

// Statuses that mean CENRO took the report up. Rejected is NOT acceptance.
// Resolved is included because with no state machine a row can jump straight
// from Pending to Resolved - that is acceptance and completion in one motion,
// and its own timestamp is the only evidence available.
const ACCEPTED = ['Approved', 'Under_Review', 'In_Progress', 'Resolved'];

// The same rule for requests. Scheduled and Completed both prove the office
// took the request up, and with no state machine a row can reach either without
// ever passing through Approved. Looking only for Approved would score a
// finished request as "never approved" and quietly drop it out of the SLA
// compliance denominator - which is exactly what REQ-2026-00001 does.
const REQUEST_ACCEPTED = ['Approved', 'Scheduled', 'Completed'];
const WILDLIFE_TERMINAL = ['Released', 'Transferred', 'Deceased'];

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '-');
const rows = [];

// Would writing `next` over `current` change anything? Dates are compared by
// instant, not by object identity or string form.
const ms = (v) => (v == null ? null : new Date(v).getTime());
const unchanged = (current, next) =>
  ms(current.sla_started_at) === ms(next.sla_started_at) &&
  ms(current.sla_deadline) === ms(next.sla_deadline) &&
  Boolean(current.exceeded_sla) === Boolean(next.exceeded_sla);

async function backfillComplaints() {
  const minutes = await getSlaMinutes('complaint_sla_minutes', 3365);
  const list = await prisma.complaint.findMany({
    // Archived rows are included on purpose: their history is intact and an
    // admin can restore them, at which point a null anchor would be wrong.
    select: {
      complaint_id: true,
      sla_started_at: true,
      exceeded_sla: true,
      tracking_id: true,
      status: true,
      sla_deadline: true,
      resolved_at: true,
      updated_at: true,
      status_history: {
        where: { new_status: { in: ACCEPTED } },
        orderBy: { changed_at: 'asc' },
        take: 1,
        select: { changed_at: true, new_status: true },
      },
    },
  });

  for (const c of list) {
    const accept = c.status_history[0];
    let next = { sla_started_at: null, sla_deadline: null, exceeded_sla: false };
    let rule = 'never_accepted';

    if (accept) {
      const start = accept.changed_at;
      const deadline = await computeSlaDeadline(start, minutes);
      const completedAt =
        c.status === 'Resolved'
          ? c.resolved_at
          : c.status === 'Rejected'
            ? c.resolved_at ?? c.updated_at
            : null;
      next = {
        sla_started_at: start,
        sla_deadline: deadline,
        exceeded_sla: computeExceededSla(deadline, completedAt),
      };
      rule = `history:${accept.new_status}`;
    }

    // Already correct - do not report or rewrite it.
    if (unchanged(c, next)) continue;

    rows.push({
      kind: 'complaint',
      id: c.complaint_id,
      ref: c.tracking_id,
      status: c.status,
      old_deadline: c.sla_deadline,
      rule,
      ...next,
    });
    if (APPLY) {
      await prisma.complaint.update({ where: { complaint_id: c.complaint_id }, data: next });
    }
  }
}

async function backfillRequests() {
  const list = await prisma.environmentalRequest.findMany({
    select: {
      request_id: true,
      sla_started_at: true,
      exceeded_sla: true,
      tracking_id: true,
      status: true,
      request_type: true,
      sla_deadline: true,
      approval_date: true,
      completion_date: true,
      updated_at: true,
      status_history: {
        where: { new_status: { in: REQUEST_ACCEPTED } },
        orderBy: { changed_at: 'asc' },
        take: 1,
        select: { changed_at: true, new_status: true },
      },
    },
  });

  for (const r of list) {
    const accept = r.status_history[0];
    const start = r.approval_date || accept?.changed_at || null;
    const sla = await slaForRequestType(r.request_type);
    let next = { sla_started_at: null, sla_deadline: null, exceeded_sla: false };
    let rule = 'never_approved';

    if (start && sla) {
      const minutes = await getSlaMinutes(sla.key, sla.fallback);
      const deadline = await computeSlaDeadline(start, minutes);
      const completedAt =
        r.status === 'Completed'
          ? r.completion_date
          : r.status === 'Rejected'
            ? r.completion_date ?? r.updated_at
            : null;
      next = {
        sla_started_at: start,
        sla_deadline: deadline,
        exceeded_sla: computeExceededSla(deadline, completedAt),
      };
      rule = r.approval_date ? 'approval_date' : `history:${accept.new_status}`;
    } else if (start && !sla) {
      // Approved, but this type has no Citizens Charter SLA. Anchor recorded,
      // no deadline - identical to the behaviour before this change.
      next = { sla_started_at: start, sla_deadline: null, exceeded_sla: false };
      rule = 'approved_no_charter_sla';
    }

    if (unchanged(r, next)) continue;

    rows.push({
      kind: 'request',
      id: r.request_id,
      ref: r.tracking_id,
      status: r.status,
      old_deadline: r.sla_deadline,
      rule,
      ...next,
    });
    if (APPLY) {
      await prisma.environmentalRequest.update({ where: { request_id: r.request_id }, data: next });
    }
  }
}

async function backfillWildlife() {
  const minutes = await getSlaMinutes('wildlife_sla_minutes', 3218);
  const list = await prisma.wildlifeTurnover.findMany({
    select: {
      turnover_id: true,
      sla_started_at: true,
      exceeded_sla: true,
      reference_id: true,
      status: true,
      submitted_at: true,
      sla_deadline: true,
      release_date: true,
      updated_at: true,
    },
  });

  for (const w of list) {
    // Wildlife keeps a submission-based clock; only the arithmetic changed, so
    // the deadline is RECOMPUTED in working time rather than left as it was.
    // Working-time addition is monotone, so a deadline can only move later -
    // no turnover that was on time can be made retroactively late.
    const deadline = await computeSlaDeadline(w.submitted_at, minutes);
    const completedAt = WILDLIFE_TERMINAL.includes(w.status)
      ? w.release_date ?? w.updated_at
      : null;
    const next = {
      sla_started_at: w.submitted_at,
      sla_deadline: deadline,
      exceeded_sla: computeExceededSla(deadline, completedAt),
    };
    if (unchanged(w, next)) continue;

    rows.push({
      kind: 'wildlife',
      id: w.turnover_id,
      ref: w.reference_id,
      status: w.status,
      old_deadline: w.sla_deadline,
      rule: 'submitted_at',
      ...next,
    });
    if (APPLY) {
      await prisma.wildlifeTurnover.update({ where: { turnover_id: w.turnover_id }, data: next });
    }
  }
}

(async () => {
  console.log(`\nSLA backfill - ${APPLY ? 'APPLYING' : 'DRY RUN'}\n`);
  await backfillComplaints();
  await backfillRequests();
  await backfillWildlife();

  if (!rows.length) {
    console.log('  Nothing to do: every row already holds the value this backfill would give it.\n');
    await prisma.$disconnect();
    return;
  }

  console.log(
    '  KIND       REFERENCE          STATUS        RULE                      OLD DEADLINE      NEW DEADLINE      LATE'
  );
  for (const r of rows) {
    console.log(
      `  ${r.kind.padEnd(10)} ${String(r.ref).padEnd(18)} ${String(r.status).padEnd(13)} ${r.rule.padEnd(25)} ${iso(r.old_deadline).padEnd(17)} ${iso(r.sla_deadline).padEnd(17)} ${r.exceeded_sla ? 'yes' : 'no'}`
    );
  }

  const cleared = rows.filter((r) => r.old_deadline && !r.sla_deadline).length;
  console.log(`\n  ${rows.length} row(s). ${cleared} lose a deadline they previously had (never accepted).`);

  if (!APPLY) {
    console.log('\n  DRY RUN - nothing written. Re-run with --apply.\n');
  } else {
    await writeAuditLog({
      performedBy: null, // system action; AuditLog.performed_by is nullable
      action: 'SLA_BACKFILL',
      targetTable: 'Complaint',
      targetId: null,
      data: {
        reason: 'Approval-gated, working-day SLA migration',
        rows: rows.map((r) => ({
          kind: r.kind,
          id: r.id,
          ref: r.ref,
          rule: r.rule,
          before: { sla_deadline: r.old_deadline },
          after: {
            sla_started_at: r.sla_started_at,
            sla_deadline: r.sla_deadline,
            exceeded_sla: r.exceeded_sla,
          },
        })),
      },
    });
    console.log('\n  Applied, and recorded as one SLA_BACKFILL audit entry.\n');
  }
  await prisma.$disconnect();
})();
