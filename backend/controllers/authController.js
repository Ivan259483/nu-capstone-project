import User from '../models/User.js';
import OTP from '../models/OTP.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { sendOtpEmail } from '../utils/emailService.js';
import mockOtpStore from '../utils/mockOtpStore.js';

/**
 * Generate OTP
 */
const generateOTP = (length = 6) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
};

/**
 * Send OTP for signup/login
 * POST /api/auth/send-otp
 */
export const sendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Use provided OTP (from frontend) or generate a new one
    const otp = req.body.otp || generateOTP(config.otpLength);

    // Delete previous OTP for this email if exists
    await OTP.deleteMany({ email });

    // Create OTP record in MongoDB
    const otpRecord = new OTP({
      email,
      otp,
      expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
      attempts: 0,
      maxAttempts: 5,
      verified: false,
    });

    await otpRecord.save();
    console.log(`✅ OTP saved to MongoDB for ${email}`);

    // Send OTP email (non-blocking for instant response)
    console.log('🔑 OTP:', otp);
    sendOtpEmail(email, otp).catch(err => console.error('Email error:', err));

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        email,
        expiresIn: config.otpExpiry,
      },
    });
  } catch (error) {
    console.error('❌ Send OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message,
    });
  }
};

/**
 * Verify OTP
 * POST /api/auth/verify-otp
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required',
      });
    }

    // Find OTP record from MongoDB
    const otpRecord = await OTP.findOne({ email });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found. Please request a new OTP.',
      });
    }

    // Check if OTP is expired
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ email });
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.',
      });
    }

    // Check attempts
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      await OTP.deleteOne({ email });
      return res.status(400).json({
        success: false,
        message: 'Maximum OTP attempts exceeded. Please request a new OTP.',
      });
    }

    // Verify OTP
    if (otpRecord.otp !== otp) {
      otpRecord.attempts += 1;
      await otpRecord.save();

      return res.status(400).json({
        success: false,
        message: `Invalid OTP. Attempts remaining: ${otpRecord.maxAttempts - otpRecord.attempts}`,
      });
    }

    // Mark as verified
    otpRecord.verified = true;
    await otpRecord.save();

    console.log(`✅ OTP verified successfully for ${email}`);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        email,
        verified: true,
      },
    });
  } catch (error) {
    console.error('❌ Verify OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message,
    });
  }
};

/**
 * User Registration (after OTP verification)
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role, otp } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    // Check if OTP is verified (if OTP flow is enabled)
    if (config.emailProvider !== 'console') {
      const otpRecord = await OTP.findOne({ email, verified: true });
      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message: 'Please verify your email with OTP first',
        });
      }
    }

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please login instead.',
      });
    }

    // Create new user with verified status
    const user = new User({
      name,
      email,
      password, // Will be hashed by User model pre-save hook
      role: 'customer', // Strictly enforce customer role for signups
      isVerified: true, // User has verified OTP
    });

    await user.save();

    // Delete used OTP
    if (config.emailProvider !== 'console') {
      await OTP.deleteOne({ email });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error('❌ Registration Error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message,
    });
  }
};

/**
 * User Login
 * POST /api/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated',
      });
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      return res.status(403).json({
        success: false,
        message: 'Account locked due to too many failed attempts. Please try again in 20 minutes.',
      });
    }

    // Verify password using bcrypt
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      // Increment login attempts
      user.loginAttempts += 1;
      
      // Lock if attempts reach 5
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes
        console.warn(`🔒 [SECURITY]: Account ${email} locked for 20 minutes after 5 attempts.`);
      }
      
      await user.save();

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    
    // Update last active timestamp
    user.lastActive = new Date();
    await user.save();

    // Generate token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    console.error('❌ Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message,
    });
  }
};

/**
 * Get current user
 * GET /api/auth/me
 */
export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('❌ Get Current User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message,
    });
  }
};

/**
 * Logout
 * POST /api/auth/logout
 */
export const logout = async (req, res, next) => {
  try {
    // JWT is stateless, so logout is handled on client
    res.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Request Password Reset OTP
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      // For security, don't reveal if user exists or not
      // But based on the prompt "When clicked, it should open a modal asking for the user's email."
      // and "Send a 6-digit OTP", we should probably inform user if account not found
      // or just say "If an account exists, an OTP has been sent".
      // Usually, it's better to NOT inform, but user prompt says "Verification: Send a 6-digit OTP to that email".
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address.',
      });
    }

    // Generate OTP
    const otp = generateOTP(config.otpLength || 6);

    // Delete previous OTP for this email if exists
    await OTP.deleteMany({ email });

    // Create OTP record in MongoDB
    const otpRecord = new OTP({
      email,
      otp,
      expiresAt: new Date(Date.now() + (config.otpExpiry || 600) * 1000),
      attempts: 0,
      maxAttempts: 5,
      verified: false,
    });

    await otpRecord.save();

    // Send OTP email (non-blocking for instant response)
    console.log('🔑 PASSWORD RESET OTP:', otp);
    sendOtpEmail(email, otp).catch(err => console.error('Email error:', err));

    res.json({
      success: true,
      message: 'OTP sent successfully to your email.',
    });
  } catch (error) {
    console.error('❌ Forgot Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};

/**
 * Reset Password using OTP
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required',
      });
    }

    // Find and verify OTP
    const otpRecord = await OTP.findOne({ email });

    if (!otpRecord || otpRecord.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP code',
      });
    }

    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ email });
      return res.status(400).json({
        success: false,
        message: 'OTP has expired',
      });
    }

    // Find user and update password
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.password = newPassword; // Will be hashed by pre-save hook
    user.isVerified = true; // Ensure user is verified if they reset password
    await user.save();

    // Delete OTP after successful reset
    await OTP.deleteMany({ email });

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.',
    });
  } catch (error) {
    console.error('❌ Reset Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
};
