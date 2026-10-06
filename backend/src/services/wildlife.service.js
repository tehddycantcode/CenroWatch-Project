// Wildlife turnover business logic. Pattern: routes → controllers → services → prisma.
// A species the catalogue marks endangered is routed to Priority_Review - see
// resolveSpecies() in species.service.js, the only place that decision is made.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { createSequential } = require('../utils/createSequential');
const { getSlaMinutes, computeSlaDeadline } = require('../utils/sla');
const { withActive } = require('../utils/archive');
const { notifyReportSubmitted } = require('../utils/notify');
const { resolveSpecies } = require('./species.service');

// Same cap the validator enforces on description. Not a column limit -
// WildlifeTurnover.description is @db.Text (65,535 bytes), nowhere near the
// worst case here - this exists to keep the STORED value inside the range the
// API itself promises to accept, not to avoid a database error.
const DESCRIPTION_MAX = 5000;

// Keep an uncatalogued species name in the report, as the description's first
// line, so it is the first thing staff read. Mirrors withOtherDetail() in
// otherCategory.js, which does the same for an "Other" complaint type.
//
// Runs when species_name matches no catalogue row. Neither the web nor the
// mobile wildlife form is wired to the catalogue yet
// (web/src/pages/resident/WildlifeFormPage.jsx,
// mobile/src/screens/resident/WildlifeFormScreen.js) - but both forms' static
// dropdown lists (web/src/lib/species.js, mobile/src/lib/reports.js) happen to
// carry the exact same ten names the catalogue was seeded with, so picking
// any of those ten resolves against the real row and this returns immediately
// with nothing to fold. This runs only on each form's "Other (specify)..."
// free-text branch today - the minority path - and will keep doing the same
// job for whichever installed build has not taken a future catalogue-aware
// update once one ships.
function foldUnlistedSpecies(description, unlisted) {
  if (!unlisted) return description;
  const folded = `Other: ${unlisted}\n\n${description}`;
  return folded.length <= DESCRIPTION_MAX ? folded : folded.slice(0, DESCRIPTION_MAX);
}

const DETAIL_SELECT = {
  turnover_id: true,
  reference_id: true,
  reported_by: true,
  species_name: true,
  species_category: true,
  is_endangered: true,
  is_priority_review: true,
  animal_condition: true,
  description: true,
  photo_path: true,
  latitude: true,
  longitude: true,
  address_details: true,
  status: true,
  intake_date: true,
  release_date: true,
  transfer_destination: true,
  staff_notes: true,
  submitted_at: true,
  updated_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  barangay_id: true,
  barangay: { select: { name: true } },
  // Progress updates the resident is allowed to see. Deliberately omits
  // changed_by (and any staff relation) so no staff identity leaks.
  status_history: {
    orderBy: { changed_at: 'desc' },
    select: { new_status: true, note: true, changed_at: true },
  },
};

const LIST_SELECT = {
  turnover_id: true,
  reference_id: true,
  species_name: true,
  animal_condition: true,
  is_endangered: true,
  status: true,
  photo_path: true,
  submitted_at: true,
  sla_deadline: true,
  exceeded_sla: true,
  barangay: { select: { name: true } },
};

async function createTurnover(userId, input, photoPath, ctx = {}) {
  const barangay = await prisma.barangay.findUnique({ where: { barangay_id: input.barangay_id } });
  if (!barangay) throw new HttpError(422, 'Selected barangay does not exist.');

  const submitted_at = new Date();
  const year = submitted_at.getFullYear();
  // Wildlife alone keeps a submission-based clock. There is no Approved state in
  // WildlifeStatus and there should not be: an animal's welfare clock starts when
  // someone reports it, and an approval gate would let a distressed animal's SLA
  // sit un-started over a weekend - exactly the wrong incentive.
  const slaMinutes = await getSlaMinutes('wildlife_sla_minutes', 3218);
  const sla_started_at = submitted_at;
  const sla_deadline = await computeSlaDeadline(submitted_at, slaMinutes);

  // THE CATEGORY AND THE ENDANGERED FLAG ARE DERIVED, NEVER READ FROM THE BODY.
  // Both used to come from the client - a free-text category box and a
  // self-declared "I believe this is endangered" checkbox - which made "three
  // exclusive categories" untrue and left a privacy control (public-map
  // obfuscation) in the reporter's hands. input.species_category is now only a
  // fallback for a species row that has no category, which today means the
  // "Other" sentinel alone; input.is_endangered is ignored entirely.
  const species = await resolveSpecies(input.species_name, input.species_category);
  const endangered = species.is_endangered;

  const turnover = await createSequential({
    model: 'wildlifeTurnover',
    type: 'wildlife',
    idField: 'reference_id',
    year,
    data: {
      reported_by: userId,
      barangay_id: input.barangay_id,
      species_name: species.name,
      species_category: species.category,
      is_endangered: endangered,
      is_priority_review: endangered,
      animal_condition: input.animal_condition,
      description: foldUnlistedSpecies(input.description, species.unlisted),
      photo_path: photoPath || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      address_details: input.address_details || null,
      status: endangered ? 'Priority_Review' : 'Pending_Review',
      submitted_at,
      sla_started_at,
      sla_deadline,
    },
    select: DETAIL_SELECT,
  });

  await writeAuditLog({
    performedBy: userId,
    action: 'WILDLIFE_CREATE',
    targetTable: 'WildlifeTurnover',
    targetId: turnover.turnover_id,
    data: {
      reference_id: turnover.reference_id,
      species_name: turnover.species_name,
      is_endangered: endangered,
    },
    ipAddress: ctx.ipAddress || null,
  });

  // Email the resident a receipt for what they just filed. sendMail never
  // throws, so a mail outage cannot fail the submission.
  if (userId) {
    const reporter = await prisma.user.findUnique({
      where: { user_id: userId },
      select: { email: true, first_name: true },
    });
    if (reporter?.email) {
      await notifyReportSubmitted({
        to: reporter.email,
        name: reporter.first_name,
        kind: 'wildlife',
        trackingId: turnover.reference_id,
        type: turnover.species_name,
        barangay: turnover.barangay?.name,
        submittedAt: turnover.submitted_at,
        slaDeadline: turnover.sla_deadline,
      });
    }
  }

  return turnover;
}

function listMyTurnovers(userId) {
  return prisma.wildlifeTurnover.findMany({
    where: withActive({ reported_by: userId }),
    orderBy: { submitted_at: 'desc' },
    select: LIST_SELECT,
  });
}

async function getMyTurnoverByRef(userId, referenceId) {
  const turnover = await prisma.wildlifeTurnover.findUnique({
    where: { reference_id: referenceId },
    select: { ...DETAIL_SELECT, archived_at: true },
  });
  // Archived reads as missing to its owner (see complaint.service).
  if (!turnover || turnover.archived_at) throw new HttpError(404, 'Report not found.');
  if (turnover.reported_by !== userId) throw new HttpError(403, 'You can only view your own reports.');
  delete turnover.archived_at;
  return turnover;
}

module.exports = { createTurnover, listMyTurnovers, getMyTurnoverByRef };
