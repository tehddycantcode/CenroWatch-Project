const asyncHandler = require('../utils/asyncHandler');
const complaintService = require('../services/complaint.service');
const storage = require('../services/storage');
const HttpError = require('../utils/httpError');
const { filesFrom, saveAll } = require('../utils/uploadFields');

const create = asyncHandler(async (req, res) => {
  // A photo is REQUIRED when a resident files a complaint (evidence). Enforced
  // here so it can't be bypassed even if the client validation is skipped.
  //
  // This rule does NOT branch on `anonymous`, on purpose. Conditioning evidence
  // on a body field would mean any client could switch the rule off for ANY
  // complaint by sending is_anonymous=true.
  //
  // The public /anonymous route USED TO make the photo optional, for a
  // whistleblower with no safe way to take one. It no longer does, on the
  // user's instruction (2026-10-12) that every report carry evidence, so there
  // is no longer a no-photo path anywhere. That reasoning did not stop being
  // true - it was weighed and overruled.
  const files = filesFrom(req, 'photo', 'photos');
  if (files.length === 0) throw new HttpError(400, 'A photo is required to file a complaint.');

  // Already coerced from the multipart string by the validator's .toBoolean().
  // The service does the rest: it nulls user_id, changes the audit action, drops
  // the IP and skips the receipt email. Nothing here needs to know how.
  const anonymous = req.body.is_anonymous === true;

  const { first: photoPath, all: photoPaths } = await saveAll(storage, 'complaints', files);
  const complaint = await complaintService.createComplaint(
    req.user.user_id,
    req.body,
    photoPath,
    { ipAddress: req.ip },
    { anonymous, photoPaths }
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
  // A PHOTO IS REQUIRED HERE TOO since 2026-10-12, on the user's instruction.
  // It was deliberately optional before, because a whistleblower may have no
  // safe way to take one - that reasoning has not stopped being true, it was
  // weighed and overruled in favour of every report carrying evidence. If this
  // is ever revisited, the thing to restore is the exemption, not the comment.
  const files = filesFrom(req, 'photo', 'photos');
  if (files.length === 0) throw new HttpError(400, 'A photo is required. Attach one showing what you are reporting.');

  const { first: photoPath, all: photoPaths } = await saveAll(storage, 'complaints', files);
  const complaint = await complaintService.createComplaint(null, req.body, photoPath, { ipAddress: req.ip }, { anonymous: true, photoPaths });
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
