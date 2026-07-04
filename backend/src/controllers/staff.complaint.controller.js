const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/staff.complaint.service');
const storage = require('../services/storage');

const list = asyncHandler(async (req, res) => {
  const result = await service.listComplaints(req.query);
  res.json({ success: true, data: await storage.signFiles(result) });
});

const getOne = asyncHandler(async (req, res) => {
  const complaint = await service.getComplaint(req.params.id);
  res.json({ success: true, data: { complaint: await storage.signFiles(complaint) } });
});

// Staff logs a walk-in complaint at the office. Photo is optional here.
const createWalkIn = asyncHandler(async (req, res) => {
  const photoPath = req.file ? await storage.save('complaints', req.file) : null;
  const complaint = await service.createWalkInComplaint(req.user.user_id, req.body, photoPath, { ipAddress: req.ip });
  res.status(201).json({ success: true, message: 'Walk-in complaint logged.', data: { complaint: await storage.signFiles(complaint) } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const complaint = await service.updateComplaintStatus(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Status updated.', data: { complaint: await storage.signFiles(complaint) } });
});

const update = asyncHandler(async (req, res) => {
  const complaint = await service.updateComplaint(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Complaint updated.', data: { complaint: await storage.signFiles(complaint) } });
});

module.exports = { list, getOne, createWalkIn, updateStatus, update };
