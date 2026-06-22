// Admin analytics aggregates for the management dashboard. All via Prisma
// (groupBy + JS bucketing) — no raw SQL, per project rule. Read-only.

const prisma = require('../utils/prisma');

const COMPLAINT_OPEN = ['Pending', 'Under_Review', 'In_Progress'];
const COMPLAINT_TERMINAL = ['Resolved', 'Rejected'];
const WILDLIFE_OPEN = ['Pending_Review', 'Priority_Review', 'Under_Care'];
const WILDLIFE_TERMINAL = ['Released', 'Transferred', 'Deceased'];
const REQUEST_OPEN = ['Pending', 'Approved', 'Scheduled'];
const REQUEST_TERMINAL = ['Completed', 'Rejected'];

const monthKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

function lastSixMonths() {
  const out = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const statusMap = (rows) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

async function slaFor(model, openStatuses, terminalStatuses) {
  const now = new Date();
  const [closed, closedLate, overdueOpen] = await Promise.all([
    prisma[model].count({ where: { status: { in: terminalStatuses }, sla_deadline: { not: null } } }),
    prisma[model].count({ where: { status: { in: terminalStatuses }, exceeded_sla: true } }),
    prisma[model].count({ where: { status: { in: openStatuses }, sla_deadline: { lt: now } } }),
  ]);
  const on_time = closed - closedLate;
  return { closed, on_time, late: closedLate, overdue_open: overdueOpen, rate: closed > 0 ? Math.round((on_time / closed) * 100) : null };
}

async function getAnalytics() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5, 1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    usersByRole, activeUsers,
    cStatus, wStatus, rStatus,
    cByType, rByType,
    cByBgy, wByBgy, rByBgy, barangays,
    cTrend, wTrend, rTrend,
    cSla, wSla, rSla,
    resolvedComplaints, endangeredCount,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { is_active: true } }),

    prisma.complaint.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.wildlifeTurnover.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.environmentalRequest.groupBy({ by: ['status'], _count: { _all: true } }),

    prisma.complaint.groupBy({ by: ['complaint_type'], _count: { _all: true } }),
    prisma.environmentalRequest.groupBy({ by: ['request_type'], _count: { _all: true } }),

    prisma.complaint.groupBy({ by: ['barangay_id'], _count: { _all: true } }),
    prisma.wildlifeTurnover.groupBy({ by: ['barangay_id'], _count: { _all: true } }),
    prisma.environmentalRequest.groupBy({ by: ['barangay_id'], _count: { _all: true } }),
    prisma.barangay.findMany({ select: { barangay_id: true, name: true, latitude: true, longitude: true, geojson_boundary: true }, orderBy: { name: 'asc' } }),

    prisma.complaint.findMany({ where: { submitted_at: { gte: sixMonthsAgo } }, select: { submitted_at: true } }),
    prisma.wildlifeTurnover.findMany({ where: { submitted_at: { gte: sixMonthsAgo } }, select: { submitted_at: true } }),
    prisma.environmentalRequest.findMany({ where: { submitted_at: { gte: sixMonthsAgo } }, select: { submitted_at: true } }),

    slaFor('complaint', COMPLAINT_OPEN, COMPLAINT_TERMINAL),
    slaFor('wildlifeTurnover', WILDLIFE_OPEN, WILDLIFE_TERMINAL),
    slaFor('environmentalRequest', REQUEST_OPEN, REQUEST_TERMINAL),

    prisma.complaint.findMany({ where: { status: 'Resolved', resolved_at: { not: null } }, select: { submitted_at: true, resolved_at: true } }),
    prisma.wildlifeTurnover.count({ where: { is_endangered: true } }),
  ]);

  // Users
  const roleMap = Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all]));
  const users = {
    total: sum(roleMap),
    active: activeUsers,
    by_role: { Admin: roleMap.Admin || 0, CENRO_Staff: roleMap.CENRO_Staff || 0, Resident: roleMap.Resident || 0 },
  };

  // Status breakdowns + totals
  const cMap = statusMap(cStatus), wMap = statusMap(wStatus), rMap = statusMap(rStatus);
  const reports = { complaints: sum(cMap), wildlife: sum(wMap), requests: sum(rMap) };
  reports.total = reports.complaints + reports.wildlife + reports.requests;

  // By type
  const by_type = {
    complaints: cByType.map((r) => ({ key: r.complaint_type, count: r._count._all })).sort((a, b) => b.count - a.count),
    requests: rByType.map((r) => ({ key: r.request_type, count: r._count._all })).sort((a, b) => b.count - a.count),
  };

  // By barangay (merged, with coords for the GIS layer)
  const idx = (rows) => Object.fromEntries(rows.map((r) => [r.barangay_id, r._count._all]));
  const ci = idx(cByBgy), wi = idx(wByBgy), ri = idx(rByBgy);
  const by_barangay = barangays.map((b) => {
    const complaints = ci[b.barangay_id] || 0;
    const wildlife = wi[b.barangay_id] || 0;
    const requests = ri[b.barangay_id] || 0;
    return { ...b, complaints, wildlife, requests, total: complaints + wildlife + requests };
  });

  // 6-month trend
  const months = lastSixMonths();
  const bucket = (rows) => {
    const m = {};
    for (const row of rows) {
      const k = monthKey(row.submitted_at);
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  };
  const cb = bucket(cTrend), wb = bucket(wTrend), rb = bucket(rTrend);
  const trend = months.map((month) => ({
    month,
    complaints: cb[month] || 0,
    wildlife: wb[month] || 0,
    requests: rb[month] || 0,
  }));

  // Resolution metrics (complaints)
  let avg_resolution_hours = null;
  if (resolvedComplaints.length) {
    const totalMs = resolvedComplaints.reduce((acc, c) => acc + (new Date(c.resolved_at) - new Date(c.submitted_at)), 0);
    avg_resolution_hours = Math.round((totalMs / resolvedComplaints.length / 3_600_000) * 10) / 10;
  }

  return {
    users,
    reports,
    status: { complaints: cMap, wildlife: wMap, requests: rMap },
    by_type,
    by_barangay,
    trend,
    sla: { complaints: cSla, wildlife: wSla, requests: rSla },
    resolution: { complaints_resolved: resolvedComplaints.length, avg_resolution_hours },
    wildlife_endangered: endangeredCount,
  };
}

module.exports = { getAnalytics };
