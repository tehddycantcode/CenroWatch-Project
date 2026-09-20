#!/usr/bin/env node
// Seeds geotagged DEMONSTRATION data so the GIS figures in the capstone
// manuscript (Figure 55, the barangay density map) show the two-tier
// visualisation at a realistic scale.
//
//   npm run seed:demo                       dry run - prints the plan, writes nothing
//   npm run seed:demo -- --apply            performs the writes
//   npm run seed:demo -- --remove           dry run of the removal
//   npm run seed:demo -- --remove --apply   deletes everything this script created
//
// WHY THIS EXISTS. The development database holds 10 complaints spread over 5 of
// 18 barangays, and only 6 rows anywhere carry coordinates. DensityMap.jsx draws
// a barangay choropleth (fill-opacity 0.55) plus a clustered marker layer at
// clusterRadius 45. With 6 scattered points the choropleth is near-flat and no
// cluster ever forms, so a screenshot of it does not show the feature the
// chapter describes.
//
// WHAT THIS IS, AND WHAT IT IS NOT. These are demonstration rows, created so a
// screenshot can illustrate the visualisation at scale. They are NOT test
// results and NOT research findings. Any figure rendered from them must say so
// in its caption - one sentence is enough:
//
//     "Figure 55 is rendered using seeded demonstration data to illustrate the
//      density visualisation at scale."
//
// Nothing here fabricates a measurement. Descriptions are generic environmental
// complaints with no personal detail; reporter_name and reporter_contact are
// left null, so no identity is invented; and every SLA field is computed by the
// SAME src/utils/sla.js the running application uses rather than typed in.
//
// SAFETY PROPERTIES, all deliberate:
//  - Dry run is the default. Nothing is written without --apply.
//  - Each run writes ONE DEMO_GIS_SEED audit row carrying the ids it created.
//    That row IS the manifest: --remove reads it back and deletes by primary
//    key. There is no deleteMany on an attribute predicate, so a row this
//    script did not create cannot be touched - the mistake that once deleted a
//    historical audit entry is structurally impossible here.
//  - Idempotent. A second --apply while a live batch exists refuses and tells
//    you to remove that batch first.
//  - Uses the SHARED prisma client (never `new PrismaClient()`), so the
//    field-encryption extension applies to address_details exactly as it does
//    for a report filed through the API.
//  - Coordinates are jittered by at most 40% of the distance to the nearest
//    neighbouring barangay centroid, so a point always lands inside the Voronoi
//    cell of the barangay it is filed against. seed.js derives those boundaries
//    in degree space, so the degree-space distance used here is exact, not an
//    approximation - a point drawn into the wrong polygon would make the
//    choropleth and the marker layer disagree on screen.
//  - The generator is seeded (mulberry32, fixed constant), so the same batch
//    comes out every time and the figure is reproducible.

require('dotenv').config();
const prisma = require('../src/utils/prisma');
const { writeAuditLog } = require('../src/utils/audit');
const { createSequential } = require('../src/utils/createSequential');
const {
  getSlaMinutes,
  computeSlaDeadline,
  computeExceededSla,
} = require('../src/utils/sla');

const APPLY = process.argv.includes('--apply');
const REMOVE = process.argv.includes('--remove');
const SEED_ACTION = 'DEMO_GIS_SEED';

const DAY = 86_400_000;
const NOW = Date.now();
// Nothing is dated into the future, and nothing lands inside the last hour -
// a report "resolved" ten seconds ago reads as a glitch in a screenshot.
const CAP = NOW - 3_600_000;

// ---------------------------------------------------------------------------
// Deterministic generator. Fixed seed => the same batch every run.
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260920);
const between = (lo, hi) => lo + rand() * (hi - lo);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// Fisher-Yates driven by the same seeded stream, so the status mix is an exact
// bag rather than a weighted coin that can drift on a short run.
function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// The plan. 49 complaints, every barangay represented, counts uneven on purpose
// so the choropleth has something to shade.
// ---------------------------------------------------------------------------
const COMPLAINTS_PER_BARANGAY = {
  Marinig: 5,
  Mamatid: 5,
  Banlic: 4,
  Baclaran: 4,
  Bigaa: 4,
  Gulod: 3,
  Butong: 3,
  Pulo: 3,
  Sala: 3,
  'Poblacion Uno': 2,
  'Poblacion Dos': 2,
  'Poblacion Tres': 2,
  Niugan: 2,
  'San Isidro': 2,
  'Banay-Banay': 2,
  Diezmo: 1,
  Pittland: 1,
  Casile: 1,
};

// An exact bag of 49 statuses. Rejected rows are included knowing that
// gis.service excludes them from the marker layer - a queue with no rejections
// in it is not a realistic queue, and the choropleth still counts them.
//
// Weighted towards closed work on purpose. An office six months into operation
// has mostly finished reports and a small live queue; the reverse shape would
// say the backlog never clears.
const STATUS_BAG = [
  ...Array(26).fill('Resolved'),
  ...Array(4).fill('Rejected'),
  ...Array(6).fill('Pending'),
  ...Array(3).fill('Approved'),
  ...Array(5).fill('Under_Review'),
  ...Array(5).fill('In_Progress'),
];

// Statuses with no terminal event yet. These are dated RECENTLY, because the
// deadline for an open report is judged against now: a six-month-old report
// still sitting In_Progress is breached by arithmetic, and a queue full of
// them would make every screenshot show a failing office. Real queues hold
// recent work and archive the rest.
const OPEN_STATUSES = ['Pending', 'Approved', 'Under_Review', 'In_Progress'];

// Share of resolved reports closed inside the charter deadline.
//
// STATE THIS PLAINLY IF ASKED: this is a seed PARAMETER, not a measurement. The
// SLA compliance figure on any dashboard screenshot taken from this data is a
// property of this constant and must never be quoted as a result. It exists
// because the alternative - drawing resolution times with no reference to the
// 3365-working-minute budget - silently produced a 71% breach rate, which is
// equally invented and merely less flattering.
const ON_TIME_SHARE = 0.75;

const DESCRIPTIONS = {
  Illegal_Dumping: [
    'Household and construction waste dumped along the creek easement. The pile has grown over the past week and is blocking water flow.',
    'Sacks of mixed garbage left at a vacant lot near the subdivision gate. Nearby households report a strong odor.',
    'A truck was seen unloading debris at the roadside after dark. Rubble and plastic are scattered across the shoulder.',
  ],
  Open_Burning: [
    'Leaves and plastic waste burned in an open lot every afternoon. Heavy smoke drifts into the nearby houses.',
    'Daily backyard burning of household trash. Smoke is affecting an elderly resident with asthma.',
  ],
  Noise_Disturbance: [
    'Videoke operating past midnight on weekends. Sound is audible three houses away.',
    'Construction work with heavy equipment starting before 5:00 AM on weekdays.',
  ],
  Improper_Hazardous_Waste_Storage: [
    'Used motor oil stored in open drums behind a repair shop, with spillage visible on the ground.',
    'Discarded car batteries and paint containers stacked beside a residential fence without cover.',
  ],
  Drainage_Blockage: [
    'Canal clogged with silt and plastic waste. The street floods ankle-deep after a short rain.',
    'Drainage outlet blocked by debris, leaving standing water and mosquito breeding sites.',
  ],
  Air_Pollution: [
    'Persistent black smoke from a small workshop exhaust during operating hours.',
    'Dust from an unpaved hauling route covering nearby homes and parked vehicles.',
  ],
  Water_Pollution: [
    'Greyish discharge entering the creek from a drainage pipe. The water has an oily film and a foul smell.',
    'Fish kill observed in the irrigation canal. Water has been discolored since yesterday.',
  ],
  Other: [
    'Fallen acacia branch obstructing the sidewalk after the storm. Requesting assessment and clearing.',
    'Stagnant water in an abandoned lot with overgrown vegetation. Residents are concerned about dengue.',
  ],
};

// Deliberately generic. No house numbers, no names - this is a location hint of
// the kind residents actually type, not an invented address.
const ADDRESS_HINTS = [
  'Near the barangay hall',
  'Along the creek easement',
  'Beside the covered court',
  'Near the elementary school',
  'Along the main road',
  'Purok 3, interior street',
  'Near the public market',
  'Beside the drainage outlet',
];

const WILDLIFE_PLAN = [
  { barangay: 'Casile', species: 'Philippine Serpent Eagle', category: 'Bird', endangered: true, condition: 'Injured', status: 'Under_Care', desc: 'Raptor found grounded with an injured wing near the upland tree line. Unable to fly; secured in a ventilated box pending turnover.' },
  { barangay: 'Diezmo', species: 'Reticulated Python', category: 'Reptile', endangered: false, condition: 'Healthy', status: 'Released', desc: 'Large snake found inside a residential backyard. Safely contained by responders with no injuries reported.' },
  { barangay: 'Pittland', species: 'Common Water Monitor', category: 'Reptile', endangered: false, condition: 'Healthy', status: 'Released', desc: 'Monitor lizard strayed into a drainage canal beside a residential block. Retrieved and held for assessment.' },
  { barangay: 'Banay-Banay', species: 'Barn Owl', category: 'Bird', endangered: false, condition: 'Sick', status: 'Under_Care', desc: 'Owl found weak and unresponsive under a mango tree. No visible wounds; showing signs of dehydration.' },
  { barangay: 'Butong', species: 'Philippine Hanging Parrot', category: 'Bird', endangered: true, condition: 'Healthy', status: 'Priority_Review', desc: 'Parrot surrendered by a resident who was keeping it as a pet. Turned over voluntarily for proper disposition.' },
  { barangay: 'San Isidro', species: 'Asian Palm Civet', category: 'Mammal', endangered: false, condition: 'Injured', status: 'Transferred', desc: 'Civet caught in a fence line with a wounded hind leg. Stabilised and endorsed for veterinary care.' },
];

// ---------------------------------------------------------------------------
// Geometry. Keep every point inside its own barangay's Voronoi cell.
// ---------------------------------------------------------------------------
function jitterRadius(b, all) {
  let nearest = Infinity;
  for (const o of all) {
    if (o.barangay_id === b.barangay_id) continue;
    const d = Math.hypot(o.latitude - b.latitude, o.longitude - b.longitude);
    if (d < nearest) nearest = d;
  }
  // 40% of the half-gap would already be safe; 40% of the FULL gap is not, so
  // cap at 0.4 x nearest and additionally at 0.0025 deg (~275 m) for the wide
  // cells, which keeps points off the very edge of a polygon.
  return Math.min(0.0025, nearest * 0.4);
}

function scatter(b, radius) {
  const angle = rand() * Math.PI * 2;
  // sqrt() gives a uniform spread over the disc instead of a bullseye.
  const r = Math.sqrt(rand()) * radius;
  return {
    latitude: Number((b.latitude + r * Math.cos(angle)).toFixed(6)),
    longitude: Number((b.longitude + r * Math.sin(angle)).toFixed(6)),
  };
}

// ---------------------------------------------------------------------------
// Timelines. Monotonic, never in the future.
// ---------------------------------------------------------------------------
const clamp = (ms, floor) => new Date(Math.min(CAP, Math.max(ms, floor + 60_000)));
const addDays = (date, days) => date.getTime() + days * DAY;

// When a report was filed. Open work is recent and weighted towards the last
// few days (pow > 1 biases the draw towards the low end); closed work is old
// enough that its whole timeline fits behind today.
function drawSubmittedAt(status) {
  const daysAgo = OPEN_STATUSES.includes(status)
    ? 0.3 + rand() ** 1.8 * 6.7 // 0.3 - 7 days, most of it inside 3
    : between(14, 178);
  return new Date(CAP - daysAgo * DAY);
}

// `deadline` is the real working-time deadline for this row, already computed
// by src/utils/sla.js. Resolution is drawn RELATIVE to it, which is the whole
// point: a budget of 3365 working minutes is about 2.3 working days, so a
// resolution time picked in calendar days without looking at it breaches
// almost every time.
function buildTimeline(status, submittedAt, approvedAt, deadline) {
  const chain = [];
  let resolvedAt = null;

  if (status === 'Pending') return { chain, resolvedAt };

  if (status === 'Rejected') {
    const at = clamp(addDays(submittedAt, between(0.5, 4)), submittedAt.getTime());
    chain.push({ old_status: 'Pending', new_status: 'Rejected', changed_at: at });
    return { chain, resolvedAt };
  }

  chain.push({ old_status: 'Pending', new_status: 'Approved', changed_at: approvedAt });
  if (status === 'Approved') return { chain, resolvedAt };

  const budget = deadline.getTime() - approvedAt.getTime();

  const reviewAt = clamp(approvedAt.getTime() + budget * between(0.08, 0.25), approvedAt.getTime());
  chain.push({ old_status: 'Approved', new_status: 'Under_Review', changed_at: reviewAt });
  if (status === 'Under_Review') return { chain, resolvedAt };

  const progressAt = clamp(reviewAt.getTime() + budget * between(0.1, 0.3), reviewAt.getTime());
  chain.push({ old_status: 'Under_Review', new_status: 'In_Progress', changed_at: progressAt });
  if (status === 'In_Progress') return { chain, resolvedAt };

  resolvedAt = rand() < ON_TIME_SHARE
    ? clamp(approvedAt.getTime() + budget * between(0.55, 0.95), progressAt.getTime())
    : clamp(deadline.getTime() + between(0.3, 5) * DAY, progressAt.getTime());
  chain.push({ old_status: 'In_Progress', new_status: 'Resolved', changed_at: resolvedAt });
  return { chain, resolvedAt };
}

// ---------------------------------------------------------------------------
// Removal. Reads the manifest audit rows and deletes by primary key only.
// ---------------------------------------------------------------------------
async function loadBatches() {
  const rows = await prisma.auditLog.findMany({
    where: { action: SEED_ACTION },
    orderBy: { log_id: 'asc' },
    select: { log_id: true, performed_at: true, data_generated_json: true },
  });
  const complaintIds = [];
  const wildlifeIds = [];
  const logIds = [];
  for (const r of rows) {
    const d = r.data_generated_json || {};
    for (const id of d.complaint_ids || []) complaintIds.push(id);
    for (const id of d.wildlife_ids || []) wildlifeIds.push(id);
    logIds.push(r.log_id);
  }
  return { rows, complaintIds, wildlifeIds, logIds };
}

async function removeBatch() {
  const { rows, complaintIds, wildlifeIds, logIds } = await loadBatches();
  if (!rows.length) {
    console.log('\nNo DEMO_GIS_SEED batch found. Nothing to remove.\n');
    return;
  }

  // Only ids that are actually still present get reported and deleted.
  const liveComplaints = complaintIds.length
    ? await prisma.complaint.findMany({
        where: { complaint_id: { in: complaintIds } },
        select: { complaint_id: true, tracking_id: true },
      })
    : [];
  const liveWildlife = wildlifeIds.length
    ? await prisma.wildlifeTurnover.findMany({
        where: { turnover_id: { in: wildlifeIds } },
        select: { turnover_id: true, reference_id: true },
      })
    : [];

  console.log(`\n${rows.length} seed batch(es) on record.`);
  console.log(`  complaints still present : ${liveComplaints.length} of ${complaintIds.length}`);
  console.log(`  wildlife still present   : ${liveWildlife.length} of ${wildlifeIds.length}`);
  if (liveComplaints.length) {
    console.log(`  tracking ids             : ${liveComplaints.map((c) => c.tracking_id).join(', ')}`);
  }
  if (liveWildlife.length) {
    console.log(`  reference ids            : ${liveWildlife.map((w) => w.reference_id).join(', ')}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN - nothing deleted. Re-run with --remove --apply to delete.\n');
    return;
  }

  const cIds = liveComplaints.map((c) => c.complaint_id);
  const wIds = liveWildlife.map((w) => w.turnover_id);

  // Children first (FK), and every filter is an explicit list of primary keys.
  if (cIds.length) {
    await prisma.complaintStatusHistory.deleteMany({ where: { complaint_id: { in: cIds } } });
    await prisma.complaint.deleteMany({ where: { complaint_id: { in: cIds } } });
  }
  if (wIds.length) {
    await prisma.wildlifeStatusHistory.deleteMany({ where: { turnover_id: { in: wIds } } });
    await prisma.wildlifeTurnover.deleteMany({ where: { turnover_id: { in: wIds } } });
  }
  await prisma.auditLog.deleteMany({ where: { log_id: { in: logIds } } });

  console.log(`\nRemoved ${cIds.length} complaint(s), ${wIds.length} wildlife record(s) and ${logIds.length} manifest row(s).\n`);
}

// ---------------------------------------------------------------------------
// Seeding.
// ---------------------------------------------------------------------------
async function seed() {
  const { rows, complaintIds } = await loadBatches();
  if (rows.length) {
    const live = complaintIds.length
      ? await prisma.complaint.count({ where: { complaint_id: { in: complaintIds } } })
      : 0;
    if (live > 0) {
      console.log(`\nA demo batch is already seeded (${live} complaint(s) live).`);
      console.log('Remove it first:  npm run seed:demo -- --remove --apply\n');
      return;
    }
  }

  const barangays = await prisma.barangay.findMany({
    where: { is_active: true },
    select: { barangay_id: true, name: true, latitude: true, longitude: true },
  });
  const byName = new Map(barangays.map((b) => [b.name, b]));

  const residents = await prisma.user.findMany({
    where: { role: 'Resident', is_active: true },
    select: { user_id: true },
  });
  const staff = await prisma.user.findMany({
    where: { role: 'CENRO_Staff', is_active: true },
    select: { user_id: true },
  });
  if (!residents.length) throw new Error('No active Resident account to attribute demo reports to.');
  if (!staff.length) throw new Error('No active CENRO_Staff account to attribute status changes to.');
  const staffId = staff[0].user_id;

  const types = await prisma.complaintType.findMany({
    where: { is_active: true },
    select: { name: true },
  });
  const typeNames = types.map((t) => t.name).filter((n) => DESCRIPTIONS[n]);

  const complaintMinutes = await getSlaMinutes('complaint_sla_minutes', 3365);
  const wildlifeMinutes = await getSlaMinutes('wildlife_sla_minutes', 3218);

  // --- build the complaint plan -------------------------------------------
  const statuses = shuffle(STATUS_BAG);
  const planned = [];
  let cursor = 0;

  for (const [name, count] of Object.entries(COMPLAINTS_PER_BARANGAY)) {
    const b = byName.get(name);
    if (!b) {
      console.log(`  ! barangay "${name}" not found or inactive - skipped`);
      continue;
    }
    if (b.latitude == null || b.longitude == null) {
      console.log(`  ! barangay "${name}" has no centroid - skipped`);
      continue;
    }
    const radius = jitterRadius(b, barangays);
    for (let i = 0; i < count; i += 1) {
      const status = statuses[cursor % statuses.length];
      cursor += 1;
      const type = pick(typeNames);
      const submittedAt = drawSubmittedAt(status);

      // The clock starts on approval, so the deadline has to exist before the
      // rest of the timeline can be drawn against it. Both come from the
      // application's own sla.js - nothing here invents a deadline.
      const approvedAt = status === 'Pending' || status === 'Rejected'
        ? null
        : clamp(addDays(submittedAt, between(0.1, 1.2)), submittedAt.getTime());
      const slaDeadline = approvedAt
        ? await computeSlaDeadline(approvedAt, complaintMinutes)
        : null;

      const { chain, resolvedAt } = buildTimeline(status, submittedAt, approvedAt, slaDeadline);
      const anonymous = rand() < 0.15;
      const { latitude, longitude } = scatter(b, radius);

      planned.push({
        barangay: b,
        status,
        type,
        submittedAt,
        approvedAt,
        slaDeadline,
        resolvedAt,
        chain,
        anonymous,
        latitude,
        longitude,
        priority: rand() < 0.12,
        description: pick(DESCRIPTIONS[type]),
        address: pick(ADDRESS_HINTS),
        userId: anonymous ? null : pick(residents).user_id,
        assignedTo: ['Under_Review', 'In_Progress', 'Resolved'].includes(status) ? staffId : null,
      });
    }
  }

  // --- report --------------------------------------------------------------
  const perBarangay = {};
  const perStatus = {};
  for (const p of planned) {
    perBarangay[p.barangay.name] = (perBarangay[p.barangay.name] || 0) + 1;
    perStatus[p.status] = (perStatus[p.status] || 0) + 1;
  }

  console.log('\n=== DEMONSTRATION DATA PLAN ===\n');
  console.log(`Complaints : ${planned.length} across ${Object.keys(perBarangay).length} barangay(s), all geotagged`);
  console.log(`Wildlife   : ${WILDLIFE_PLAN.length} turnovers, all geotagged`);
  console.log(`SLA budget : complaint ${complaintMinutes} min / wildlife ${wildlifeMinutes} min (working time)`);
  console.log('\nStatus mix:');
  for (const [s, n] of Object.entries(perStatus).sort((a, b2) => b2[1] - a[1])) {
    console.log(`  ${s.padEnd(14)} ${String(n).padStart(3)}`);
  }
  console.log('\nPer barangay:');
  for (const [n, c] of Object.entries(perBarangay)) {
    console.log(`  ${n.padEnd(16)} ${'#'.repeat(c)} ${c}`);
  }
  const markerCount = planned.filter((p) => p.status !== 'Rejected').length + WILDLIFE_PLAN.length;
  console.log(`\nMarker layer will receive ${markerCount} points (Rejected complaints are excluded by gis.service).`);

  const judged = planned.filter((p) => p.slaDeadline);
  const breached = judged.filter((p) => computeExceededSla(p.slaDeadline, p.resolvedAt)).length;
  console.log(
    `SLA preview: ${judged.length - breached}/${judged.length} of the rows with a running clock are within deadline`
    + ` (${planned.length - judged.length} not yet approved, so no commitment exists).`
  );
  console.log('  This ratio is a seed parameter (ON_TIME_SHARE), NOT a measurement. Do not quote it as a result.');

  if (!APPLY) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to insert.\n');
    return;
  }

  // --- write ---------------------------------------------------------------
  const createdComplaints = [];
  const createdWildlife = [];

  for (const p of planned) {
    const slaStartedAt = p.approvedAt;
    const slaDeadline = p.slaDeadline;
    const exceeded = computeExceededSla(slaDeadline, p.resolvedAt);

    const row = await createSequential({
      model: 'complaint',
      type: 'complaint',
      idField: 'tracking_id',
      year: p.submittedAt.getFullYear(),
      data: {
        user_id: p.userId,
        is_anonymous: p.anonymous,
        barangay_id: p.barangay.barangay_id,
        complaint_type: p.type,
        description: p.description,
        latitude: p.latitude,
        longitude: p.longitude,
        address_details: p.address,
        status: p.status,
        priority: p.priority,
        assigned_to: p.assignedTo,
        submitted_at: p.submittedAt,
        resolved_at: p.resolvedAt,
        sla_started_at: slaStartedAt,
        sla_deadline: slaDeadline,
        exceeded_sla: exceeded,
      },
      select: { complaint_id: true, tracking_id: true },
    });

    for (const step of p.chain) {
      await prisma.complaintStatusHistory.create({
        data: {
          complaint_id: row.complaint_id,
          old_status: step.old_status,
          new_status: step.new_status,
          changed_by: staffId,
          changed_at: step.changed_at,
          note: null,
        },
      });
    }

    createdComplaints.push(row);
    process.stdout.write('.');
  }

  for (const w of WILDLIFE_PLAN) {
    const b = byName.get(w.barangay);
    if (!b || b.latitude == null) continue;
    const radius = jitterRadius(b, barangays);
    const { latitude, longitude } = scatter(b, radius);
    const submittedAt = new Date(CAP - Math.floor(between(5, 150)) * DAY);
    // Wildlife stays submission-based: the animal's clock starts when reported.
    const slaDeadline = await computeSlaDeadline(submittedAt, wildlifeMinutes);
    const terminal = ['Released', 'Transferred', 'Deceased'].includes(w.status);
    const releaseDate = terminal ? clamp(addDays(submittedAt, between(2, 14)), submittedAt.getTime()) : null;

    const row = await createSequential({
      model: 'wildlifeTurnover',
      type: 'wildlife',
      idField: 'reference_id',
      year: submittedAt.getFullYear(),
      data: {
        reported_by: pick(residents).user_id,
        processed_by: staffId,
        barangay_id: b.barangay_id,
        species_name: w.species,
        species_category: w.category,
        is_endangered: w.endangered,
        is_priority_review: w.endangered, // wildlife.service sets priority from endangered
        animal_condition: w.condition,
        description: w.desc,
        latitude,
        longitude,
        address_details: pick(ADDRESS_HINTS),
        status: w.status,
        submitted_at: submittedAt,
        release_date: releaseDate,
        sla_started_at: submittedAt,
        sla_deadline: slaDeadline,
        exceeded_sla: computeExceededSla(slaDeadline, releaseDate),
      },
      select: { turnover_id: true, reference_id: true },
    });

    if (w.status !== 'Pending_Review') {
      await prisma.wildlifeStatusHistory.create({
        data: {
          turnover_id: row.turnover_id,
          old_status: 'Pending_Review',
          new_status: w.status,
          changed_by: staffId,
          changed_at: releaseDate || clamp(addDays(submittedAt, between(1, 5)), submittedAt.getTime()),
          note: null,
        },
      });
    }

    createdWildlife.push(row);
    process.stdout.write('.');
  }

  console.log('');

  // The manifest. Written LAST, so a crash mid-run leaves no batch claiming
  // rows it never created - the opposite order would strand ids in the log.
  await writeAuditLog({
    performedBy: null,
    action: SEED_ACTION,
    targetTable: 'Complaint',
    targetId: null,
    data: {
      note: 'Demonstration data for the capstone GIS figures. Not test results. Remove with: npm run seed:demo -- --remove --apply',
      seeded_at: new Date().toISOString(),
      complaint_ids: createdComplaints.map((c) => c.complaint_id),
      complaint_tracking_ids: createdComplaints.map((c) => c.tracking_id),
      wildlife_ids: createdWildlife.map((w) => w.turnover_id),
      wildlife_reference_ids: createdWildlife.map((w) => w.reference_id),
    },
  });

  console.log(`\nSeeded ${createdComplaints.length} complaint(s) and ${createdWildlife.length} wildlife record(s).`);
  console.log('Manifest written as a DEMO_GIS_SEED audit row.');
  console.log('Undo at any time:  npm run seed:demo -- --remove --apply\n');
}

(async () => {
  try {
    if (REMOVE) await removeBatch();
    else await seed();
  } catch (e) {
    console.error('\nFAILED:', e.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
