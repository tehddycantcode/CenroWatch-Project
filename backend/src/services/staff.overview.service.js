// Staff dashboard aggregates: per-resource totals, status breakdowns, currently
// open counts, live SLA-breach counts (open items already past their deadline),
// and a small recent-activity feed. Read-only — no AuditLog.

const prisma = require('../utils/prisma');
const { NOT_ARCHIVED, withActive } = require('../utils/archive');

// See admin.analytics.service: omitting 'Approved' silently hides running clocks.
const COMPLAINT_OPEN = ['Pending', 'Under_Review', 'Approved', 'In_Progress'];
const WILDLIFE_OPEN = ['Pending_Review', 'Priority_Review', 'Under_Care'];
const REQUEST_OPEN = ['Pending', 'Approved', 'Scheduled'];

// Turn a Prisma groupBy([status]) result into a plain { STATUS: count } map.
function toStatusMap(rows) {
  const map = {};
  for (const r of rows) map[r.status] = r._count._all;
  return map;
}

const sumOpen = (map, openStatuses) => openStatuses.reduce((n, s) => n + (map[s] || 0), 0);

async function getOverview() {
  const now = new Date();

  const [
    complaintStatus, wildlifeStatus, requestStatus,
    complaintBreached, wildlifeBreached, requestBreached,
    recentComplaints, recentWildlife, recentRequests,
  ] = await Promise.all([
    prisma.complaint.groupBy({ by: ['status'], where: NOT_ARCHIVED, _count: { _all: true } }),
    prisma.wildlifeTurnover.groupBy({ by: ['status'], where: NOT_ARCHIVED, _count: { _all: true } }),
    prisma.environmentalRequest.groupBy({ by: ['status'], where: NOT_ARCHIVED, _count: { _all: true } }),

    prisma.complaint.count({ where: withActive({ status: { in: COMPLAINT_OPEN }, sla_deadline: { lt: now } }) }),
    prisma.wildlifeTurnover.count({ where: withActive({ status: { in: WILDLIFE_OPEN }, sla_deadline: { lt: now } }) }),
    prisma.environmentalRequest.count({ where: withActive({ status: { in: REQUEST_OPEN }, sla_deadline: { lt: now } }) }),

    prisma.complaint.findMany({
      where: NOT_ARCHIVED,
      orderBy: { submitted_at: 'desc' }, take: 6,
      select: { tracking_id: true, complaint_type: true, status: true, submitted_at: true, barangay: { select: { name: true } } },
    }),
    prisma.wildlifeTurnover.findMany({
      where: NOT_ARCHIVED,
      orderBy: { submitted_at: 'desc' }, take: 6,
      select: { reference_id: true, species_name: true, status: true, submitted_at: true, barangay: { select: { name: true } } },
    }),
    prisma.environmentalRequest.findMany({
      where: NOT_ARCHIVED,
      orderBy: { submitted_at: 'desc' }, take: 6,
      select: { tracking_id: true, request_type: true, status: true, submitted_at: true, barangay: { select: { name: true } } },
    }),
  ]);

  const cMap = toStatusMap(complaintStatus);
  const wMap = toStatusMap(wildlifeStatus);
  const rMap = toStatusMap(requestStatus);

  const complaints = {
    total: Object.values(cMap).reduce((a, b) => a + b, 0),
    open: sumOpen(cMap, COMPLAINT_OPEN),
    breached: complaintBreached,
    by_status: cMap,
  };
  const wildlife = {
    total: Object.values(wMap).reduce((a, b) => a + b, 0),
    open: sumOpen(wMap, WILDLIFE_OPEN),
    breached: wildlifeBreached,
    by_status: wMap,
  };
  const requests = {
    total: Object.values(rMap).reduce((a, b) => a + b, 0),
    open: sumOpen(rMap, REQUEST_OPEN),
    breached: requestBreached,
    by_status: rMap,
  };

  const recent = [
    ...recentComplaints.map((c) => ({ id: c.tracking_id, kind: 'complaint', title: c.complaint_type, status: c.status, barangay: c.barangay?.name, date: c.submitted_at })),
    ...recentWildlife.map((w) => ({ id: w.reference_id, kind: 'wildlife', title: w.species_name, status: w.status, barangay: w.barangay?.name, date: w.submitted_at })),
    ...recentRequests.map((r) => ({ id: r.tracking_id, kind: 'request', title: r.request_type, status: r.status, barangay: r.barangay?.name, date: r.submitted_at })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);

  return {
    complaints,
    wildlife,
    requests,
    totals: {
      open: complaints.open + wildlife.open + requests.open,
      breached: complaints.breached + wildlife.breached + requests.breached,
    },
    recent,
  };
}

module.exports = { getOverview };
