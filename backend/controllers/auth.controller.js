import User from '../models/user.model.js';
import OTP from '../models/oTP.model.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/environment.js';
import { sendOtpEmail } from '../utils/mail.utils.js'; // Use new strict Brevo mailer
import mockOtpStore from '../utils/mockOtpStore.utils.js';
import { getInvalidUserRoleMessage, isValidUserRole } from '../constants/roles.js';
import { logActivity } from '../utils/logActivity.utils.js';

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

    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted by an administrator.',
      });
    }

    // Generate 6-digit OTP code
    const otp = generateOTP(config.otpLength);
    console.log(`\n📨 [OTP REQUEST] Email: ${email}`);
    console.log(`   Generated OTP: ${otp}`);

    // Delete previous OTP for this email if exists (cleanup)
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

    // Save OTP to database
    await otpRecord.save();
    console.log(`✅ OTP saved to MongoDB`);
    console.log(`   Email: ${email}`);
    console.log(`   Expires in: ${config.otpExpiry} seconds`);

    // Send OTP email via Brevo SMTP
    console.log(`\n� Sending OTP email via Brevo SMTP...`);
    const emailResult = await sendOtpEmail(email, otp);

    if (!emailResult.success) {
      // Delete OTP from MongoDB if email failed
      await OTP.deleteOne({ email });

      console.error(`\n❌ OTP Email Failed:`);
      console.error(`   Email: ${email}`);
      console.error(`   Error: ${emailResult.error}`);
      console.error(`   Code: ${emailResult.code}`);
      console.error(`   Response Code: ${emailResult.responseCode}`);
      console.error(`   Server Response: ${emailResult.response}`);

      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.',
        error: emailResult.error,
        details: {
          code: emailResult.code,
          responseCode: emailResult.responseCode,
          response: emailResult.response,
        }
      });
    }

    console.log(`✅ OTP sent successfully`);
    console.log(`   MessageID: ${emailResult.messageId}`);
    console.log(`   Response: ${emailResult.response}\n`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        email,
        expiresIn: config.otpExpiry,
      },
    });
  } catch (error) {
    console.error('\n❌ Send OTP Error:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message,
    });
  }
};

/**
 * Forgot Password - Send OTP
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

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted.'
      });
    }

    // reuse sendOtp logic or call it directly? 
    // For now, let's implement the core logic to generate and send OTP here 
    // to be specific for password reset if needed, or we can just reuse the generic OTP flow.
    // Given the routes, send-otp is public for signup/login. 
    // forgot-password is specific.
    
    // Generate new OTP
    const otp = generateOTP(config.otpLength);

    // Delete previous OTP
    await OTP.deleteMany({ email });

    // Create OTP record
    const otpRecord = new OTP({
      email,
      otp,
      expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
      attempts: 0,
      maxAttempts: 5,
      verified: false,
    });

    await otpRecord.save();
    console.log(`✅ Password Reset OTP saved for ${email}`);

    // Send email
    const emailResult = await sendOtpEmail(email, otp);

    if (!emailResult.success) {
      await OTP.deleteOne({ email });
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP',
        error: emailResult.error
      });
    }

    res.json({
      success: true,
      message: 'Password reset OTP sent successfully',
      data: { email, expiresIn: config.otpExpiry }
    });

  } catch (error) {
    console.error('❌ Forgot Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process request',
      error: error.message
    });
  }
};

/**
 * Reset Password
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required'
      });
    }

    // Verify OTP first
    const otpRecord = await OTP.findOne({ email, verified: true });
    
    // Note: The frontend flow might verify OTP first via /verify-otp endpoint
    // which marks it as verified. So we check for a verified OTP record here.
    // If the flow expects atomic verification + reset, we'd verify here.
    // Assuming the standard flow: 1. ForgotPassword(send otp) -> 2. VerifyOTP -> 3. ResetPassword
    
    // However, if the user calls verify-otp, it marks verified=true.
    // Then reset-password checks if verified=true.

    if (!otpRecord) {
       // Fallback: Check if unverified OTP matches (atomic flow)
       const pendingOtp = await OTP.findOne({ email, otp });
       if (!pendingOtp) {
          return res.status(400).json({
            success: false,
            message: 'Invalid or expired OTP. Please verify first.',
          });
       }
       // If found pending, verify it now? 
       // Better to enforce the 2-step flow or just check strictly.
       // Let's assume strict flow: Verify endpoint must be called first OR we verify here.
       // Let's verify here to be safe if it wasn't done.
       if (pendingOtp.expiresAt < new Date()) {
          return res.status(400).json({ success: false, message: 'OTP expired' });
       }
       // If atomic, proceed.
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Clean up OTP
    await OTP.deleteMany({ email });

    logActivity({
      userId: user._id, userName: user.name || email, userRole: user.role,
      type: 'password_reset', module: 'Auth', action: 'Password Reset',
      description: `${user.name || email} reset their password.`, status: 'success',
    });

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login.'
    });

  } catch (error) {
    console.error('❌ Reset Password Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: error.message
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
    const { name, email, password, role, otp, referralCode } = req.body;

    if (typeof role !== 'undefined' && !isValidUserRole(role)) {
      return res.status(400).json({
        success: false,
        message: getInvalidUserRoleMessage(),
      });
    }

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    // Server-side email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    // Server-side name validation
    if (name.trim().length < 2 || name.trim().length > 80) {
      return res.status(400).json({
        success: false,
        message: 'Name must be between 2 and 80 characters',
      });
    }

    // Server-side password policy enforcement (mirrors frontend requirements)
    const passwordErrors = [];
    if (password.length < 8) passwordErrors.push('at least 8 characters');
    if (!/[A-Z]/.test(password)) passwordErrors.push('one uppercase letter');
    if (!/[a-z]/.test(password)) passwordErrors.push('one lowercase letter');
    if (!/[0-9]/.test(password)) passwordErrors.push('one number');
    if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) passwordErrors.push('one special character');
    if (passwordErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Password must contain: ${passwordErrors.join(', ')}`,
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
      if (existingUser.isDeleted) {
        return res.status(403).json({
          success: false,
          message: 'An account with this email was deleted. Please contact support.',
        });
      }
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. If you recently deleted this account, please contact support.',
      });
    }

    // Create new user with verified status
    const user = new User({
      name,
      email,
      password, // Will be hashed by User model pre-save hook
      role: role || 'customer',
      isVerified: true, // User has verified OTP
    });

    // Handle Referral Logic
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        user.referredBy = referrer._id;
        user.loyaltyPoints = 100; // Welcome points
        referrer.loyaltyPoints = (referrer.loyaltyPoints || 0) + 500; // Reward for referring
        await referrer.save();
      }
    }

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

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject._id;
    delete userObject.__v;
    
    logActivity({
      userId: user._id, userName: user.name || email, userRole: user.role,
      type: 'customer_registered', module: 'Auth', action: 'User Registered',
      description: `New ${user.role} account created: ${user.name || email}.`, status: 'success',
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: userObject,
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
    const MAX_LOGIN_ATTEMPTS = 6;
    const LOCK_TIME_MS = 20 * 60 * 1000;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    // Server-side email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
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

    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted by an administrator.',
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in',
      });
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMs = user.lockUntil.getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      return res.status(423).json({
        success: false,
        message: `Account locked. Please try again in ${remainingMinutes} minute(s).`,
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated',
      });
    }

    // Verify password using bcrypt
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;

      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
        user.loginAttempts = 0;
        await user.save();

        logActivity({
          userId: user._id, userName: user.name || email, userRole: user.role,
          type: 'account_lock', module: 'Auth', action: 'Account Locked',
          description: `${user.name || email} locked after ${MAX_LOGIN_ATTEMPTS} failed attempts.`,
          status: 'warning',
        });

        return res.status(423).json({
          success: false,
          message: 'Account locked for 20 minutes due to too many failed attempts.',
        });
      }

      logActivity({
        userId: user._id, userName: user.name || email, userRole: user.role,
        type: 'failed_login', module: 'Auth', action: 'Failed Login',
        description: `Failed login attempt for ${email}. Attempts: ${user.loginAttempts}/${MAX_LOGIN_ATTEMPTS}.`,
        status: 'error',
      });

      await user.save();
      return res.status(401).json({
        success: false,
        message: `Invalid credentials. Attempts remaining: ${MAX_LOGIN_ATTEMPTS - user.loginAttempts}`,
      });
    }

    // Reset login attempts on success
    if (user.loginAttempts !== 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject._id;
    delete userObject.__v;

    logActivity({
      userId: user._id, userName: user.name || email, userRole: user.role,
      type: 'login', module: 'Auth', action: 'User Login',
      description: `${user.name || email} logged in successfully.`, status: 'success',
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userObject,
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

    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted by an administrator.',
        code: 'USER_DELETED'
      });
    }

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject._id;
    delete userObject.__v;

    res.json({
      success: true,
      data: userObject,
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
    logActivity({
      req, type: 'logout', module: 'Auth', action: 'User Logout',
      description: `${req.user?.name || req.user?.email || 'User'} logged out.`, status: 'info',
    });

    res.json({
      success: true,
      message: 'Logout successful',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Social Login
 * POST /api/auth/social-login
 */
/**
 * Social Login
 * POST /api/auth/social-login
 */
export const socialLogin = async (req, res, next) => {
  try {
    const { email, name, provider, providerId } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    // Check if user exists
    let user = await User.findOne({ email });

    if (user && user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted by an administrator.',
      });
    }

    if (!user) {
      if (provider === 'password' || provider === 'firebase') {
        return res.status(404).json({
          success: false,
          message: 'Account not found. Please create an account.',
        });
      }

      // Create new user (Social Logins only - e.g. provider === 'google')
      // Generate random password
      const randomPassword = crypto.randomBytes(16).toString('hex');
      
      // Use User.create as requested
      user = await User.create({
        name: name || email.split('@')[0],
        email,
        password: randomPassword,
        role: 'customer',
        isVerified: true,
        firebaseUid: providerId, // Sync Firebase UID on creation
        avatar: req.body.photoURL || undefined, // Sync avatar if provided
      });

    } else {
        // If user exists but wasn't verified, verify them now since they logged in via social
         if (!user.isVerified) {
            user.isVerified = true;
         }
         // Sync Sync Firebase UID if missing
         if (providerId && !user.firebaseUid) {
            user.firebaseUid = providerId;
         }
         // Sync avatar if missing
         if (req.body.photoURL && !user.avatar) {
             user.avatar = req.body.photoURL;
         }
         await user.save();
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

     const userObject = user.toObject({ virtuals: true });
     delete userObject.password;
     delete userObject._id;
     delete userObject.__v;

    logActivity({
      userId: user._id, userName: user.name || email, userRole: user.role,
      type: 'login', module: 'Auth', action: 'Social Login',
      description: `${user.name || email} logged in via ${provider || 'social'}.`, status: 'success',
    });

    res.json({
      success: true,
      message: 'Social login successful',
      data: {
        user: userObject,
        token,
      },
    });

  } catch (error) {
    console.error('❌ Social Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Social login failed',
      error: error.message,
    });
  }
};
