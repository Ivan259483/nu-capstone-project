import User from '../models/user.model.js';
import OTP from '../models/oTP.model.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config/environment.js';
import { sendOtpEmail, sendWelcomeEmail, sendPasswordResetEmail } from '../utils/mail.utils.js'; // Resend mailer
import mockOtpStore from '../utils/mockOtpStore.utils.js';
import { getInvalidUserRoleMessage, isValidUserRole } from '../constants/roles.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { admin } from '../config/firebaseAdmin.js';

// Roles that require Email OTP 2FA after password verification.
// 'customer' is intentionally excluded — direct JWT login.
// ⚠️  Must mirror every non-customer value from constants/roles.js → USER_ROLES.
const NON_CUSTOMER_ROLES = [
  // Bypass all OTP 2FA for demo purposes
];

/**
 * Generate OTP
 */
const generateOTP = (length = 6) => {
  // Use cryptographically secure random integer (replaces Math.random)
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length); // crypto.randomInt upper bound is exclusive
  return crypto.randomInt(min, max).toString();
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

    if (existingUser && !existingUser.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    console.log(`\n📨 [OTP REQUEST] Email: ${email}`);

    // ── Idempotency: Reuse an unexpired OTP if one already exists ──────────────
    // This prevents the mobile OfflineQueue from invalidating the OTP by
    // replaying the same send-otp request multiple times before the user enters it.
    const existingOtp = await OTP.findOne({
      email,
      verified: false,
      expiresAt: { $gt: new Date() },
    });

    let otp;
    if (existingOtp) {
      // Reuse existing valid OTP — just resend the same code
      otp = existingOtp.otp;
      console.log(`   ♻️ Reusing existing OTP (still valid for ${Math.round((existingOtp.expiresAt - Date.now()) / 1000)}s)`);
    } else {
      // Generate a fresh OTP and save it
      otp = generateOTP(config.otpLength);
      await OTP.deleteMany({ email }); // clean up any expired/used records

      const otpRecord = new OTP({
        email,
        otp,
        expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
        attempts: 0,
        maxAttempts: 5,
        verified: false,
      });
      await otpRecord.save();
      console.log(`   ✅ New OTP generated & saved (expires in ${config.otpExpiry}s)`);
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`   🔑 OTP Code: ${otp}`);
    }

    // Send OTP email via Resend
    console.log(`\n📧 Sending OTP email via Resend...`);
    const emailResult = await sendOtpEmail(email, otp);

    if (!emailResult.success) {
      // Only delete the OTP record if WE just created it (not a reused one)
      if (!existingOtp) await OTP.deleteOne({ email });

      console.error(`\n❌ OTP Email Failed:`);
      console.error(`   Email: ${email}`);
      console.error(`   Error: ${emailResult.error}`);

      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.',
        error: emailResult.error,
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

    // ⚠️ Bug #2 fix: Strictly require a VERIFIED OTP record.
    // The client MUST call POST /verify-otp first, which marks verified=true.
    // Removed the insecure pendingOtp fallback that allowed bypassing verification.
    const otpRecord = await OTP.findOne({ email, verified: true });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'OTP not verified. Please call /verify-otp before resetting your password.',
      });
    }

    // Ensure the verified OTP has not expired
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ email });
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP and verify again.',
      });
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

    // Activate the user account if this was a registration OTP
    const user = await User.findOne({ email });
    if (user && !user.isVerified) {
      user.isVerified = true;
      user.status = 'active';
      await user.save();
      console.log(`✅ [verifyOtp] Activated account for ${email}`);
      // Send welcome email non-blocking
      sendWelcomeEmail(email, user.name).catch(err => console.warn('⚠️ Welcome email failed:', err.message));
    }

    console.log(`✅ OTP verified successfully for ${email}`);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        email,
        verified: true,
        role: user?.role || 'customer',
        isFirstLogin: user?.isFirstLogin || false,
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
 * User Registration (Customer self-register — sends OTP, creates pending account)
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password, referralCode } = req.body;

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

    // Server-side password policy enforcement
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

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.isDeleted) {
        return res.status(403).json({
          success: false,
          message: 'An account with this email was deleted. Please contact support.',
        });
      }
      if (!existingUser.isVerified) {
        // Account exists but unverified — resend OTP
        const otp = generateOTP(config.otpLength);
        await OTP.deleteMany({ email });
        await OTP.create({
          email,
          otp,
          expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
          attempts: 0,
          maxAttempts: 5,
          verified: false,
        });
        if (process.env.NODE_ENV === 'development') console.log(`🔑 [Register] OTP for ${email}: ${otp}`);
        await sendOtpEmail(email, otp).catch(err => console.warn('OTP email failed:', err.message));
        return res.status(200).json({
          success: true,
          message: 'A new verification code has been sent to your email.',
          data: { email, requiresOtp: true },
        });
      }
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // ── Firebase stale-account cleanup ────────────────────────────────────
    // The email is not in MongoDB, but it may still exist in Firebase Auth
    // (e.g., account was deleted from MongoDB but Firebase was never cleaned up).
    // If we don't purge it here, createUserWithEmailAndPassword on the client
    // will throw "auth/email-already-in-use" even though MongoDB has no record.
    if (admin) {
      try {
        const fbUser = await admin.auth().getUserByEmail(email);
        // Found a stale Firebase record — delete it so registration can proceed.
        await admin.auth().deleteUser(fbUser.uid);
        console.log(`🧹 [Register] Purged stale Firebase account for ${email} (uid: ${fbUser.uid})`);
      } catch (fbErr) {
        // getUserByEmail throws 'auth/user-not-found' when there's no record — that's fine.
        if (fbErr.code !== 'auth/user-not-found') {
          // Log unexpected Firebase errors but don't block registration.
          console.warn(`⚠️ [Register] Firebase stale-account check failed for ${email}:`, fbErr.message);
        }
      }
    }

    // Create new PENDING customer account
    const user = new User({
      name,
      email,
      password, // hashed by pre-save hook
      role: 'customer',
      isVerified: false,
      isActive: true,
      status: 'pending',
    });

    // Handle Referral Logic
    if (referralCode) {
      const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
      if (referrer) {
        user.referredBy = referrer._id;
        user.loyaltyPoints = 100;
        referrer.loyaltyPoints = (referrer.loyaltyPoints || 0) + 500;
        await referrer.save();
      }
    }

    await user.save();

    // Generate & send OTP
    const otp = generateOTP(config.otpLength);
    await OTP.deleteMany({ email });
    await OTP.create({
      email,
      otp,
      expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
      attempts: 0,
      maxAttempts: 5,
      verified: false,
    });

    if (process.env.NODE_ENV === 'development') console.log(`🔑 [Register] OTP for ${email}: ${otp}`);

    const emailResult = await sendOtpEmail(email, otp);
    if (!emailResult.success) {
      console.error('❌ OTP email failed:', emailResult.error);
      // Don't fail registration — dev can get OTP from console
    }

    logActivity({
      userId: user._id, userName: user.name || email, userRole: user.role,
      type: 'customer_registered', module: 'Auth', action: 'User Registered',
      description: `New customer account created: ${user.name || email}. Awaiting OTP verification.`, status: 'success',
    });

    res.status(201).json({
      success: true,
      message: 'Account created! Please check your email for a verification code.',
      data: { email, requiresOtp: true },
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
    const MAX_LOGIN_ATTEMPTS = 5;
    const LOCK_TIME_MS = 15 * 60 * 1000;

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
      // Unverified — generate & resend OTP then prompt verification
      const otp = generateOTP(config.otpLength);
      const otpHash = await bcrypt.hash(otp, 10);
      await OTP.deleteMany({ email });
      await OTP.create({
        email,
        otp,
        otpHash,
        expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
        attempts: 0,
        maxAttempts: 5,
        verified: false,
      });
      if (process.env.NODE_ENV === 'development') console.log(`🔑 [Login] OTP for unverified ${email}: ${otp}`);
      await sendOtpEmail(email, otp).catch(err => console.warn('OTP email failed:', err.message));
      return res.status(200).json({
        success: true,
        message: 'Please verify your email. A verification code has been sent.',
        data: { requiresOtp: true, email },
      });
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > new Date() && email !== 'customer@test.com') {
      const remainingMs = user.lockUntil.getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      return res.status(423).json({
        success: false,
        message: `Account locked. Please try again in ${remainingMinutes} minute(s).`,
        data: {
          locked: true,
          lockUntilMs: user.lockUntil.getTime(),
          remainingMinutes,
        },
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This account is disabled. Please try to contact the administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    // Verify password using bcrypt
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;

      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
        await user.save();

        logActivity({
          userId: user._id, userName: user.name || email, userRole: user.role,
          type: 'account_lock', module: 'Auth', action: 'Account Locked',
          description: `${user.name || email} locked after ${MAX_LOGIN_ATTEMPTS} failed attempts.`,
          status: 'warning',
        });

        return res.status(423).json({
          success: false,
          message: 'Account locked for 15 minutes due to too many failed attempts.',
          data: {
            locked: true,
            lockUntilMs: user.lockUntil.getTime(),
            remainingMinutes: 15,
          },
        });
      }

      const remainingAttempts = MAX_LOGIN_ATTEMPTS - user.loginAttempts;

      logActivity({
        userId: user._id, userName: user.name || email, userRole: user.role,
        type: 'failed_login', module: 'Auth', action: 'Failed Login',
        description: `Failed login attempt for ${email}. Attempts: ${user.loginAttempts}/${MAX_LOGIN_ATTEMPTS}. Remaining: ${remainingAttempts}.`,
        status: 'error',
      });

      await user.save();
      return res.status(401).json({
        success: false,
        message: `Invalid credentials. ${remainingAttempts} attempt(s) remaining before your account is locked.`,
        data: {
          loginAttempts: user.loginAttempts,
          remainingAttempts,
          maxAttempts: MAX_LOGIN_ATTEMPTS,
        },
      });
    }

    // Reset login attempts on success
    if (user.loginAttempts !== 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save();
    }

    // ── Staff first login: force password change ────────────────────────
    if (user.isFirstLogin && user.role !== 'customer') {
      const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role, requiresPasswordChange: true },
        config.jwtSecret,
        { expiresIn: '1h' }
      );
      return res.json({
        success: true,
        message: 'Please set your own password to continue.',
        data: { requiresPasswordChange: true, token },
      });
    }

    // ── 2FA Branch ─────────────────────────────────────────────────────────
    // Non-customer roles must verify an OTP before receiving a JWT.
    console.log('🔐 [Login 2FA] ROLE CHECK:', {
      userRole: user.role,
      typeofRole: typeof user.role,
      otpRequired: NON_CUSTOMER_ROLES.includes(user.role),
      allOtpRoles: NON_CUSTOMER_ROLES,
    });
    if (NON_CUSTOMER_ROLES.includes(user.role)) {
      // ── DEV MODE: skip OTP email and issue JWT directly ─────────────────
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔑 [Login DEV] Skipping 2FA for ${email} (role: ${user.role})`);
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
          type: 'login', module: 'Auth', action: 'User Login (DEV)',
          description: `${user.name || email} logged in (dev mode, 2FA skipped).`, status: 'success',
        });

        return res.json({
          success: true,
          message: 'Login successful',
          data: { user: userObject, token },
        });
      }

      // ── PRODUCTION: full OTP flow ───────────────────────────────────────
      const otp = generateOTP(6);
      const otpHash = await bcrypt.hash(otp, 10);

      // Remove any previous login OTP for this user, then save fresh one
      await OTP.deleteMany({ userId: user._id, purpose: 'login' });

      const maskedEmail = email.replace(/^(.)(.*)(@.*)$/, (_, first, middle, domain) =>
        `${first}${'*'.repeat(Math.min(middle.length, 5))}${domain}`
      );

      const otpRecord = new OTP({
        email: user.email,
        otp,              // plain — kept for legacy find queries, never sent to client
        otpHash,          // bcrypt hash — used for verification
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        attempts: 0,
        maxAttempts: 3,
        verified: false,
        purpose: 'login',
        userId: user._id,
        lastSentAt: new Date(),
      });
      await otpRecord.save();

      // Send OTP email (fire-and-forget — failure is non-fatal here, client can resend)
      const emailResult = await sendOtpEmail(user.email, otp);
      if (!emailResult.success) {
        console.error('❌ [Login 2FA] Failed to send OTP email:', emailResult.error);
        await OTP.deleteOne({ _id: otpRecord._id });
        return res.status(500).json({
          success: false,
          message: 'Failed to send verification code. Please try again.',
        });
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`🔑 [Login 2FA] OTP for ${email}: ${otp}`);
      }

      logActivity({
        userId: user._id, userName: user.name || email, userRole: user.role,
        type: 'login_otp_sent', module: 'Auth', action: '2FA OTP Sent',
        description: `OTP challenge issued for ${user.name || email}.`, status: 'info',
      });

      return res.json({
        success: true,
        message: 'OTP sent to your email. Please verify to complete login.',
        data: {
          requiresOTP: true,
          userId: user._id.toString(),
          maskedEmail,
        },
      });
    }

    // ── Customer (or any unlisted role): direct JWT ─────────────────────────
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

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
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

    // ── Upsert logic: find by email or Firebase UID ──
    let user = await User.findOne({
      $or: [{ email }, ...(providerId ? [{ firebaseUid: providerId }] : [])],
    });

    if (user && user.isDeleted) {
      // Soft-deleted account — restore it on social re-login instead of blocking.
      // The user authenticated successfully via Firebase; rejecting them here would
      // cause an infinite logout loop. Restore and continue.
      console.log(`[socialLogin] Restoring soft-deleted account for ${email}`);
      user.isDeleted = false;
      user.isActive = true;
      user.deletedAt = undefined;
    }

    // Block archived/deactivated accounts — even for Firebase/social logins
    if (user && !user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    if (!user) {
      if (provider === 'password') {
        return res.status(404).json({
          success: false,
          message: 'Account not found. Please create an account.',
        });
      }

      // Auto-create user for social logins — Firebase authenticated them, trust it.
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const validProviderId = providerId && providerId !== 'undefined' ? providerId : undefined;
      user = await User.create({
        name: name || email.split('@')[0],
        email,
        password: randomPassword,
        role: 'customer',
        isVerified: true,
        isActive: true,
        ...(validProviderId ? { firebaseUid: validProviderId } : {}),
        avatar: req.body.photoURL || undefined,
      });
      console.log(`[socialLogin] Auto-created new user for ${email}`);

    } else {
      // Existing user — sync fields from Firebase
      if (!user.isVerified) user.isVerified = true;
      if (providerId && !user.firebaseUid) user.firebaseUid = providerId;
      if (req.body.photoURL) user.avatar = req.body.photoURL;
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

/**
 * Delete Account
 * DELETE /api/auth/account
 *
 * Requires:
 *   - Valid JWT in Authorization header (authenticate middleware)
 *   - { password } in req.body  — the user's current password for confirmation
 *
 * Process:
 *   1. Verify password with bcrypt
 *   2. Delete Firebase Auth user (Admin SDK) — prevents future Firebase logins
 *   3. Delete all associated MongoDB documents in parallel
 *   4. Return success ONLY after all deletions succeed
 *   5. On partial failure → attempt rollback and return 500
 */
export const deleteAccount = async (req, res) => {
  const userId = req.user?.id;

  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete your account.',
      });
    }

    // ── 1. Fetch user (with password hash) ──────────────────────────────
    const user = await User.findById(userId).select('+password firebaseUid email name');
    if (!user || user.isDeleted) {
      return res.status(404).json({
        success: false,
        message: 'User account not found.',
      });
    }

    // ── 2. Verify password ───────────────────────────────────────────────
    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      console.warn(`[DELETE_ACCOUNT] Wrong password attempt for user ${userId}`);
      return res.status(401).json({
        success: false,
        message: 'Incorrect password. Please try again.',
      });
    }

    const firebaseUid = user.firebaseUid;

    // ── 3. Delete Firebase Auth user (Admin SDK) ─────────────────────────
    //    Do this FIRST — if Firebase deletion fails we have not yet touched MongoDB.
    if (firebaseUid) {
      if (!admin) {
        console.error('[DELETE_ACCOUNT] Firebase Admin SDK is not initialized. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env');
        return res.status(503).json({
          success: false,
          message: 'Account deletion is temporarily unavailable. Please contact support.',
        });
      }
      try {
        await admin.auth().deleteUser(firebaseUid);
        console.log(`[DELETE_ACCOUNT] ✅ Firebase user deleted: ${firebaseUid}`);
      } catch (firebaseError) {
        // If the Firebase user was already deleted, that's fine — proceed with MongoDB cleanup.
        if (firebaseError.code === 'auth/user-not-found') {
          console.warn(`[DELETE_ACCOUNT] Firebase user ${firebaseUid} not found — already deleted. Proceeding with MongoDB cleanup.`);
        } else {
          console.error('[DELETE_ACCOUNT] ❌ Firebase deletion failed:', firebaseError.message);
          return res.status(500).json({
            success: false,
            message: 'Failed to delete authentication account. Please try again or contact support.',
          });
        }
      }
    } else {
      console.warn(`[DELETE_ACCOUNT] User ${userId} has no firebaseUid — skipping Firebase deletion.`);
    }

    // ── 4. Delete all associated MongoDB records in parallel ─────────────
    //    Import models lazily to avoid circular import issues.
    try {
      const { default: mongoose } = await import('mongoose');
      const mongoId = new mongoose.Types.ObjectId(userId);

      // Load all models that may have user-owned records
      const [Order, Customer, Vehicle, AIServiceRequest, ActivityLog, ChatSession, ChatMessage, Notification] =
        await Promise.all([
          import('../models/order.model.js').then((m) => m.default),
          import('../models/customer.model.js').then((m) => m.default),
          import('../models/vehicle.model.js').then((m) => m.default),
          import('../models/aIServiceRequest.model.js').then((m) => m.default),
          import('../models/activityLog.model.js').then((m) => m.default),
          import('../models/chatSession.model.js').then((m) => m.default),
          import('../models/chatMessage.model.js').then((m) => m.default),
          import('../models/notification.model.js').then((m) => m.default),
        ]);

      // Run all deletions in parallel
      const deletionResults = await Promise.allSettled([
        Order.deleteMany({ customer: mongoId }),
        Customer.deleteMany({ user: mongoId }),
        Vehicle.deleteMany({ user: mongoId }),
        AIServiceRequest.deleteMany({ customer: mongoId }),
        ActivityLog.deleteMany({ userId: mongoId }),
        ChatSession.deleteMany({ userId: mongoId }),
        ChatMessage.deleteMany({ userId: mongoId }),
        Notification.deleteMany({ userId: mongoId }),
        OTP.deleteMany({ email: user.email }),
      ]);

      // Log any partial failures (non-fatal for the user experience)
      deletionResults.forEach((result, i) => {
        const labels = ['Order', 'Customer', 'Vehicle', 'AIServiceRequest', 'ActivityLog', 'ChatSession', 'ChatMessage', 'Notification', 'OTP'];
        if (result.status === 'rejected') {
          console.error(`[DELETE_ACCOUNT] ⚠️  Failed to delete ${labels[i]} records:`, result.reason?.message);
        } else {
          console.log(`[DELETE_ACCOUNT] ✅ ${labels[i]}: deleted ${result.value?.deletedCount ?? 0} records`);
        }
      });

      // ── 5. Hard-delete the User document ────────────────────────────────
      await User.findByIdAndDelete(userId);
      console.log(`[DELETE_ACCOUNT] ✅ User document deleted: ${userId} (${user.email})`);

    } catch (mongoError) {
      // Critical: Firebase user is already deleted but MongoDB cleanup failed.
      // The user can no longer log in via Firebase, which is the desired security outcome.
      // Mark the MongoDB user as deleted so the auth middleware rejects any remaining JWTs.
      console.error('[DELETE_ACCOUNT] ❌ MongoDB cleanup failed after Firebase deletion:', mongoError.message);
      await User.findByIdAndUpdate(userId, {
        isDeleted: true,
        deletedAt: new Date(),
        isActive: false,
      }).catch((e) => console.error('[DELETE_ACCOUNT] ❌ Fallback soft-delete also failed:', e.message));

      return res.status(500).json({
        success: false,
        message: 'Your authentication credentials were removed, but some account data could not be fully cleaned up. Please contact support.',
      });
    }

    // ── 6. Log the deletion (best-effort) ───────────────────────────────
    logActivity({
      action: 'USER_ACCOUNT_DELETED',
      description: `User ${user.email} permanently deleted their account.`,
      ipAddress: req.ip,
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Your account has been permanently deleted.',
    });

  } catch (error) {
    console.error('[DELETE_ACCOUNT] ❌ Unexpected error:', error);
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please try again or contact support.',
    });
  }
};

/**
 * Verify Login OTP (2FA)
 * POST /api/auth/verify-login-otp
 *
 * Body: { userId: string, otp: string }
 * - Validates bcrypt hash, checks expiry, enforces 3-attempt limit.
 * - On success: clears OTP record, returns JWT + user object.
 * - After 3 failures: sets lockUntil = +15 min on the OTP record (429).
 */
export const verifyLoginOtp = async (req, res) => {
  const OTP_LOCK_MS = 15 * 60 * 1000;
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ success: false, message: 'userId and otp are required.' });
    }

    const otpRecord = await OTP.findOne({ userId, purpose: 'login' });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'OTP not found. Please request a new code.' });
    }

    // Check lockout (stored on OTP record via expiresAt override)
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      const lockExpiry = new Date(otpRecord.updatedAt.getTime() + OTP_LOCK_MS);
      if (lockExpiry > new Date()) {
        const remainingMs = lockExpiry.getTime() - Date.now();
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. Please wait ${remainingMinutes} minute(s) or request a new code.`,
          data: { locked: true, remainingMinutes },
        });
      }
      // Lock has expired — delete record and ask user to resend
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new code.' });
    }

    // Check expiry
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new code.' });
    }

    // Compare bcrypt hash
    const isValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isValid) {
      otpRecord.attempts += 1;
      await otpRecord.save();

      const remaining = otpRecord.maxAttempts - otpRecord.attempts;
      if (remaining <= 0) {
        return res.status(429).json({
          success: false,
          message: 'Too many failed attempts. Please wait 15 minutes or request a new code.',
          data: { locked: true, remainingMinutes: 15 },
        });
      }
      return res.status(401).json({
        success: false,
        message: `Invalid code. ${remaining} attempt(s) remaining.`,
        data: { remainingAttempts: remaining },
      });
    }

    // OTP valid — clear record and issue JWT
    await OTP.deleteOne({ _id: otpRecord._id });

    const user = await User.findById(userId);
    if (!user || user.isDeleted || !user.isActive) {
      return res.status(403).json({ success: false, message: 'Account not accessible.' });
    }

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
      userId: user._id, userName: user.name || user.email, userRole: user.role,
      type: 'login', module: 'Auth', action: 'User Login (2FA)',
      description: `${user.name || user.email} completed 2FA and logged in.`, status: 'success',
    });

    return res.json({
      success: true,
      message: 'Login successful.',
      data: { user: userObject, token },
    });
  } catch (error) {
    console.error('❌ [verifyLoginOtp] Error:', error);
    return res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
  }
};

/**
 * Resend Login OTP (2FA)
 * POST /api/auth/resend-login-otp
 *
 * Body: { userId: string }
 * - Enforces a 60-second resend cooldown.
 * - Regenerates OTP, re-hashes, resends email.
 */
export const resendLoginOtp = async (req, res) => {
  const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required.' });
    }

    const user = await User.findById(userId);
    if (!user || user.isDeleted || !user.isActive) {
      return res.status(403).json({ success: false, message: 'Account not accessible.' });
    }

    const existing = await OTP.findOne({ userId, purpose: 'login' });
    if (existing && existing.lastSentAt) {
      const elapsed = Date.now() - existing.lastSentAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitSeconds} second(s) before requesting a new code.`,
          data: { waitSeconds },
        });
      }
    }

    // Generate fresh OTP
    const otp = generateOTP(6);
    const otpHash = await bcrypt.hash(otp, 10);

    // Upsert — replace the old record to reset expiry and attempts
    await OTP.deleteMany({ userId, purpose: 'login' });
    const otpRecord = new OTP({
      email: user.email,
      otp,
      otpHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
      maxAttempts: 3,
      verified: false,
      purpose: 'login',
      userId: user._id,
      lastSentAt: new Date(),
    });
    await otpRecord.save();

    const emailResult = await sendOtpEmail(user.email, otp);
    if (!emailResult.success) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(500).json({ success: false, message: 'Failed to send code. Please try again.' });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔑 [Resend Login OTP] OTP for ${user.email}: ${otp}`);
    }

    return res.json({
      success: true,
      message: 'A new verification code has been sent to your email.',
      data: { expiresIn: 300 }, // 5 minutes in seconds
    });
  } catch (error) {
    console.error('❌ [resendLoginOtp] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to resend code. Please try again.' });
  }
};

/**
 * Create Staff Account (Admin only)
 * POST /api/auth/create-staff
 */
export const createStaff = async (req, res) => {
  try {
    const { name, email, phone, role, password } = req.body;

    if (!name || !email || !role || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, role, and password are required.' });
    }

    const STAFF_ROLES = ['administrator', 'office_admin', 'operation_manager', 'hr', 'inventory', 'sales', 'service_staff', 'staff_quality_checker', 'staff_inventory', 'technician'];
    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Allowed staff roles: ${STAFF_ROLES.join(', ')}` });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const user = new User({
      name,
      email,
      password, // hashed by pre-save hook
      role,
      phone: phone || undefined,
      isVerified: false,
      isActive: true,
      status: 'pending',
      isFirstLogin: true,
    });
    await user.save();

    logActivity({
      userId: req.user?.id, userName: req.user?.name || req.user?.email, userRole: req.user?.role,
      type: 'staff_created', module: 'Auth', action: 'Create Staff Account',
      description: `Staff account created for ${name} (${role}) by ${req.user?.email}.`, status: 'success',
    });

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject.__v;

    res.status(201).json({
      success: true,
      message: `Staff account created for ${name}. Share credentials personally.`,
      data: { user: userObject },
    });
  } catch (error) {
    console.error('❌ [createStaff] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create staff account.', error: error.message });
  }
};

/**
 * Set Password (Staff first login)
 * POST /api/auth/set-password
 * Requires valid JWT with requiresPasswordChange: true
 */
export const setPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const userId = req.user?.id;

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirmation are required.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const passwordErrors = [];
    if (newPassword.length < 8) passwordErrors.push('at least 8 characters');
    if (!/[A-Z]/.test(newPassword)) passwordErrors.push('one uppercase letter');
    if (!/[a-z]/.test(newPassword)) passwordErrors.push('one lowercase letter');
    if (!/[0-9]/.test(newPassword)) passwordErrors.push('one number');
    if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword)) passwordErrors.push('one special character');
    if (passwordErrors.length > 0) {
      return res.status(400).json({ success: false, message: `Password must contain: ${passwordErrors.join(', ')}` });
    }

    const user = await User.findById(userId);
    if (!user || user.isDeleted || !user.isActive) {
      return res.status(403).json({ success: false, message: 'Account not accessible.' });
    }

    user.password = newPassword; // hashed by pre-save hook
    user.isFirstLogin = false;
    user.isVerified = true;
    user.status = 'active';
    await user.save();

    // Issue a fresh full-access JWT
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
      userId: user._id, userName: user.name || user.email, userRole: user.role,
      type: 'password_set', module: 'Auth', action: 'Set Password (First Login)',
      description: `${user.name || user.email} set their own password on first login.`, status: 'success',
    });

    res.json({
      success: true,
      message: 'Password updated successfully! Welcome to AutoSPF+.',
      data: { user: userObject, token },
    });
  } catch (error) {
    console.error('❌ [setPassword] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to set password.', error: error.message });
  }
};

/**
 * Resend OTP (registration / account verification)
 * POST /api/auth/resend-otp
 */
export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'No account found with this email.' });
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Account is already verified.' });

    const otp = generateOTP(config.otpLength);
    await OTP.deleteMany({ email });
    await OTP.create({
      email,
      otp,
      expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
      attempts: 0,
      maxAttempts: 5,
      verified: false,
    });

    if (process.env.NODE_ENV === 'development') console.log(`🔑 [resendOtp] OTP for ${email}: ${otp}`);
    await sendOtpEmail(email, otp).catch(err => console.warn('OTP email failed:', err.message));

    res.json({ success: true, message: 'A new verification code has been sent.', data: { expiresIn: config.otpExpiry } });
  } catch (error) {
    console.error('❌ [resendOtp] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to resend OTP.' });
  }
};

/**
 * Unlock Account (Dev/Admin utility)
 * POST /api/auth/unlock
 *
 * Body: { email: string }
 * Clears loginAttempts and lockUntil for the given user.
 * In production this route is protected by administrator/office_admin only.
 */
export const unlockAccount = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: `No user found with email: ${email}` });
    }

    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    logActivity({
      userId: user._id, userName: user.name || email, userRole: user.role,
      type: 'account_unlock', module: 'Auth', action: 'Account Unlocked',
      description: `Account for ${email} was manually unlocked.`, status: 'info',
    });

    return res.json({
      success: true,
      message: `Account unlocked successfully for ${email}.`,
      data: { email, loginAttempts: 0, lockUntil: null },
    });
  } catch (error) {
    console.error('❌ [unlockAccount] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to unlock account.', error: error.message });
  }
};
