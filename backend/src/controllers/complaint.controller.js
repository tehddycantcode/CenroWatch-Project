const asyncHandler = require('../utils/asyncHandler');
const complaintService = require('../services/complaint.service');
const storage = require('../services/storage');
const HttpError = require('../utils/httpError');

const create = asyncHandler(async (req, res) => {
  // A photo is REQUIRED when a resident files a complaint (evidence). Enforced
  // here so it can't be bypassed even if the client validation is skipped.
  //
  // This rule does NOT branch on `anonymous`, on purpose. The public
  // /anonymous route makes the photo optional because a whistleblower may have
  // no safe way to take one and no account either; a signed-in resident ticking
  // a box is not in that position, and if they are, that route is still open to
  // them. Conditioning evidence on a body field would also mean any client
  // could switch the rule off for ANY complaint by sending is_anonymous=true.
  if (!req.file) throw new HttpError(400, 'A photo is required to file a complaint.');

  // Already coerced from the multipart string by the validator's .toBoolean().
  // The service does the rest: it nulls user_id, changes the audit action, drops
  // the IP and skips the receipt email. Nothing here needs to know how.
  const anonymous = req.body.is_anonymous === true;

  const photoPath = await storage.save('complaints', req.file);
  const complaint = await complaintService.createComplaint(
    req.user.user_id,
    req.body,
    photoPath,
    { ipAddress: req.ip },
    { anonymous }
  );
  res.status(201).json({
    success: true,
    message: anonymous
      ? 'Anonymous report submitted. Save your reference number - it is the only way to check its status.'
      : 'Complaint submitted.',
    data: { complaint: await storage.signFiles(complaint) },
  });
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
