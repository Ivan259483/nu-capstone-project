import express from 'express';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route POST /api/auth/send-otp
 * @desc Send OTP to email for signup/login
 * @access Public
 * @body { email: string }
 */
router.post('/send-otp', authController.sendOtp);

/**
 * @route POST /api/auth/forgot-password
 * @desc Request OTP for password reset
 * @access Public
 */
router.post('/forgot-password', authController.forgotPassword);

/**
 * @route POST /api/auth/reset-password
 * @desc Reset password using OTP
 * @access Public
 */
router.post('/reset-password', authController.resetPassword);


/**
 * @route POST /api/auth/verify-otp
 * @desc Verify OTP code
 * @access Public
 * @body { email: string, otp: string }
 */
router.post('/verify-otp', authController.verifyOtp);

/**
 * @route POST /api/auth/register
 * @desc Register a new user (requires verified OTP)
 * @access Public
 * @body { name: string, email: string, password: string, role?: string }
 */
router.post('/register', authController.register);

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 * @body { email: string, password: string }
 */
router.post('/login', authController.login);

/**
 * @route POST /api/auth/social-login
 * @desc Social Login (Google/Facebook)
 * @access Public
 * @body { email: string, name: string, provider: string, providerId: string }
 */
router.post('/social-login', authController.socialLogin);

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

export default router;
