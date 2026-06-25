const asyncHandler = require('../utils/asyncHandler');
const wildlifeService = require('../services/wildlife.service');
const storage = require('../services/storage');

const create = asyncHandler(async (req, res) => {
  const photoPath = req.file ? await storage.save('wildlife', req.file) : null;
  const turnover = await wildlifeService.createTurnover(req.user.user_id, req.body, photoPath, {
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, message: 'Wildlife turnover submitted.', data: { turnover: await storage.signFiles(turnover) } });
});

const listMine = asyncHandler(async (req, res) => {
  const turnovers = await wildlifeService.listMyTurnovers(req.user.user_id);
  res.json({ success: true, data: { turnovers: await storage.signFiles(turnovers) } });
});

const getByRef = asyncHandler(async (req, res) => {
  const turnover = await wildlifeService.getMyTurnoverByRef(req.user.user_id, req.params.referenceId);
  res.json({ success: true, data: { turnover: await storage.signFiles(turnover) } });
});

module.exports = { create, listMine, getByRef };
