// Auth routes — mounted at /api/v1/auth (rate-limited in app.js).

const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  updateProfileRules,
  changePasswordRules,
} = require('../validators/auth.validators');

router.post('/register', registerRules, validate, authController.register);
router.post('/login', loginRules, validate, authController.login);
router.post('/forgot-password', forgotPasswordRules, validate, authController.forgotPassword);
router.post('/reset-password', resetPasswordRules, validate, authController.resetPassword);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, updateProfileRules, validate, authController.updateMe);
router.post('/change-password', authenticate, changePasswordRules, validate, authController.changePassword);

module.exports = router;
