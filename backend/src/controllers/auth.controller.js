// Auth controllers — thin HTTP layer over auth.service.

const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');
const verificationService = require('../services/emailVerification.service');
const { setSessionCookie, clearSessionCookie } = require('../utils/sessionCookie');

// register/login hand the same JWT to both clients: the web app receives it as
// an HttpOnly cookie it can never read (so an XSS cannot steal the session),
// while `token` stays in the body for the mobile app, which has no cookie jar
// and sends it back as a Bearer header. See utils/sessionCookie.js.
const register = asyncHandler(async (req, res) => {
  const { user, token } = await authService.register(req.body, { ipAddress: req.ip });
  setSessionCookie(res, token);
  res.status(201).json({
    success: true,
    message: 'Registration successful.',
    data: { user, token },
  });
});

// `remember` is the only place the choice is made. Absent means remembered, so
// a client that does not send the field - the installed mobile build, for one -
// keeps the behaviour it has always had instead of being cut to 12 hours.
const login = asyncHandler(async (req, res) => {
  const remember = req.body.remember !== false;
  const { user, token } = await authService.login(req.body, { ipAddress: req.ip });
  setSessionCookie(res, token, remember);
  res.status(200).json({
    success: true,
    message: 'Login successful.',
    data: { user, token },
  });
});

// Deliberately NOT behind `authenticate`: signing out has to work even when the
// token has already expired or been revoked, and a 401 here would strand the
// cookie in the browser. Clearing your own cookie mutates no data, so there is
// nothing to audit. Mobile signs out by deleting its keychain entry.
const logout = asyncHandler(async (req, res) => {
  clearSessionCookie(res);
  res.status(200).json({ success: true, message: 'Signed out.' });
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

// Changing a password signs out every OTHER device (authenticate refuses tokens
// issued before User.password_changed_at). This device keeps its session via a
// replacement token - refreshed in the cookie for web, returned in the body for
// mobile, exactly as login does - so the person changing their own password is
// not the one it locks out.
const changePassword = asyncHandler(async (req, res) => {
  // Carried over from the session making this request, never defaulted - see
  // the note on tokenFor in auth.service.
  const remember = req.session?.remember !== false;
  const { token } = await authService.changePassword(
    req.user.user_id,
    req.body.current_password,
    req.body.new_password,
    { ipAddress: req.ip, remember }
  );
  setSessionCookie(res, token, remember);
  res.status(200).json({
    success: true,
    message: 'Your password has been changed. Any other devices have been signed out.',
    data: { token },
  });
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

module.exports = { register, login, logout, me, updateMe, changePassword, forgotPassword, resetPassword, verifyEmail, resendVerification, changeEmail };
