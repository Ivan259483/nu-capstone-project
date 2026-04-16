import express from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  validateRegistration,
  validateLogin,
  validateSendOtp,
  validateVerifyOtp,
  validateForgotPassword,
  validateResetPassword,
  validateSocialLogin,
} from '../middleware/validation.middleware.js';

const router = express.Router();

/**
 * @route POST /api/auth/send-otp
 * @desc Send OTP to email for signup/login
 * @access Public
 * @body { email: string }
 */
router.post('/send-otp', validateSendOtp, authController.sendOtp);

/**
 * @route POST /api/auth/forgot-password
 * @desc Request OTP for password reset
 * @access Public
 */
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);

/**
 * @route POST /api/auth/reset-password
 * @desc Reset password using OTP
 * @access Public
 */
router.post('/reset-password', validateResetPassword, authController.resetPassword);


/**
 * @route POST /api/auth/verify-otp
 * @desc Verify OTP code
 * @access Public
 * @body { email: string, otp: string }
 */
router.post('/verify-otp', validateVerifyOtp, authController.verifyOtp);

/**
 * @route POST /api/auth/register
 * @desc Register a new user (requires verified OTP)
 * @access Public
 * @body { name: string, email: string, password: string, role?: string }
 */
router.post('/register', validateRegistration, authController.register);

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 * @body { email: string, password: string }
 */
router.post('/login', validateLogin, authController.login);

/**
 * @route POST /api/auth/social-login
 * @desc Social Login (Google/Facebook)
 * @access Public
 * @body { email: string, name: string, provider: string, providerId: string }
 */
router.post('/social-login', validateSocialLogin, authController.socialLogin);

/**
 * @route GET /api/auth/me
 * @desc Get current user
 * @access Private
 */
router.get('/me', authenticate, authController.getCurrentUser);

/**
 * @route POST /api/auth/logout
 * @desc Logout user
 * @access Private
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route DELETE /api/auth/account
 * @desc Permanently delete the authenticated user's account
 *       Deletes Firebase Auth user AND all associated MongoDB records.
 * @access Private
 * @body { password: string }
 */
router.delete('/account', authenticate, authController.deleteAccount);

export default router;
