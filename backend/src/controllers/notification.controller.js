const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const service = require('../services/notification.service');
const push = require('../services/push.service');

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

// Remember this device so status changes can reach it while the app is closed.
// Rejecting a malformed token here rather than storing it keeps obvious rubbish
// out of the table; Expo remains the real authority on whether a token is live,
// and tells us so by answering DeviceNotRegistered.
const registerDevice = asyncHandler(async (req, res) => {
  const { token, platform } = req.body || {};
  if (!push.isExpoPushToken(token)) throw new HttpError(422, 'A valid Expo push token is required.');
  await push.registerDevice(req.user.user_id, token, platform);
  res.status(200).json({ success: true, message: 'Device registered for notifications.' });
});

// Called on sign-out. Deliberately takes the token in the body rather than
// clearing every device for the user: signing out of one phone must not stop
// notifications reaching the same person's other phone.
const unregisterDevice = asyncHandler(async (req, res) => {
  const { token } = req.body || {};
  if (!token) throw new HttpError(422, 'A token is required.');
  await push.unregisterDevice(token);
  res.status(200).json({ success: true, message: 'Device removed.' });
});

module.exports = { list, markRead, markAllRead, registerDevice, unregisterDevice };
