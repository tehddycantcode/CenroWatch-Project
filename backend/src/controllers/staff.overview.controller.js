const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/staff.overview.service');

const getOverview = asyncHandler(async (req, res) => {
  const overview = await service.getOverview();
  res.json({ success: true, data: { overview } });
});

module.exports = { getOverview };
