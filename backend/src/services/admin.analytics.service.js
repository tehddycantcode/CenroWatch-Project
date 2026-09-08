// Admin analytics aggregates for the management dashboard. All via Prisma
// (groupBy + JS bucketing) — no raw SQL, per project rule. Read-only.

const prisma = require('../utils/prisma');
const { NOT_ARCHIVED, withActive } = require('../utils/archive');

// 'Approved' MUST be here. It is the state where the clock is actually running,
// so omitting it would drop every live complaint out of the overdue query with
// no error anywhere - the breach count would just quietly under-report.
const COMPLAINT_OPEN = ['Pending', 'Under_Review', 'Approved', 'In_Progress'];
const COMPLAINT_TERMINAL = ['Resolved', 'Rejected'];
const WILDLIFE_OPEN = ['Pending_Review', 'Priority_Review', 'Under_Care'];
const WILDLIFE_TERMINAL = ['Released', 'Transferred', 'Deceased'];
const REQUEST_OPEN = ['Pending', 'Approved', 'Scheduled'];
const REQUEST_TERMINAL = ['Completed', 'Rejected'];

// Trend bucketing ─────────────────────────────────────────
// Dates are read with LOCAL getters, matching every other date path in this
// service. That is a deliberate hold, not an oversight: switching the buckets
// to a fixed Manila offset here would silently reassign reports filed near
// midnight to a different bucket and shift historical figures the office has
// already seen. The SLA work carries its own timezone handling.

const PRESETS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };
const DEFAULT_PRESET = '6m';
const DAY_MS = 86_400_000;

// Rows are only { submitted_at }, but "all" on a mature database is unbounded.
// A truncated trend is reported rather than silently drawn - see getAnalytics.
const TREND_ROW_CAP = 20_000;

const pad = (n) => String(n).padStart(2, '0');

function bucketKey(d, granularity) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  if (granularity === 'year') return `${y}`;
  if (granularity === 'month') return `${y}-${pad(dt.getMonth() + 1)}`;
  return `${y}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// Granularity is chosen from the SPAN, not the preset, so a custom range gets
// the same treatment as an equivalent preset. Roughly: a quarter or less reads
// per day, a few years read per month, anything longer per year.
function granularityFor(from, to) {
  const days = (to - from) / DAY_MS;
  if (days <= 92) return 'day';
  if (days <= 1096) return 'month';
  return 'year';
}

// Every bucket in [from, to], including empty ones. The SVG trend line spaces
// points by array index, so a gap would distort the curve rather than show one.
function bucketKeys(from, to, granularity) {
  const out = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), granularity === 'day' ? from.getDate() : 1);
  if (granularity === 'year') cur.setMonth(0, 1);
  while (cur <= to) {
    out.push(bucketKey(cur, granularity));
    if (granularity === 'day') cur.setDate(cur.getDate() + 1);
    else if (granularity === 'month') cur.setMonth(cur.getMonth() + 1);
    else cur.setFullYear(cur.getFullYear() + 1);
  }
  return out;
}

// Express 5 req.query is read-only, so express-validator's sanitizers do not
// persist - every value is coerced here. An unparseable or inverted custom
// range falls back to the default preset rather than throwing: a dashboard
// should not 500 because someone typed a bad date.
function resolveRange(filters = {}) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const start = filters.startDate ? new Date(filters.startDate) : null;
  const finish = filters.endDate ? new Date(filters.endDate) : null;
  const validCustom =
    start && finish && !Number.isNaN(+start) && !Number.isNaN(+finish) && start <= finish;

  if (validCustom) {
    const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const to = new Date(finish.getFullYear(), finish.getMonth(), finish.getDate(), 23, 59, 59, 999);
    return { range: 'custom', from, to, granularity: granularityFor(from, to) };
  }

  const range = filters.range === 'all' || PRESETS[filters.range] ? filters.range : DEFAULT_PRESET;
  if (range === 'all') return { range, from: null, to: end, granularity: null }; // resolved later

  const months = PRESETS[range];
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  return { range, from, to: end, granularity: granularityFor(from, end) };
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

async function getAnalytics(filters = {}) {
  const resolved = resolveRange(filters);
  let { from, to, granularity } = resolved;

  // "All time" has no lower bound until we ask the data where it starts. Three
  // cheap _min aggregates beat loading rows just to find the earliest one.
  if (from === null) {
    const [c, w, r] = await Promise.all([
      prisma.complaint.aggregate({ where: NOT_ARCHIVED, _min: { submitted_at: true } }),
      prisma.wildlifeTurnover.aggregate({ where: NOT_ARCHIVED, _min: { submitted_at: true } }),
      prisma.environmentalRequest.aggregate({ where: NOT_ARCHIVED, _min: { submitted_at: true } }),
    ]);
    const earliest = [c._min.submitted_at, w._min.submitted_at, r._min.submitted_at]
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    // An empty database still needs a chart with an x-axis, so fall back to the
    // default window rather than rendering nothing.
    from = earliest
      ? new Date(new Date(earliest).getFullYear(), new Date(earliest).getMonth(), 1)
      : new Date(to.getFullYear(), to.getMonth() - (PRESETS[DEFAULT_PRESET] - 1), 1);
    granularity = granularityFor(from, to);
  }

  const trendWhere = withActive({ submitted_at: { gte: from, lte: to } });

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

    prisma.complaint.findMany({ where: trendWhere, select: { submitted_at: true }, take: TREND_ROW_CAP }),
    prisma.wildlifeTurnover.findMany({ where: trendWhere, select: { submitted_at: true }, take: TREND_ROW_CAP }),
    prisma.environmentalRequest.findMany({ where: trendWhere, select: { submitted_at: true }, take: TREND_ROW_CAP }),

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

  // Trend over the selected range, one point per bucket.
  const keys = bucketKeys(from, to, granularity);
  const bucket = (rows) => {
    const m = {};
    for (const row of rows) {
      const k = bucketKey(row.submitted_at, granularity);
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  };
  const cb = bucket(cTrend), wb = bucket(wTrend), rb = bucket(rTrend);
  // `month` is kept as the field name even for day and year buckets: the SVG
  // chart, the table view and the PDF all read it, and renaming it would be a
  // breaking change to three consumers for no gain.
  const trend = keys.map((month) => ({
    month,
    complaints: cb[month] || 0,
    wildlife: wb[month] || 0,
    requests: rb[month] || 0,
  }));

  // Say so rather than quietly drawing a short chart.
  const truncated =
    cTrend.length === TREND_ROW_CAP ||
    wTrend.length === TREND_ROW_CAP ||
    rTrend.length === TREND_ROW_CAP;

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
    // What the trend above actually covers, so the client can label the axis
    // and the PDF can state the window instead of implying "last 6 months".
    trend_range: {
      range: resolved.range,
      granularity,
      from: from.toISOString(),
      to: to.toISOString(),
      truncated,
    },
    sla: { complaints: cSla, wildlife: wSla, requests: rSla },
    resolution: { complaints_resolved: resolvedComplaints.length, avg_resolution_hours },
    wildlife_endangered: endangeredCount,
  };
}

// resolveRange/bucketKeys/granularityFor are exported for the unit tests: they
// are pure date logic and the cheapest part of this service to get wrong.
module.exports = { getAnalytics, mergeSpecies, resolveRange, bucketKeys, bucketKey, granularityFor };
