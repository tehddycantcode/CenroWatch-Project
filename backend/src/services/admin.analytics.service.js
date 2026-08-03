// Admin analytics aggregates for the management dashboard. All via Prisma
// (groupBy + JS bucketing) — no raw SQL, per project rule. Read-only.

const prisma = require('../utils/prisma');
const { NOT_ARCHIVED, withActive } = require('../utils/archive');

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

// Merge free-text wildlife species names case-insensitively (trim + lowercase),
// displaying the most common original casing. Blank names group as "Unspecified".
// groupBy already returns one row per exact string; this folds the casings.
function mergeSpecies(rows) {
  const map = new Map(); // normalizedKey -> { count, casings: Map<original, count> }
  for (const r of rows) {
    const raw = (r.species_name || '').trim();
    const key = raw.toLowerCase() || '__unspecified__';
    const display = raw || 'Unspecified';
    const entry = map.get(key) || { count: 0, casings: new Map() };
    entry.count += r._count._all;
    entry.casings.set(display, (entry.casings.get(display) || 0) + r._count._all);
    map.set(key, entry);
  }
  return [...map.values()]
    .map((e) => {
      let label = '';
      let best = -1;
      for (const [casing, c] of e.casings) {
        if (c > best) { best = c; label = casing; }
      }
      return { key: label, count: e.count };
    })
    .sort((a, b) => b.count - a.count);
}

async function slaFor(model, openStatuses, terminalStatuses) {
  const now = new Date();
  const [closed, closedLate, overdueOpen] = await Promise.all([
    prisma[model].count({ where: withActive({ status: { in: terminalStatuses }, sla_deadline: { not: null } }) }),
    prisma[model].count({ where: withActive({ status: { in: terminalStatuses }, exceeded_sla: true }) }),
    prisma[model].count({ where: withActive({ status: { in: openStatuses }, sla_deadline: { lt: now } }) }),
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
    cByType, rByType, wBySpecies,
    cByBgy, wByBgy, rByBgy, barangays,
    cTrend, wTrend, rTrend,
    cSla, wSla, rSla,
    resolvedComplaints, endangeredCount,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { is_active: true } }),

    prisma.complaint.groupBy({ by: ['status'], where: NOT_ARCHIVED, _count: { _all: true } }),
    prisma.wildlifeTurnover.groupBy({ by: ['status'], where: NOT_ARCHIVED, _count: { _all: true } }),
    prisma.environmentalRequest.groupBy({ by: ['status'], where: NOT_ARCHIVED, _count: { _all: true } }),

    prisma.complaint.groupBy({ by: ['complaint_type'], where: NOT_ARCHIVED, _count: { _all: true } }),
    prisma.environmentalRequest.groupBy({ by: ['request_type'], where: NOT_ARCHIVED, _count: { _all: true } }),
    prisma.wildlifeTurnover.groupBy({ by: ['species_name'], where: NOT_ARCHIVED, _count: { _all: true } }),

    prisma.complaint.groupBy({ by: ['barangay_id'], where: NOT_ARCHIVED, _count: { _all: true } }),
    prisma.wildlifeTurnover.groupBy({ by: ['barangay_id'], where: NOT_ARCHIVED, _count: { _all: true } }),
    prisma.environmentalRequest.groupBy({ by: ['barangay_id'], where: NOT_ARCHIVED, _count: { _all: true } }),
    prisma.barangay.findMany({ select: { barangay_id: true, name: true, latitude: true, longitude: true, geojson_boundary: true }, orderBy: { name: 'asc' } }),

    prisma.complaint.findMany({ where: withActive({ submitted_at: { gte: sixMonthsAgo } }), select: { submitted_at: true } }),
    prisma.wildlifeTurnover.findMany({ where: withActive({ submitted_at: { gte: sixMonthsAgo } }), select: { submitted_at: true } }),
    prisma.environmentalRequest.findMany({ where: withActive({ submitted_at: { gte: sixMonthsAgo } }), select: { submitted_at: true } }),

    slaFor('complaint', COMPLAINT_OPEN, COMPLAINT_TERMINAL),
    slaFor('wildlifeTurnover', WILDLIFE_OPEN, WILDLIFE_TERMINAL),
    slaFor('environmentalRequest', REQUEST_OPEN, REQUEST_TERMINAL),

    prisma.complaint.findMany({ where: withActive({ status: 'Resolved', resolved_at: { not: null } }), select: { submitted_at: true, resolved_at: true } }),
    prisma.wildlifeTurnover.count({ where: withActive({ is_endangered: true }) }),
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
    wildlife: mergeSpecies(wBySpecies),
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

module.exports = { getAnalytics, mergeSpecies };
