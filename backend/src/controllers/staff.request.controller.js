const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/staff.request.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.listRequests(req.query);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const request = await service.getRequest(req.params.id);
  res.json({ success: true, data: { request } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const request = await service.updateRequestStatus(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Status updated.', data: { request } });
});

const update = asyncHandler(async (req, res) => {
  const request = await service.updateRequest(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Request updated.', data: { request } });
});

module.exports = { list, getOne, updateStatus, update };
