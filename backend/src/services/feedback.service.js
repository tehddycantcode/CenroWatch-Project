// What the resident thought of how their case was handled.
//
// ONE MODULE FOR ALL THREE KINDS, like closureCertificate.service: the rules
// being enforced - who may leave feedback, when, and how often - are identical
// for a complaint, a turnover and a request, and three copies of them would
// drift.
//
// THREE RULES, and each exists for a reason that is easy to lose:
//
//   1. THE OWNER ONLY. Feedback is about service received, so it comes from the
//      person who received it. The lookup is scoped by user_id rather than
//      checked afterwards, so there is no path where a wrong id reads somebody
//      else's case first.
//
//   2. ONLY ONCE THE CASE IS CLOSED. Rating speed halfway through measures
//      nothing, and a case can still turn around. The check reads the record's
//      CURRENT status - no transition involved - so every case already closed
//      can be rated.
//
//   3. ONCE PER CASE. Enforced by a unique index on each foreign key, not by
//      remembering to look first; a race between two taps hits the database
//      constraint rather than writing two rows. The duplicate is reported as a
//      409 with a sentence a person can act on.
//
// An ANONYMOUS complaint has user_id NULL and therefore no owner, so it can
// never be rated. That is a consequence of true anonymity, not a gap.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');

const KINDS = {
  complaint: {
    label: 'complaint',
    table: 'Complaint',
    idField: 'complaint_id',
    refField: 'tracking_id',
    fk: 'complaint_id',
    delegate: () => prisma.complaint,
    owner: 'user_id',
    terminal: new Set(['Resolved']),
    closedWord: 'resolved',
  },
  wildlife: {
    label: 'wildlife turnover',
    table: 'WildlifeTurnover',
    idField: 'turnover_id',
    refField: 'reference_id',
    fk: 'turnover_id',
    delegate: () => prisma.wildlifeTurnover,
    // The reporter column on a turnover is named differently from the other two.
    owner: 'reported_by',
    terminal: new Set(['Released', 'Transferred']),
    closedWord: 'released or transferred',
  },
  request: {
    label: 'service request',
    table: 'EnvironmentalRequest',
    idField: 'request_id',
    refField: 'tracking_id',
    fk: 'request_id',
    delegate: () => prisma.environmentalRequest,
    owner: 'user_id',
    terminal: new Set(['Completed']),
    closedWord: 'completed',
  },
};

function kindOrThrow(kind) {
  const cfg = KINDS[kind];
  if (!cfg) throw new Error(`Unknown report kind: ${kind}`);
  return cfg;
}

// 1 to 5, whole numbers. Checked here rather than left to the column: the
// validator gives a good 422 per field, and this guarantees it for every caller
// including one that never passes through a route.
function score(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new HttpError(422, `${label} must be a whole number from 1 to 5.`);
  }
  return n;
}

const COMMENT_MAX = 2000;

function comment(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > COMMENT_MAX) {
    throw new HttpError(422, `Your comment is too long (limit ${COMMENT_MAX} characters).`);
  }
  return text;
}

/**
 * The case, if it belongs to this person. Scoped by owner in the WHERE clause -
 * a 404 for somebody else's reference is deliberate, since confirming that a
 * reference exists is itself a disclosure.
 */
async function loadOwnCase(cfg, userId, reference) {
  const row = await cfg.delegate().findFirst({
    where: { [cfg.refField]: String(reference), [cfg.owner]: userId },
    select: {
      [cfg.idField]: true,
      [cfg.refField]: true,
      status: true,
      feedback: { select: { feedback_id: true } },
    },
  });
  if (!row) throw new HttpError(404, 'Report not found.');
  return row;
}

async function submitFeedback(kind, userId, reference, input = {}, ctx = {}) {
  const cfg = kindOrThrow(kind);
  const row = await loadOwnCase(cfg, userId, reference);

  if (!cfg.terminal.has(row.status)) {
    throw new HttpError(
      409,
      `You can rate this ${cfg.label} once it is ${cfg.closedWord}. It is currently ${String(row.status).replace(/_/g, ' ')}.`,
    );
  }
  if (row.feedback) {
    throw new HttpError(409, 'You have already left feedback for this report. Thank you.');
  }

  const data = {
    user_id: userId,
    [cfg.fk]: row[cfg.idField],
    rating_overall: score(input.rating_overall, 'Overall experience'),
    rating_speed: score(input.rating_speed, 'Speed'),
    rating_staff: score(input.rating_staff, 'Staff response'),
    comment: comment(input.comment),
  };

  let created;
  try {
    created = await prisma.feedback.create({ data });
  } catch (err) {
    // P2002 is the unique index doing its job - two taps, or two tabs. Reported
    // as the same 409 the check above gives, because to the person it is the
    // same situation.
    if (err.code === 'P2002') {
      throw new HttpError(409, 'You have already left feedback for this report. Thank you.');
    }
    throw err;
  }

  await writeAuditLog({
    performedBy: userId,
    action: 'FEEDBACK_SUBMITTED',
    targetTable: cfg.table,
    targetId: row[cfg.idField],
    // The SCORES are summary data about service quality, not personal content.
    // The comment is deliberately NOT copied here: it is free text a resident
    // wrote, the audit log is readable by every Admin, and the row itself is
    // where it belongs.
    data: {
      reference: row[cfg.refField],
      rating_overall: data.rating_overall,
      rating_speed: data.rating_speed,
      rating_staff: data.rating_staff,
      has_comment: Boolean(data.comment),
    },
    ipAddress: ctx.ipAddress || null,
  });

  return created;
}

/** Whether this person may rate this case, and what they said if they have. */
async function getOwnFeedback(kind, userId, reference) {
  const cfg = kindOrThrow(kind);
  const row = await loadOwnCase(cfg, userId, reference);
  const existing = row.feedback
    ? await prisma.feedback.findUnique({ where: { feedback_id: row.feedback.feedback_id } })
    : null;
  return {
    can_submit: cfg.terminal.has(row.status) && !existing,
    submitted: Boolean(existing),
    feedback: existing,
  };
}

const AVG_FIELDS = ['rating_overall', 'rating_speed', 'rating_staff'];

/**
 * Admin view: the scores, the comments, and who they were about.
 *
 * Averages come from the WHOLE table, not the page being shown - a mean of ten
 * rows labelled as the service average would be wrong the moment anybody turned
 * to page two.
 */
async function listFeedback({ page = 1, limit = 20 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const current = Math.max(Number(page) || 1, 1);

  const [total, aggregate, items] = await Promise.all([
    prisma.feedback.count(),
    prisma.feedback.aggregate({ _avg: Object.fromEntries(AVG_FIELDS.map((f) => [f, true])) }),
    prisma.feedback.findMany({
      orderBy: { created_at: 'desc' },
      skip: (current - 1) * take,
      take,
      include: {
        user: { select: { first_name: true, last_name: true } },
        complaint: { select: { tracking_id: true, complaint_type: true } },
        turnover: { select: { reference_id: true, species_name: true } },
        request: { select: { tracking_id: true, request_type: true } },
      },
    }),
  ]);

  // Rounded to one decimal here rather than in each client, so the website and
  // any printed copy quote the same number.
  const averages = {};
  for (const f of AVG_FIELDS) {
    const v = aggregate._avg[f];
    averages[f] = v == null ? null : Math.round(v * 10) / 10;
  }

  return {
    items: items.map((f) => ({
      ...f,
      kind: f.complaint_id ? 'complaint' : f.turnover_id ? 'wildlife' : 'request',
      reference: f.complaint?.tracking_id || f.turnover?.reference_id || f.request?.tracking_id || null,
      subject: f.complaint?.complaint_type || f.turnover?.species_name || f.request?.request_type || null,
    })),
    total,
    page: current,
    limit: take,
    averages,
    // How many of each score, so the dashboard can show a distribution rather
    // than only a mean - a 3.0 made of 1s and 5s is not a 3.0 made of 3s.
    distribution: await prisma.feedback.groupBy({
      by: ['rating_overall'],
      _count: { rating_overall: true },
      orderBy: { rating_overall: 'asc' },
    }),
  };
}

module.exports = { submitFeedback, getOwnFeedback, listFeedback, KINDS, COMMENT_MAX };
