// Soft-delete ("archive") support for the three report models.
//
// Archived rows stay in the database - the status-history foreign keys are
// ON DELETE RESTRICT, so a hard delete would fail anyway, and destroying a
// government record is not recoverable. Instead every read path filters them
// out, so an archived report disappears from queues, dashboards, analytics,
// public endpoints, and the resident's own list.
//
// ONE vocabulary, so a missed filter is greppable. After touching any query
// on Complaint / WildlifeTurnover / EnvironmentalRequest, re-run:
//
//   rg "prisma\.(complaint|wildlifeTurnover|environmentalRequest)\.(findMany|findFirst|findUnique|count|groupBy|aggregate)" backend/src
//
// That pattern only catches static model access. Also check the dynamic form,
// which is how slaFor and createSequential reach a model:
//
//   rg "(prisma|tx)\[[a-zA-Z_]+\]\.(findMany|findFirst|count|groupBy|aggregate)" backend/src
//
// Every hit must either use NOT_ARCHIVED / withActive / ARCHIVED_ONLY, or be
// on this list of deliberate exceptions:
//
//   1. utils/createSequential.js - counts ALL rows (including archived) to mint
//      the next tracking id. Filtering it would recycle an id already in use
//      and violate the unique constraint.
//   2. services/admin.archive.service.js - the archive views and the
//      archive/restore lookups, which must see archived rows by definition.
//   3. staff detail reads (getComplaint / getTurnover / getRequest) - return
//      archived rows so an admin can open one and restore it; the queues that
//      list them are filtered instead.

const HttpError = require('./httpError');

const NOT_ARCHIVED = { archived_at: null };
const ARCHIVED_ONLY = { archived_at: { not: null } };

// Spread an existing `where` and exclude archived rows.
function withActive(where = {}) {
  return { ...where, archived_at: null };
}

// Guard a mutation: a stale tab must not update an archived report (which
// would fire an email about a report the resident can no longer see).
function assertNotArchived(record, label = 'report') {
  if (record && record.archived_at) {
    throw new HttpError(409, `This ${label} is archived. Restore it before making changes.`);
  }
}

module.exports = { NOT_ARCHIVED, ARCHIVED_ONLY, withActive, assertNotArchived };
