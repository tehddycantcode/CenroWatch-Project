const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/officeLocation.service');

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

module.exports = { getOfficeLocation };
