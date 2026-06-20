const asyncHandler = require('../utils/asyncHandler');
const wildlifeService = require('../services/wildlife.service');
const { publicPathFor } = require('../middlewares/upload');

const create = asyncHandler(async (req, res) => {
  const photoPath = req.file ? publicPathFor('wildlife', req.file.filename) : null;
  const turnover = await wildlifeService.createTurnover(req.user.user_id, req.body, photoPath, {
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, message: 'Wildlife turnover submitted.', data: { turnover } });
});

const listMine = asyncHandler(async (req, res) => {
  const turnovers = await wildlifeService.listMyTurnovers(req.user.user_id);
  res.json({ success: true, data: { turnovers } });
});

const getByRef = asyncHandler(async (req, res) => {
  const turnover = await wildlifeService.getMyTurnoverByRef(req.user.user_id, req.params.referenceId);
  res.json({ success: true, data: { turnover } });
});

module.exports = { create, listMine, getByRef };
