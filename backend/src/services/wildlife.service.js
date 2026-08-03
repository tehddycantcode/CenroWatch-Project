// Wildlife turnover business logic. Pattern: routes → controllers → services → prisma.
// A resident-flagged endangered species is routed to Priority_Review.

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { createSequential } = require('../utils/createSequential');
const { getSlaMinutes, addMinutes } = require('../utils/sla');
const { withActive } = require('../utils/archive');

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
  const slaMinutes = await getSlaMinutes('wildlife_sla_minutes', 3218);
  const sla_deadline = addMinutes(submitted_at, slaMinutes);
  const endangered = !!input.is_endangered;

  const turnover = await createSequential({
    model: 'wildlifeTurnover',
    type: 'wildlife',
    idField: 'reference_id',
    year,
    data: {
      reported_by: userId,
      barangay_id: input.barangay_id,
      species_name: input.species_name,
      species_category: input.species_category || null,
      is_endangered: endangered,
      is_priority_review: endangered,
      animal_condition: input.animal_condition,
      description: input.description,
      photo_path: photoPath || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      address_details: input.address_details || null,
      status: endangered ? 'Priority_Review' : 'Pending_Review',
      submitted_at,
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
