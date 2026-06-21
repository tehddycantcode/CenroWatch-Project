const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/staff.wildlife.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.listTurnovers(req.query);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const turnover = await service.getTurnover(req.params.id);
  res.json({ success: true, data: { turnover } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const turnover = await service.updateTurnoverStatus(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Status updated.', data: { turnover } });
});

const update = asyncHandler(async (req, res) => {
  const turnover = await service.updateTurnover(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Wildlife record updated.', data: { turnover } });
});

module.exports = { list, getOne, updateStatus, update };
