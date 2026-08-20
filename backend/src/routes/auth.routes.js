// Auth routes — mounted at /api/v1/auth.
//
// Rate limiting is applied per route here, NOT blanket on the mount. Only the
// four anonymous endpoints carry a strict cap; the authenticated ones below
// them are covered by the global apiLimiter in app.js. See the header of
// middlewares/rateLimiters.js for the reasoning.

const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const { authLimiter, resetLimiter } = require('../middlewares/rateLimiters');
const {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  updateProfileRules,
  changePasswordRules,
  verifyEmailRules,
  changeEmailRules,
} = require('../validators/auth.validators');

// Anonymous — a caller here is guessing at a credential, so the strict caps apply.
router.post('/register', authLimiter, registerRules, validate, authController.register);
router.post('/login', authLimiter, loginRules, validate, authController.login);
router.post('/forgot-password', resetLimiter, forgotPasswordRules, validate, authController.forgotPassword);
router.post('/reset-password', resetLimiter, resetPasswordRules, validate, authController.resetPassword);

// Authenticated — the token already proves who is calling. Global cap only.
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, updateProfileRules, validate, authController.updateMe);
router.post('/change-password', authenticate, changePasswordRules, validate, authController.changePassword);
router.post('/verify-email', authenticate, verifyEmailRules, validate, authController.verifyEmail);
router.post('/resend-verification', authenticate, authController.resendVerification);
router.patch('/email', authenticate, changeEmailRules, validate, authController.changeEmail);

module.exports = router;
