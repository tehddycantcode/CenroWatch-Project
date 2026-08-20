// Auth controllers — thin HTTP layer over auth.service.

const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');
const verificationService = require('../services/emailVerification.service');

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

const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user.user_id, req.body, { ipAddress: req.ip });
  res.status(200).json({ success: true, message: 'Profile updated.', data: { user } });
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.user_id, req.body.current_password, req.body.new_password, { ipAddress: req.ip });
  res.status(200).json({ success: true, message: 'Your password has been changed.' });
});

// All three require `authenticate`: the soft gate means the resident is
// already signed in while their address is still unconfirmed.
const verifyEmail = asyncHandler(async (req, res) => {
  await verificationService.verifyCode(req.user.user_id, req.body.code, { ipAddress: req.ip });
  const user = await authService.getProfile(req.user.user_id);
  res.status(200).json({ success: true, message: 'Your email address is confirmed.', data: { user } });
});

const resendVerification = asyncHandler(async (req, res) => {
  await verificationService.sendVerificationCode(req.user.user_id, { ipAddress: req.ip });
  res.status(200).json({ success: true, message: 'A new code is on its way.' });
});

const changeEmail = asyncHandler(async (req, res) => {
  await verificationService.changeUnverifiedEmail(req.user.user_id, req.body.email, { ipAddress: req.ip });
  const user = await authService.getProfile(req.user.user_id);
  res.status(200).json({ success: true, message: 'Address updated. Check it for a new code.', data: { user } });
});

// Public. Generic response regardless of whether the email exists (no enumeration).
const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email, { ipAddress: req.ip });
  res.status(200).json({
    success: true,
    message: 'If an account exists for that email, a password reset link has been sent.',
  });
});

// Public. Consumes the token and sets the new password.
const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password, { ipAddress: req.ip });
  res.status(200).json({ success: true, message: 'Your password has been reset. You can now sign in.' });
});

module.exports = { register, login, me, updateMe, changePassword, forgotPassword, resetPassword, verifyEmail, resendVerification, changeEmail };
