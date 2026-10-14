// Resident feedback on a closed case, and the admin view of it.
//
// The resident endpoints are mounted on the three report routers (so the URL
// reads /complaints/CMP-.../feedback); the admin list is on /admin.

const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/feedback.service');

function submit(kind) {
  return asyncHandler(async (req, res) => {
    const reference = req.params.trackingId || req.params.referenceId;
    const feedback = await service.submitFeedback(kind, req.user.user_id, reference, req.body, {
      ipAddress: req.ip,
    });
    res.status(201).json({
      success: true,
      message: 'Thank you. Your feedback has been recorded.',
      data: { feedback },
    });
  });
}

function mine(kind) {
  return asyncHandler(async (req, res) => {
    const reference = req.params.trackingId || req.params.referenceId;
    const result = await service.getOwnFeedback(kind, req.user.user_id, reference);
    res.json({ success: true, data: result });
  });
}

// Admin only - mounted behind the /admin router's own RBAC.
const list = asyncHandler(async (req, res) => {
  const result = await service.listFeedback(req.query);
  res.json({ success: true, data: result });
});

module.exports = {
  submitComplaint: submit('complaint'),
  submitWildlife: submit('wildlife'),
  submitRequest: submit('request'),
  mineComplaint: mine('complaint'),
  mineWildlife: mine('wildlife'),
  mineRequest: mine('request'),
  list,
};
