const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/staff.wildlife.service');
const storage = require('../services/storage');

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

const addCustodyPhotos = asyncHandler(async (req, res) => {
  const paths = await Promise.all((req.files || []).map((f) => storage.save('custody', f)));
  const turnover = await service.addCustodyPhotos(req.user.user_id, req.params.id, paths, { ipAddress: req.ip });
  res.status(201).json({ success: true, message: 'Chain-of-custody photos added.', data: { turnover } });
});

const removeCustodyPhoto = asyncHandler(async (req, res) => {
  const turnover = await service.removeCustodyPhoto(req.user.user_id, req.params.id, req.body?.path, { ipAddress: req.ip });
  res.json({ success: true, message: 'Photo removed.', data: { turnover } });
});

module.exports = { list, getOne, updateStatus, update, addCustodyPhotos, removeCustodyPhoto };
