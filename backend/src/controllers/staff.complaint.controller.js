const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/staff.complaint.service');
const storage = require('../services/storage');
const { filesFrom, saveAll } = require('../utils/uploadFields');

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
  // A counter clerk photographs what the resident brought in, and may have
  // several shots. Not REQUIRED here, unlike the resident routes: the person
  // is standing at the desk describing it, and refusing to log their complaint
  // because the clerk has no camera would turn a staffing gap into a lost
  // report.
  const files = filesFrom(req, 'photo', 'photos');
  const { first: photoPath, all: photoPaths } = await saveAll(storage, 'complaints', files);
  const complaint = await service.createWalkInComplaint(req.user.user_id, req.body, photoPath, { ipAddress: req.ip, photoPaths });
  res.status(201).json({ success: true, message: 'Walk-in complaint logged.', data: { complaint: await storage.signFiles(complaint) } });
});

const updateStatus = asyncHandler(async (req, res) => {
  // The proof path is minted HERE from the uploaded file, never read from the
  // body: otherwise a caller could post any string and satisfy the gate.
  const { resolution_proof_path: _ignored, ...body } = req.body;
  const proofPath = req.file ? await storage.save('proof', req.file) : null;
  const complaint = await service.updateComplaintStatus(req.user.user_id, req.params.id, {
    ...body,
    ...(proofPath ? { resolution_proof_path: proofPath } : {}),
  }, { ipAddress: req.ip });
  res.json({ success: true, message: 'Status updated.', data: { complaint: await storage.signFiles(complaint) } });
});

const update = asyncHandler(async (req, res) => {
  const complaint = await service.updateComplaint(req.user.user_id, req.params.id, req.body, { ipAddress: req.ip });
  res.json({ success: true, message: 'Complaint updated.', data: { complaint: await storage.signFiles(complaint) } });
});

module.exports = { list, getOne, createWalkIn, updateStatus, update };
