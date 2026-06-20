// Auth controllers — thin HTTP layer over auth.service.

const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');

const register = asyncHandler(async (req, res) => {
  const { user, token } = await authService.register(req.body, { ipAddress: req.ip });
  res.status(201).json({
    success: true,
    message: 'Registration successful.',
    data: { user, token },
  });
});

const login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.body, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: 'Login successful.',
    data: { user, token },
  });
});

// Requires `authenticate` — req.user is set there.
const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user.user_id);
  res.status(200).json({ success: true, data: { user } });
});

module.exports = { register, login, me };
