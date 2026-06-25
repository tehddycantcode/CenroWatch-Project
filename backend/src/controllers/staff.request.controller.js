const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/staff.request.service');
const storage = require('../services/storage');

const list = asyncHandler(async (req, res) => {
  const result = await service.listRequests(req.query);
  res.json({ success: true, data: await storage.signFiles(result) });
});

const getOne = asyncHandler(async (req, res) => {
  const request = await service.getRequest(req.params.id);
  res.json({ success: true, data: { request: await storage.signFiles(request) } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const request = await service.updateRequestStatus(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Status updated.', data: { request: await storage.signFiles(request) } });
});

const update = asyncHandler(async (req, res) => {
  const request = await service.updateRequest(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Request updated.', data: { request: await storage.signFiles(request) } });
});

module.exports = { list, getOne, updateStatus, update };
