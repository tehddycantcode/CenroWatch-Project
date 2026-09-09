// Barangay lookups and admin management. The public list endpoint backs the
// registration / report-filing dropdowns. Returns ZERO personal data (R.A. 10173).

const prisma = require('../utils/prisma');
const HttpError = require('../utils/httpError');
const { writeAuditLog } = require('../utils/audit');
const { boundaryFeature } = require('../utils/barangayBoundaries');

// Public list: only barangays that may still be selected. A retired barangay
// stays on the reports that already reference it but must not be pickable.
function listBarangays() {
  return prisma.barangay.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' },
    select: { barangay_id: true, name: true, latitude: true, longitude: true },
  });
}

/**
 * Recompute every barangay's Voronoi boundary from the full set of centroids.
 *
 * This is why barangay mutations are not a simple one-row update: a Voronoi cell
 * is defined RELATIVE to every other site, so adding, moving or retiring one
 * barangay reshapes its neighbours. Updating only the changed row would leave
 * the choropleth with overlapping polygons and gaps that no one would notice
 * until the map looked wrong. Retired barangays are excluded from the site set,
 * so their area is absorbed by the neighbours rather than left as a hole.
 */
async function rederiveBoundaries(tx = prisma) {
  const active = await tx.barangay.findMany({
    where: { is_active: true, latitude: { not: null }, longitude: { not: null } },
    orderBy: { barangay_id: 'asc' },
    select: { barangay_id: true, name: true, latitude: true, longitude: true },
  });
  const sites = active.map((b) => [b.longitude, b.latitude]);
  for (let i = 0; i < active.length; i++) {
    await tx.barangay.update({
      where: { barangay_id: active[i].barangay_id },
      data: { geojson_boundary: boundaryFeature(active[i].name, sites, i) },
    });
  }
  return active.length;
}

// Admin view: every barangay including retired ones, with how many reports
// reference each - the number that tells an Admin whether retiring one matters.
async function listAllBarangays() {
  const rows = await prisma.barangay.findMany({
    orderBy: { name: 'asc' },
    select: {
      barangay_id: true, name: true, latitude: true, longitude: true, is_active: true,
      _count: { select: { complaints: true, wildlife_turnovers: true, env_requests: true, users: true } },
    },
  });
  return rows.map(({ _count, ...b }) => ({
    ...b,
    in_use: _count.complaints + _count.wildlife_turnovers + _count.env_requests,
    residents: _count.users,
  }));
}

async function createBarangay(adminId, input, ctx = {}) {
  const name = String(input.name || '').trim();
  if (!name) throw new HttpError(422, 'A name is required.');

  const clash = await prisma.barangay.findUnique({ where: { name } });
  if (clash) throw new HttpError(409, 'A barangay with that name already exists.');

  const created = await prisma.barangay.create({
    data: {
      name,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
    select: { barangay_id: true, name: true, latitude: true, longitude: true, is_active: true },
  });

  await rederiveBoundaries();

  await writeAuditLog({
    performedBy: adminId,
    action: 'BARANGAY_CREATE',
    targetTable: 'Barangay',
    targetId: created.barangay_id,
    data: { name: created.name },
    ipAddress: ctx.ipAddress || null,
  });

  return created;
}

async function updateBarangay(adminId, id, input, ctx = {}) {
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) throw new HttpError(404, 'Barangay not found.');

  const existing = await prisma.barangay.findUnique({ where: { barangay_id: targetId } });
  if (!existing) throw new HttpError(404, 'Barangay not found.');

  const data = {};
  // The name is not editable: it is the unique key seed.js upserts on, so a
  // rename would make the next seed run recreate the original alongside it.
  if (input.latitude !== undefined) data.latitude = input.latitude ?? null;
  if (input.longitude !== undefined) data.longitude = input.longitude ?? null;
  if (input.is_active !== undefined) data.is_active = Boolean(input.is_active);

  if (Object.keys(data).length === 0) throw new HttpError(422, 'Nothing to change.');

  // Residents are assigned to a barangay at registration; retiring the last one
  // would leave the registration form with nothing to pick.
  if (data.is_active === false && existing.is_active) {
    const remaining = await prisma.barangay.count({ where: { is_active: true } });
    if (remaining <= 1) {
      throw new HttpError(422, 'This is the last active barangay. Add another one before retiring it.');
    }
  }

  const updated = await prisma.barangay.update({
    where: { barangay_id: targetId },
    data,
    select: { barangay_id: true, name: true, latitude: true, longitude: true, is_active: true },
  });

  // Coordinates or active-set changed, so every cell may have moved.
  if (data.latitude !== undefined || data.longitude !== undefined || data.is_active !== undefined) {
    await rederiveBoundaries();
  }

  await writeAuditLog({
    performedBy: adminId,
    action: 'BARANGAY_UPDATE',
    targetTable: 'Barangay',
    targetId: targetId,
    data: { name: existing.name, fields: Object.keys(data) },
    ipAddress: ctx.ipAddress || null,
  });

  return updated;
}

module.exports = {
  listBarangays,
  listAllBarangays,
  createBarangay,
  updateBarangay,
  rederiveBoundaries,
};
