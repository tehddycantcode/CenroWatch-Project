const asyncHandler = require('../utils/asyncHandler');
const complaintService = require('../services/complaint.service');
const storage = require('../services/storage');

const create = asyncHandler(async (req, res) => {
  const photoPath = req.file ? await storage.save('complaints', req.file) : null;
  const complaint = await complaintService.createComplaint(req.user.user_id, req.body, photoPath, {
    ipAddress: req.ip,
  });
  res.status(201).json({ success: true, message: 'Complaint submitted.', data: { complaint: await storage.signFiles(complaint) } });
});

// Public anonymous/whistleblower submission — no auth, no reporter identity.
const createAnonymous = asyncHandler(async (req, res) => {
  const photoPath = req.file ? await storage.save('complaints', req.file) : null;
  const complaint = await complaintService.createComplaint(null, req.body, photoPath, { ipAddress: req.ip }, { anonymous: true });
  res.status(201).json({
    success: true,
    message: 'Anonymous report submitted. Save your reference number to track its status.',
    data: { complaint: await storage.signFiles(complaint) },
  });
});

// Public status lookup by tracking id (zero personal data).
const trackPublic = asyncHandler(async (req, res) => {
  const complaint = await complaintService.getPublicComplaintStatus(req.params.trackingId);
  res.json({ success: true, data: { complaint: await storage.signFiles(complaint) } });
});

const listMine = asyncHandler(async (req, res) => {
  const complaints = await complaintService.listMyComplaints(req.user.user_id);
  res.json({ success: true, data: { complaints: await storage.signFiles(complaints) } });
});

const getByTracking = asyncHandler(async (req, res) => {
  const complaint = await complaintService.getMyComplaintByTracking(
    req.user.user_id,
    req.params.trackingId
  );
  res.json({ success: true, data: { complaint: await storage.signFiles(complaint) } });
});

module.exports = { create, createAnonymous, trackPublic, listMine, getByTracking };
