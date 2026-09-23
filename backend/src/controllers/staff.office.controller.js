const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const service = require('../services/officeLocation.service');
const routing = require('../services/routing.service');

// The office coordinates, for the "distance from CENRO" line on a report.
//
// `office` is null when an Admin has not filled both coordinates in yet. That is
// a normal state, not an error, so it is a 200 with null rather than a 404 - the
// client answers it by hiding the distance line, and a 404 here would look like
// a broken endpoint in the console of an otherwise healthy app.
const getOfficeLocation = asyncHandler(async (req, res) => {
  const office = await service.getOfficeLocation();
  res.json({ success: true, data: { office } });
});

// The driving route from the office to a report's pin.
//
// Always a 200 with a `route` that may be null, plus a `reason` saying why it is
// null. The client treats every null the same way - keep the straight line it
// already drew - but the reason is what makes this diagnosable from a browser
// or curl when somebody is setting the ORS key up for the first time.
const getRoute = asyncHandler(async (req, res) => {
  // Express 5's req.query is read-only, so the validator's sanitizers do not
  // survive into here; coerce from the raw strings.
  const to = { lat: Number(req.query.lat), lng: Number(req.query.lng) };
  if (!routing.isWithinServiceArea(to)) {
    throw new HttpError(422, 'That destination is outside the Cabuyao service area.');
  }

  const office = await service.getOfficeLocation();
  if (!office) return res.json({ success: true, data: { route: null, reason: 'office_not_set' } });
  if (!routing.isConfigured()) {
    return res.json({ success: true, data: { route: null, reason: 'routing_not_configured' } });
  }

  const route = await routing.getRoute(office, to);
  res.json({
    success: true,
    data: { route, from: office, reason: route ? null : 'routing_unavailable' },
  });
});

module.exports = { getOfficeLocation, getRoute };
