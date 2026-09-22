// Where the CENRO office is.
//
// Point A for the "how far is this report from us" line on the staff report
// detail page. It lives in SystemSetting rather than in code because an office
// moves, a pin gets corrected, and neither should need a deploy - the Admin
// settings page can edit it.
//
// Reading is deliberately forgiving and returns null rather than throwing: a
// missing or half-filled office is the normal state of a fresh database, not an
// error, and the UI answers it by hiding the distance line entirely. What is
// NOT forgiving is the write - see the coordinate guard in
// admin.settings.service.js, which is where a typo has to be caught.

const prisma = require('../utils/prisma');

const LAT_KEY = 'cenro_office_lat';
const LNG_KEY = 'cenro_office_lng';

// A coordinate is only usable if BOTH halves parse. Half a point is worse than
// none: it would place the office on the equator or the prime meridian and draw
// a confident line to the wrong hemisphere.
function toPoint(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (lat === '' || lng === '' || lat == null || lng == null) return null;
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return null;
  return { lat: latNum, lng: lngNum };
}

async function getOfficeLocation() {
  const rows = await prisma.systemSetting.findMany({
    where: { setting_key: { in: [LAT_KEY, LNG_KEY] } },
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
  return toPoint(byKey[LAT_KEY], byKey[LNG_KEY]);
}

module.exports = { getOfficeLocation, toPoint, LAT_KEY, LNG_KEY };
