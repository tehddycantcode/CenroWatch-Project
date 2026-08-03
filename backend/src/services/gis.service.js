// Public GIS / feed / stats. PUBLIC endpoints — return ZERO personal data
// (no reporter identity), and obfuscate endangered-species coordinates.

const prisma = require('../utils/prisma');
const { obfuscatePoint } = require('../utils/geo');
const { NOT_ARCHIVED, withActive } = require('../utils/archive');

// Map markers: environmental complaints + wildlife sightings that have coords.
async function getMapMarkers() {
  const [complaints, wildlife] = await Promise.all([
    prisma.complaint.findMany({
      where: withActive({ latitude: { not: null }, longitude: { not: null }, status: { not: 'Rejected' } }),
      select: {
        tracking_id: true,
        complaint_type: true,
        status: true,
        priority: true,
        latitude: true,
        longitude: true,
        barangay: { select: { name: true } },
      },
    }),
    prisma.wildlifeTurnover.findMany({
      where: withActive({ latitude: { not: null }, longitude: { not: null } }),
      select: {
        reference_id: true,
        species_name: true,
        is_endangered: true,
        status: true,
        latitude: true,
        longitude: true,
        barangay: { select: { name: true } },
      },
    }),
  ]);

  const markers = [];

  for (const c of complaints) {
    markers.push({
      id: c.tracking_id,
      kind: 'complaint',
      category: c.complaint_type,
      status: c.status,
      priority: c.priority,
      barangay: c.barangay?.name || null,
      latitude: c.latitude,
      longitude: c.longitude,
    });
  }

  for (const w of wildlife) {
    let { latitude, longitude } = w;
    // Obfuscate endangered-species coordinates on public output.
    if (w.is_endangered) ({ latitude, longitude } = obfuscatePoint(latitude, longitude, w.reference_id));
    markers.push({
      id: w.reference_id,
      kind: 'wildlife',
      category: w.species_name,
      status: w.status,
      endangered: w.is_endangered,
      barangay: w.barangay?.name || null,
      latitude,
      longitude,
    });
  }

  return markers;
}

async function getStats() {
  const [complaints, wildlife, requests, resolvedComplaints] = await Promise.all([
    prisma.complaint.count({ where: NOT_ARCHIVED }),
    prisma.wildlifeTurnover.count({ where: NOT_ARCHIVED }),
    prisma.environmentalRequest.count({ where: NOT_ARCHIVED }),
    prisma.complaint.count({ where: withActive({ status: 'Resolved' }) }),
  ]);
  return {
    total_reports: complaints + wildlife + requests,
    resolved: resolvedComplaints,
    wildlife_cases: wildlife,
    barangays_covered: 18,
  };
}

async function getFeed(limit = 20) {
  const [complaints, wildlife] = await Promise.all([
    prisma.complaint.findMany({
      where: withActive({ status: { not: 'Rejected' } }),
      orderBy: { submitted_at: 'desc' },
      take: limit,
      select: { tracking_id: true, complaint_type: true, status: true, submitted_at: true, barangay: { select: { name: true } } },
    }),
    prisma.wildlifeTurnover.findMany({
      where: NOT_ARCHIVED,
      orderBy: { submitted_at: 'desc' },
      take: limit,
      select: { reference_id: true, species_name: true, status: true, submitted_at: true, barangay: { select: { name: true } } },
    }),
  ]);

  return [
    ...complaints.map((c) => ({ id: c.tracking_id, kind: 'complaint', title: c.complaint_type, status: c.status, date: c.submitted_at, barangay: c.barangay?.name || null })),
    ...wildlife.map((w) => ({ id: w.reference_id, kind: 'wildlife', title: w.species_name, status: w.status, date: w.submitted_at, barangay: w.barangay?.name || null })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
}

module.exports = { getMapMarkers, getStats, getFeed };
