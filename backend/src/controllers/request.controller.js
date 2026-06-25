const asyncHandler = require('../utils/asyncHandler');
const requestService = require('../services/request.service');
const storage = require('../services/storage');

const create = asyncHandler(async (req, res) => {
  const documentPath = req.file ? await storage.save('requests', req.file) : null;
  const request = await requestService.createRequest(req.user.user_id, req.body, documentPath, {
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, message: 'Service request submitted.', data: { request } });
});

const listMine = asyncHandler(async (req, res) => {
  const requests = await requestService.listMyRequests(req.user.user_id);
  res.json({ success: true, data: { requests } });
});

const getByTracking = asyncHandler(async (req, res) => {
  const request = await requestService.getMyRequestByTracking(req.user.user_id, req.params.trackingId);
  res.json({ success: true, data: { request } });
});

module.exports = { create, listMine, getByTracking };
