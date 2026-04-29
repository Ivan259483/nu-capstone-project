import express from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import {
  validateRegistration,
  validateLogin,
  validateSendOtp,
  validateVerifyOtp,
  validateForgotPassword,
  validateResetPassword,
  validateSocialLogin,
  validateVerifyLoginOtp,
  validateResendLoginOtp,
} from '../middleware/validation.middleware.js';

const router = express.Router();

// ─── Public Auth ─────────────────────────────────────────────────────────────

router.post('/send-otp', validateSendOtp, authController.sendOtp);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', validateResetPassword, authController.resetPassword);
router.post('/verify-otp', validateVerifyOtp, authController.verifyOtp);
router.post('/register', validateRegistration, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/social-login', validateSocialLogin, authController.socialLogin);
router.post('/resend-otp', authController.resendOtp);

// ─── 2FA (login OTP flow) ────────────────────────────────────────────────────

router.post('/verify-login-otp', validateVerifyLoginOtp, authController.verifyLoginOtp);
router.post('/resend-login-otp', validateResendLoginOtp, authController.resendLoginOtp);

// ─── Protected ───────────────────────────────────────────────────────────────

router.get('/me', authenticate, authController.getCurrentUser);
router.post('/logout', authenticate, authController.logout);
router.delete('/account', authenticate, authController.deleteAccount);

/**
 * @route POST /api/auth/set-password
 * @desc Staff first-login forced password change
 * @access Private (JWT required — issued at login with requiresPasswordChange flag)
 */
router.post('/set-password', authenticate, authController.setPassword);

/**
 * @route POST /api/auth/create-staff
 * @desc Admin creates a new staff account
 * @access Private — administrator, office_admin, operation_manager, hr only
 */
router.post(
  '/create-staff',
  authenticate,
  authorize('administrator', 'office_admin', 'operation_manager', 'hr'),
  authController.createStaff
);

/**
 * @route POST /api/auth/unlock
 * @desc  Unlock a locked-out account by resetting loginAttempts + lockUntil
 * @access Dev: public | Prod: administrator / office_admin only
 */
if (process.env.NODE_ENV === 'development') {
  // ⚡ Dev shortcut — no auth required
  router.post('/unlock', authController.unlockAccount);
} else {
  // 🔒 Production — admin roles only
  router.post(
    '/unlock',
    authenticate,
    authorize('administrator', 'office_admin'),
    authController.unlockAccount
  );
}

/**
 * @route POST /api/auth/recover-firebase
 * @desc  Restore a Firebase Auth account for customers who registered on web
 *        but had their Firebase account purged by the old /register logic.
 *        Validates MongoDB password then re-creates Firebase account via Admin SDK.
 * @access Public (password serves as credential)
 */
router.post('/recover-firebase', authController.recoverFirebase);

export default router;
