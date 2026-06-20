const asyncHandler = require('../utils/asyncHandler');
const complaintService = require('../services/complaint.service');
const { publicPathFor } = require('../middlewares/upload');

const create = asyncHandler(async (req, res) => {
  const photoPath = req.file ? publicPathFor('complaints', req.file.filename) : null;
  const complaint = await complaintService.createComplaint(req.user.user_id, req.body, photoPath, {
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, message: 'Complaint submitted.', data: { complaint } });
});

const listMine = asyncHandler(async (req, res) => {
  const complaints = await complaintService.listMyComplaints(req.user.user_id);
  res.json({ success: true, data: { complaints } });
});

const getByTracking = asyncHandler(async (req, res) => {
  const complaint = await complaintService.getMyComplaintByTracking(
    req.user.user_id,
    req.params.trackingId
  );
  res.json({ success: true, data: { complaint } });
});

module.exports = { create, listMine, getByTracking };
