// Barangay lookups. The public list endpoint backs the registration /
// report-filing dropdowns. Returns ZERO personal data (R.A. 10173).

const prisma = require('../utils/prisma');

function listBarangays() {
  return prisma.barangay.findMany({
    orderBy: { name: 'asc' },
    select: { barangay_id: true, name: true, latitude: true, longitude: true },
  });
}

module.exports = { listBarangays };
