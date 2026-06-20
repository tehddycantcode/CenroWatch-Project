const asyncHandler = require('../utils/asyncHandler');
const gisService = require('../services/gis.service');

const map = asyncHandler(async (req, res) => {
  const markers = await gisService.getMapMarkers();
  res.json({ success: true, data: { markers } });
});

const stats = asyncHandler(async (req, res) => {
  const stats = await gisService.getStats();
  res.json({ success: true, data: { stats } });
});

const feed = asyncHandler(async (req, res) => {
  const feed = await gisService.getFeed();
  res.json({ success: true, data: { feed } });
});

module.exports = { map, stats, feed };
