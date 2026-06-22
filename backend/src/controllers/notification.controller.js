const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/notification.service');

const list = asyncHandler(async (req, res) => {
  const data = await service.listForUser(req.user.user_id, { limit: req.query.limit });
  res.json({ success: true, data });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await service.markRead(req.user.user_id, req.params.id);
  res.json({ success: true, data: { notification } });
});

const markAllRead = asyncHandler(async (req, res) => {
  const result = await service.markAllRead(req.user.user_id);
  res.json({ success: true, message: 'All notifications marked read.', data: result });
});

module.exports = { list, markRead, markAllRead };
