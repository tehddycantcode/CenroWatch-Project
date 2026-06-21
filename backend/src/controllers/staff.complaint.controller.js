const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/staff.complaint.service');

const list = asyncHandler(async (req, res) => {
  const result = await service.listComplaints(req.query);
  res.json({ success: true, data: result });
});

const getOne = asyncHandler(async (req, res) => {
  const complaint = await service.getComplaint(req.params.id);
  res.json({ success: true, data: { complaint } });
});

const updateStatus = asyncHandler(async (req, res) => {
  const complaint = await service.updateComplaintStatus(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Status updated.', data: { complaint } });
});

const update = asyncHandler(async (req, res) => {
  const complaint = await service.updateComplaint(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Complaint updated.', data: { complaint } });
});

module.exports = { list, getOne, updateStatus, update };
