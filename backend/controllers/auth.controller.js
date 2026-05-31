import User from '../models/user.model.js';
import OTP from '../models/oTP.model.js';
import AccountSetupToken from '../models/accountSetupToken.model.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config/environment.js';
import { sendOtpEmail, sendWelcomeEmail, sendPasswordResetEmail, sendPasswordSetupEmail } from '../utils/mail.utils.js'; // Resend mailer
import mockOtpStore from '../utils/mockOtpStore.utils.js';
import { getInvalidUserRoleMessage, isValidUserRole, STAFF_ASSIGNABLE_ROLES } from '../constants/roles.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { admin } from '../config/firebaseAdmin.js';
import { parseRegisterPhone } from '../utils/phone.utils.js';
import { isLoginLockoutExemptEmail } from '../constants/loginLockout.exempt.js';
import { attachPhoneForClient } from '../utils/phone-client.utils.js';
import { startChatRegistrationForCustomer } from '../services/chatRegistration.service.js';
import {
  EMAIL_OTP_PURPOSE,
  LOGIN_OTP_PURPOSE,
  formatOtpForLog,
  maskEmail,
  normalizeEmailForOtp,
  normalizeOtpInput,
  otpRecordLogMeta,
  timingSafeOtpEqual,
} from '../utils/otp.utils.js';

// Roles that require Email OTP 2FA after password verification.
// 'customer' is intentionally excluded — direct JWT login.
// ⚠️  Must mirror every non-customer value from constants/roles.js → USER_ROLES.
const NON_CUSTOMER_ROLES = [
  // Bypass all OTP 2FA for demo purposes
];

const PASSWORD_SETUP_PURPOSE = 'password_setup';
const PASSWORD_SETUP_RESEND_COOLDOWN_MS = 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

/**
 * Generate OTP
 */
const generateOTP = (length = 6) => {
  // Use cryptographically secure random integer and preserve leading zeroes.
  const max = Math.pow(10, length); // crypto.randomInt upper bound is exclusive
  return crypto.randomInt(0, max).toString().padStart(length, '0');
};

const buildOtpHash = (otp) => bcrypt.hash(normalizeOtpInput(otp), 10);

const findLatestEmailOtp = (email, extraQuery = {}) =>
  OTP.findOne({
    email: normalizeEmailForOtp(email),
    purpose: EMAIL_OTP_PURPOSE,
    ...extraQuery,
  }).sort({ createdAt: -1, _id: -1 });

const logOtpDebug = (event, meta = {}) => {
  console.log(`[OTP:${event}]`, meta);
};

const compareOtpRecord = async (otpRecord, candidateOtp) => {
  const normalizedOtp = normalizeOtpInput(candidateOtp);
  if (!otpRecord || !normalizedOtp) return false;

  if (otpRecord.otpHash) {
    try {
      if (await bcrypt.compare(normalizedOtp, otpRecord.otpHash)) return true;
    } catch (err) {
      console.warn('[OTP:compare] hash comparison failed:', err?.message || err);
    }
  }

  return timingSafeOtpEqual(otpRecord.otp, normalizedOtp);
};

/** Updates lastSeenAt on successful auth (admin User Management “presence”). */
async function saveLastSeen(userDoc) {
  try {
    if (!userDoc || typeof userDoc.save !== 'function') return;
    userDoc.lastSeenAt = new Date();
    await userDoc.save();
  } catch (err) {
    console.warn('[saveLastSeen] non-fatal:', err?.message || err);
  }
}

const getPublicAppUrl = () => {
  const explicit = process.env.CLIENT_URL || process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL;
  if (explicit) return String(explicit).replace(/\/$/, '');
  const cors = process.env.CORS_ORIGIN;
  if (cors && typeof cors === 'string' && cors.trim() && cors.trim() !== '*') {
    const first = cors.split(',')[0].trim();
    if (first) return first.replace(/\/$/, '');
  }
  return 'https://autospf.shop';
};

const generateSetupToken = () => crypto.randomBytes(32).toString('base64url');

const hashSetupToken = (token) =>
  crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');

const getPasswordPolicyErrors = (password = '') => {
  const passwordErrors = [];
  if (password.length < 8) passwordErrors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) passwordErrors.push('one uppercase letter');
  if (!/[a-z]/.test(password)) passwordErrors.push('one lowercase letter');
  if (!/[0-9]/.test(password)) passwordErrors.push('one number');
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) passwordErrors.push('one special character');
  return passwordErrors;
};

const parseChatRegistrationBody = (body = {}) => {
  const firstName = String(body.firstName || '').trim().replace(/\s+/g, ' ');
  const lastName = String(body.lastName || '').trim().replace(/\s+/g, ' ');
  const email = normalizeEmailForOtp(body.email);
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const phoneParsed = parseRegisterPhone(body.phone);

  if (!firstName || firstName.length > 40 || !NAME_PART_REGEX.test(firstName)) {
    return { ok: false, status: 400, message: 'Please enter a valid first name.' };
  }
  if (!lastName || lastName.length > 40 || !NAME_PART_REGEX.test(lastName)) {
    return { ok: false, status: 400, message: 'Please enter a valid last name.' };
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, status: 400, message: 'Please enter a valid email address.' };
  }
  if (fullName.length < 2 || fullName.length > 80) {
    return { ok: false, status: 400, message: 'Name must be between 2 and 80 characters.' };
  }
  if (!phoneParsed.ok) {
    return { ok: false, status: 400, message: phoneParsed.message || 'Invalid phone number.' };
  }

  return { ok: true, firstName, lastName, fullName, email, phone: phoneParsed.phone };
};

const buildSetupUrl = (rawToken) =>
  `${getPublicAppUrl()}/set-password?token=${encodeURIComponent(rawToken)}`;

const issuePasswordSetupEmail = async (user) => {
  const now = new Date();
  await AccountSetupToken.updateMany(
    {
      userId: user._id,
      purpose: PASSWORD_SETUP_PURPOSE,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now } }
  );

  const rawToken = generateSetupToken();
  const expiresAt = new Date(Date.now() + config.passwordSetupTokenExpiry * 1000);
  const tokenRecord = await AccountSetupToken.create({
    userId: user._id,
    email: user.email,
    tokenHash: hashSetupToken(rawToken),
    purpose: PASSWORD_SETUP_PURPOSE,
    expiresAt,
    usedAt: null,
    lastSentAt: now,
  });

  const emailResult = await sendPasswordSetupEmail(
    user.email,
    user.name,
    buildSetupUrl(rawToken),
    {
      tokenRecordId: tokenRecord._id,
      expiresInSeconds: config.passwordSetupTokenExpiry,
    }
  );

  if (!emailResult.success) {
    await AccountSetupToken.deleteOne({ _id: tokenRecord._id });
    const error = new Error(emailResult.error || 'Failed to send setup email.');
    error.emailError = true;
    throw error;
  }

  return tokenRecord;
};

const loadPasswordSetupToken = async (rawToken) => {
  const token = String(rawToken || '').trim();
  if (!token) {
    return { ok: false, status: 400, message: 'Setup token is required.' };
  }

  const tokenHash = hashSetupToken(token);
  const tokenRecord = await AccountSetupToken.findOne({
    tokenHash,
    purpose: PASSWORD_SETUP_PURPOSE,
  });

  if (!tokenRecord || tokenRecord.usedAt) {
    return { ok: false, status: 400, message: 'This setup link is invalid or has already been used.' };
  }
  if (tokenRecord.expiresAt < new Date()) {
    return { ok: false, status: 400, message: 'This setup link has expired. Please request a new email.' };
  }

  const user = await User.findById(tokenRecord.userId).select('+password');
  if (!user || user.isDeleted) {
    return { ok: false, status: 404, message: 'Account not found.' };
  }
  if (!user.isActive) {
    return { ok: false, status: 403, message: 'This account has been deactivated. Please contact support.' };
  }
  if (user.role !== 'customer') {
    return { ok: false, status: 409, message: 'This setup link is not valid for this account type.' };
  }
  if (user.isVerified && user.password) {
    return { ok: false, status: 400, message: 'This account is already active. Please sign in.' };
  }

  return { ok: true, tokenRecord, user };
};

/**
 * Send OTP for signup/login
 * POST /api/auth/send-otp
 */
export const sendOtp = async (req, res, next) => {
  try {
    const email = normalizeEmailForOtp(req.body.email);

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

    logOtpDebug('send.request', { email: maskEmail(email), bodyFields: Object.keys(req.body || {}) });

    // ── Idempotency: Reuse an unexpired OTP if one already exists ──────────────
    // This prevents the mobile OfflineQueue from invalidating the OTP by
    // replaying the same send-otp request multiple times before the user enters it.
    const existingOtp = await findLatestEmailOtp(email, {
      verified: false,
      expiresAt: { $gt: new Date() },
    });

    let otp;
    let createdOtpRecord = null;
    if (
      existingOtp &&
      existingOtp.attempts < existingOtp.maxAttempts &&
      normalizeOtpInput(existingOtp.otp).length === config.otpLength
    ) {
      // Reuse existing valid OTP — just resend the same code
      otp = existingOtp.otp;
      existingOtp.lastSentAt = new Date();
      await existingOtp.save();
      logOtpDebug('send.reuse', {
        email: maskEmail(email),
        otp: formatOtpForLog(otp),
        record: otpRecordLogMeta(existingOtp),
      });
    } else {
      // Generate a fresh OTP and save it
      otp = generateOTP(config.otpLength);
      await OTP.deleteMany({ email, purpose: EMAIL_OTP_PURPOSE }); // clean up expired/used email OTP records

      const otpRecord = new OTP({
        email,
        otp,
        otpHash: await buildOtpHash(otp),
        expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
        attempts: 0,
        maxAttempts: 5,
        verified: false,
        purpose: EMAIL_OTP_PURPOSE,
        lastSentAt: new Date(),
      });
      await otpRecord.save();
      createdOtpRecord = otpRecord;
      logOtpDebug('send.generated_saved', {
        email: maskEmail(email),
        generatedOtp: formatOtpForLog(otp),
        saved: otpRecordLogMeta(otpRecord),
      });
    }

    // Send OTP email via Resend
    console.log(`\n📧 Sending OTP email via Resend...`);
    const emailResult = await sendOtpEmail(email, otp, {
      purpose: 'verification',
      otpRecordId: (createdOtpRecord || existingOtp)?._id,
    });

    if (!emailResult.success) {
      // Only delete the OTP record if WE just created it (not a reused one)
      if (createdOtpRecord?._id) await OTP.deleteOne({ _id: createdOtpRecord._id });

      console.error(`\n❌ OTP Email Failed:`);
      console.error(`   Email: ${maskEmail(email)}`);
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
    const email = normalizeEmailForOtp(req.body.email);

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
    await OTP.deleteMany({ email, purpose: EMAIL_OTP_PURPOSE });

    // Create OTP record
    const otpRecord = new OTP({
      email,
      otp,
      otpHash: await buildOtpHash(otp),
      expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
      attempts: 0,
      maxAttempts: 5,
      verified: false,
      purpose: EMAIL_OTP_PURPOSE,
      lastSentAt: new Date(),
    });

    await otpRecord.save();
    logOtpDebug('forgot.generated_saved', {
      email: maskEmail(email),
      generatedOtp: formatOtpForLog(otp),
      saved: otpRecordLogMeta(otpRecord),
    });

    // Send email
    const emailResult = await sendPasswordResetEmail(email, otp, { otpRecordId: otpRecord._id });

    if (!emailResult.success) {
      await OTP.deleteOne({ _id: otpRecord._id });
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
    const email = normalizeEmailForOtp(req.body.email);
    const otp = normalizeOtpInput(req.body.otp);
    const { newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required'
      });
    }

    // ⚠️ Bug #2 fix: Strictly require a VERIFIED OTP record.
    // The client MUST call POST /verify-otp first, which marks verified=true.
    // Removed the insecure pendingOtp fallback that allowed bypassing verification.
    const otpRecord = await findLatestEmailOtp(email, { verified: true });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'OTP not verified. Please call /verify-otp before resetting your password.',
      });
    }

    // Ensure the verified OTP has not expired
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP and verify again.',
      });
    }

    const resetOtpMatches = await compareOtpRecord(otpRecord, otp);
    logOtpDebug('reset.compare', {
      email: maskEmail(email),
      receivedOtp: formatOtpForLog(otp),
      record: otpRecordLogMeta(otpRecord),
      match: resetOtpMatches,
    });
    if (!resetOtpMatches) {
      return res.status(400).json({
        success: false,
        message: 'OTP does not match the verified code. Please verify again.',
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
    await OTP.deleteMany({ email, purpose: EMAIL_OTP_PURPOSE });

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
    const email = normalizeEmailForOtp(req.body.email);
    const otp = normalizeOtpInput(req.body.otp);

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required',
      });
    }

    logOtpDebug('verify.received', {
      email: maskEmail(email),
      receivedOtp: formatOtpForLog(otp),
      bodyFields: Object.keys(req.body || {}),
    });

    // Find OTP record from MongoDB
    const otpRecord = await findLatestEmailOtp(email);

    if (!otpRecord) {
      logOtpDebug('verify.not_found', { email: maskEmail(email), purpose: EMAIL_OTP_PURPOSE });
      return res.status(400).json({
        success: false,
        message: 'OTP not found. Please request a new OTP.',
      });
    }

    logOtpDebug('verify.loaded', { record: otpRecordLogMeta(otpRecord) });

    // Check if OTP is expired
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otpRecord._id });
      logOtpDebug('verify.expired', { record: otpRecordLogMeta(otpRecord) });
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new OTP.',
      });
    }

    // Check attempts
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      await OTP.deleteOne({ _id: otpRecord._id });
      logOtpDebug('verify.max_attempts', { record: otpRecordLogMeta(otpRecord) });
      return res.status(400).json({
        success: false,
        message: 'Maximum OTP attempts exceeded. Please request a new OTP.',
      });
    }

    // Verify OTP
    const otpMatches = await compareOtpRecord(otpRecord, otp);
    logOtpDebug('verify.compare', {
      email: maskEmail(email),
      receivedOtp: formatOtpForLog(otp),
      storedOtp: formatOtpForLog(otpRecord.otp),
      hasHash: Boolean(otpRecord.otpHash),
      match: otpMatches,
      expiresAt: otpRecord.expiresAt.toISOString(),
      now: new Date().toISOString(),
    });

    if (!otpMatches) {
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
      console.log(`✅ [verifyOtp] Activated account for ${maskEmail(email)}`);
      // Send welcome email non-blocking
      sendWelcomeEmail(email, user.name).catch(err => console.warn('⚠️ Welcome email failed:', err.message));
    }

    console.log(`✅ OTP verified successfully for ${maskEmail(email)}`);

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
 * Chatbot Registration Start
 * POST /api/auth/chat-registration/start
 *
 * Creates or updates a pending customer account from the deterministic chatbot
 * flow and emails a one-time password setup link. No password is accepted here.
 */
export const startChatRegistration = async (req, res) => {
  try {
    const result = await startChatRegistrationForCustomer(req.body);
    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message,
        ...(result.code ? { code: result.code } : {}),
      });
    }

    return res.status(result.status || 200).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('❌ Chat Registration Error:', error);
    return res.status(error.emailError ? 502 : 500).json({
      success: false,
      message: error.emailError
        ? 'Account saved, but we could not send the setup email. Please try resending.'
        : 'Failed to start account setup.',
      error: error.message,
    });
  }
};

/**
 * Chatbot Registration Resend
 * POST /api/auth/chat-registration/resend
 */
export const resendChatRegistrationEmail = async (req, res) => {
  try {
    const email = normalizeEmailForOtp(req.body.email);
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const user = await User.findOne({ email });
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, message: 'No pending account found for this email.' });
    }
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }
    if (user.role !== 'customer') {
      return res.status(409).json({ success: false, message: 'This email is not eligible for chatbot setup.' });
    }
    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'Account is already active. Please sign in.' });
    }

    const activeToken = await AccountSetupToken.findOne({
      userId: user._id,
      purpose: PASSWORD_SETUP_PURPOSE,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    }).sort({ lastSentAt: -1, createdAt: -1 });

    if (activeToken?.lastSentAt) {
      const elapsed = Date.now() - activeToken.lastSentAt.getTime();
      if (elapsed < PASSWORD_SETUP_RESEND_COOLDOWN_MS) {
        return res.status(429).json({
          success: false,
          message: 'Please wait before resending the setup email.',
          data: {
            retryAfterSeconds: Math.ceil((PASSWORD_SETUP_RESEND_COOLDOWN_MS - elapsed) / 1000),
          },
        });
      }
    }

    const tokenRecord = await issuePasswordSetupEmail(user);

    return res.json({
      success: true,
      message: 'A new password setup email has been sent.',
      data: {
        email,
        expiresAt: tokenRecord.expiresAt,
        expiresIn: config.passwordSetupTokenExpiry,
      },
    });
  } catch (error) {
    console.error('❌ Chat Registration Resend Error:', error);
    return res.status(error.emailError ? 502 : 500).json({
      success: false,
      message: error.emailError ? 'Failed to send setup email. Please try again.' : 'Failed to resend setup email.',
      error: error.message,
    });
  }
};

/**
 * Validate Password Setup Token
 * POST /api/auth/password-setup/validate
 */
export const validatePasswordSetupToken = async (req, res) => {
  try {
    const loaded = await loadPasswordSetupToken(req.body.token);
    if (!loaded.ok) {
      return res.status(loaded.status).json({ success: false, message: loaded.message });
    }

    return res.json({
      success: true,
      message: 'Setup token is valid.',
      data: {
        email: loaded.user.email,
        name: loaded.user.name,
        expiresAt: loaded.tokenRecord.expiresAt,
      },
    });
  } catch (error) {
    console.error('❌ Password Setup Validate Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to validate setup link.' });
  }
};

/**
 * Complete Password Setup
 * POST /api/auth/password-setup/complete
 */
export const completePasswordSetup = async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body || {};

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'New password and confirmation are required.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const passwordErrors = getPasswordPolicyErrors(newPassword);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ success: false, message: `Password must contain: ${passwordErrors.join(', ')}` });
    }

    const loaded = await loadPasswordSetupToken(token);
    if (!loaded.ok) {
      return res.status(loaded.status).json({ success: false, message: loaded.message });
    }

    const now = new Date();
    const consumeResult = await AccountSetupToken.updateOne(
      {
        _id: loaded.tokenRecord._id,
        usedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { usedAt: now } }
    );

    if (consumeResult.modifiedCount !== 1) {
      return res.status(400).json({ success: false, message: 'This setup link is no longer valid.' });
    }

    const user = loaded.user;
    user.password = newPassword;
    user.isVerified = true;
    user.status = 'active';
    await user.save();

    await AccountSetupToken.updateMany(
      {
        userId: user._id,
        purpose: PASSWORD_SETUP_PURPOSE,
        usedAt: null,
      },
      { $set: { usedAt: now } }
    );

    const authToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    await saveLastSeen(user);
    sendWelcomeEmail(user.email, user.name).catch(err => console.warn('⚠️ Welcome email failed:', err.message));

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject.__v;
    attachPhoneForClient(user, userObject);

    logActivity({
      userId: user._id,
      userName: user.name || user.email,
      userRole: user.role,
      type: 'chat_registration_completed',
      module: 'Auth',
      action: 'Password Setup Complete',
      description: `${user.name || user.email} activated their chatbot-created account.`,
      status: 'success',
    });

    return res.json({
      success: true,
      message: 'Welcome to AutoSPF+. Your account is now active.',
      data: { user: userObject, token: authToken },
    });
  } catch (error) {
    console.error('❌ Password Setup Complete Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to complete password setup.', error: error.message });
  }
};

/**
 * User Registration (Customer self-register — sends OTP, creates pending account)
 * POST /api/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { name, password, referralCode, phone: rawPhone } = req.body;
    const email = normalizeEmailForOtp(req.body.email);

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required',
      });
    }

    let phoneParsed = { ok: true, phone: undefined };
    if (rawPhone != null && String(rawPhone).trim() !== '') {
      phoneParsed = parseRegisterPhone(rawPhone);
      if (!phoneParsed.ok) {
        return res.status(400).json({
          success: false,
          message: phoneParsed.message || 'Invalid phone number.',
        });
      }
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
        // Account exists but unverified — reuse an unexpired code so repeated
        // submit/login attempts do not silently invalidate the email in hand.
        let otpRecord = await findLatestEmailOtp(email, {
          verified: false,
          expiresAt: { $gt: new Date() },
        });
        let otp;
        if (
          otpRecord &&
          otpRecord.attempts < otpRecord.maxAttempts &&
          normalizeOtpInput(otpRecord.otp).length === config.otpLength
        ) {
          otp = otpRecord.otp;
          otpRecord.lastSentAt = new Date();
          await otpRecord.save();
          logOtpDebug('register.existing_unverified.reuse', {
            email: maskEmail(email),
            otp: formatOtpForLog(otp),
            record: otpRecordLogMeta(otpRecord),
          });
        } else {
          otp = generateOTP(config.otpLength);
          await OTP.deleteMany({ email, purpose: EMAIL_OTP_PURPOSE });
          otpRecord = await OTP.create({
            email,
            otp,
            otpHash: await buildOtpHash(otp),
            expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
            attempts: 0,
            maxAttempts: 5,
            verified: false,
            purpose: EMAIL_OTP_PURPOSE,
            lastSentAt: new Date(),
          });
          logOtpDebug('register.existing_unverified.generated_saved', {
            email: maskEmail(email),
            generatedOtp: formatOtpForLog(otp),
            saved: otpRecordLogMeta(otpRecord),
          });
        }
        await sendOtpEmail(email, otp, {
          purpose: 'verification',
          otpRecordId: otpRecord?._id,
        }).catch(err => console.warn('OTP email failed:', err.message));
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
    // IMPORTANT: The web client calls createUserWithEmailAndPassword BEFORE calling
    // this endpoint, so a Firebase account for this email is legitimately fresh.
    // We only purge if the existing Firebase UID does NOT match the one the client
    // just created (i.e., it's a genuinely orphaned/stale record from a past failure).
    const { firebaseUid: clientFirebaseUid } = req.body;
    let linkedFirebaseUid = clientFirebaseUid || null;
    if (admin.apps.length > 0) {
      try {
        const fbUser = await admin.auth().getUserByEmail(email);
        if (clientFirebaseUid && fbUser.uid === clientFirebaseUid) {
          // This is the legitimately fresh Firebase account just created by the client.
          // Do NOT delete it — simply link its UID to the new MongoDB user.
          console.log(`✅ [Register] Fresh Firebase account confirmed for ${email} (uid: ${fbUser.uid})`);
          linkedFirebaseUid = fbUser.uid;
        } else {
          // Found a stale Firebase record (UID mismatch or no UID from client) — purge it.
          await admin.auth().deleteUser(fbUser.uid);
          console.log(`🧹 [Register] Purged stale Firebase account for ${email} (uid: ${fbUser.uid})`);
        }
      } catch (fbErr) {
        // getUserByEmail throws 'auth/user-not-found' when there's no record — that's fine.
        if (fbErr.code !== 'auth/user-not-found') {
          // Log unexpected Firebase errors but don't block registration.
          console.warn(`⚠️ [Register] Firebase stale-account check failed for ${email}:`, fbErr.message);
        }
      }
    }

    // Check if the email's OTP was already verified by the client BEFORE calling /register
    // (mobile flow: send-otp → verify-otp → register → login, all in sequence).
    // If so, create the account as already-verified so the immediately-following /login
    // call succeeds without requiring a second OTP round-trip.
    const preVerifiedOtp = await OTP.findOne({
      email,
      purpose: EMAIL_OTP_PURPOSE,
      verified: true,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1, _id: -1 });
    const isPreVerified = !!preVerifiedOtp;

    // Create new customer account (verified if OTP was pre-validated, pending otherwise)
    const user = new User({
      name,
      email,
      password, // hashed by pre-save hook
      role: 'customer',
      isVerified: isPreVerified,
      isActive: true,
      status: isPreVerified ? 'active' : 'pending',
      ...(phoneParsed.phone ? { phone: phoneParsed.phone } : {}),
      ...(linkedFirebaseUid ? { firebaseUid: linkedFirebaseUid } : {}),
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

    if (isPreVerified) {
      // OTP was already verified before /register was called (mobile flow).
      // Clean up the used OTP record and skip sending another email.
      await OTP.deleteMany({ email, purpose: EMAIL_OTP_PURPOSE });
      console.log(`✅ [Register] Account for ${email} created as pre-verified (mobile OTP flow)`);
      sendWelcomeEmail(email, user.name).catch(err => console.warn('⚠️ Welcome email failed:', err.message));
    } else {
      // Traditional web flow: user registers first, then verifies email.
      const otp = generateOTP(config.otpLength);
      await OTP.deleteMany({ email, purpose: EMAIL_OTP_PURPOSE });
      const otpRecord = await OTP.create({
        email,
        otp,
        otpHash: await buildOtpHash(otp),
        expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
        attempts: 0,
        maxAttempts: 5,
        verified: false,
        purpose: EMAIL_OTP_PURPOSE,
        lastSentAt: new Date(),
      });

      logOtpDebug('register.generated_saved', {
        email: maskEmail(email),
        generatedOtp: formatOtpForLog(otp),
        saved: otpRecordLogMeta(otpRecord),
      });

      const emailResult = await sendOtpEmail(email, otp, {
        purpose: 'verification',
        otpRecordId: otpRecord._id,
      });
      if (!emailResult.success) {
        console.error('❌ OTP email failed:', emailResult.error);
      }
    }

    logActivity({
      userId: user._id, userName: user.name || email, userRole: user.role,
      type: 'customer_registered', module: 'Auth', action: 'User Registered',
      description: `New customer account created: ${user.name || email}. ${isPreVerified ? 'Pre-verified via OTP.' : 'Awaiting OTP verification.'}`,
      status: 'success',
    });

    res.status(201).json({
      success: true,
      message: isPreVerified
        ? 'Account created successfully.'
        : 'Account created! Please check your email for a verification code.',
      data: { email, requiresOtp: !isPreVerified },
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

    // Normalize — User schema stores lowercase; queries must match (e.g. Staff@Co.com vs staff@co.com).
    const emailNormalized = String(email).trim().toLowerCase();

    // Server-side email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNormalized)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    // Find user
    const user = await User.findOne({ email: emailNormalized }).select('+password');
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
      // Unverified — resend without invalidating an unexpired code already sent.
      let otpRecord = await findLatestEmailOtp(emailNormalized, {
        verified: false,
        expiresAt: { $gt: new Date() },
      });
      let otp;
      if (
        otpRecord &&
        otpRecord.attempts < otpRecord.maxAttempts &&
        normalizeOtpInput(otpRecord.otp).length === config.otpLength
      ) {
        otp = otpRecord.otp;
        otpRecord.lastSentAt = new Date();
        await otpRecord.save();
        logOtpDebug('login.unverified.reuse', {
          email: maskEmail(emailNormalized),
          otp: formatOtpForLog(otp),
          record: otpRecordLogMeta(otpRecord),
        });
      } else {
        otp = generateOTP(config.otpLength);
        const otpHash = await buildOtpHash(otp);
        await OTP.deleteMany({ email: emailNormalized, purpose: EMAIL_OTP_PURPOSE });
        otpRecord = await OTP.create({
          email: emailNormalized,
          otp,
          otpHash,
          expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
          attempts: 0,
          maxAttempts: 5,
          verified: false,
          purpose: EMAIL_OTP_PURPOSE,
          lastSentAt: new Date(),
        });
        logOtpDebug('login.unverified.generated_saved', {
          email: maskEmail(emailNormalized),
          generatedOtp: formatOtpForLog(otp),
          saved: otpRecordLogMeta(otpRecord),
        });
      }
      await sendOtpEmail(emailNormalized, otp, {
        purpose: 'verification',
        otpRecordId: otpRecord?._id,
      }).catch(err => console.warn('OTP email failed:', err.message));
      return res.status(200).json({
        success: true,
        message: 'Please verify your email. A verification code has been sent.',
        data: { requiresOtp: true, email: emailNormalized },
      });
    }

    // Check if account is locked (specific demo/admin emails are never locked — see loginLockout.exempt.js)
    if (user.lockUntil && user.lockUntil > new Date() && !isLoginLockoutExemptEmail(emailNormalized)) {
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
    const lockoutExempt = isLoginLockoutExemptEmail(emailNormalized);

    if (!isPasswordValid) {
      if (!lockoutExempt) {
        user.loginAttempts = (user.loginAttempts || 0) + 1;

        if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
          user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
          await user.save();

          logActivity({
            userId: user._id, userName: user.name || emailNormalized, userRole: user.role,
            type: 'account_lock', module: 'Auth', action: 'Account Locked',
            description: `${user.name || emailNormalized} locked after ${MAX_LOGIN_ATTEMPTS} failed attempts.`,
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
          userId: user._id, userName: user.name || emailNormalized, userRole: user.role,
          type: 'failed_login', module: 'Auth', action: 'Failed Login',
          description: `Failed login attempt for ${emailNormalized}. Attempts: ${user.loginAttempts}/${MAX_LOGIN_ATTEMPTS}. Remaining: ${remainingAttempts}.`,
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

      logActivity({
        userId: user._id, userName: user.name || emailNormalized, userRole: user.role,
        type: 'failed_login', module: 'Auth', action: 'Failed Login',
        description: `Failed login attempt for ${emailNormalized} (lockout-exempt account).`,
        status: 'error',
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    // Reset login attempts on success
    if (user.loginAttempts !== 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      try {
        await user.save();
      } catch (saveErr) {
        console.warn('[Login] reset lockout fields save failed (non-fatal):', saveErr?.message || saveErr);
      }
    }

    // ── Staff first login: legacy flag cleanup ──────────────────────────
    if (user.isFirstLogin && user.role !== 'customer') {
      user.isFirstLogin = false;
      await user.save({ validateBeforeSave: false });
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
        console.log(`🔑 [Login DEV] Skipping 2FA for ${emailNormalized} (role: ${user.role})`);
        const token = jwt.sign(
          { id: user._id, email: user.email, role: user.role },
          config.jwtSecret,
          { expiresIn: '7d' }
        );
        await saveLastSeen(user);
        const userObject = user.toObject({ virtuals: true });
        delete userObject.password;
        delete userObject._id;
        delete userObject.__v;
        attachPhoneForClient(user, userObject);

        logActivity({
          userId: user._id, userName: user.name || emailNormalized, userRole: user.role,
          type: 'login', module: 'Auth', action: 'User Login (DEV)',
          description: `${user.name || emailNormalized} logged in (dev mode, 2FA skipped).`, status: 'success',
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
      await OTP.deleteMany({ userId: user._id, purpose: LOGIN_OTP_PURPOSE });

      const maskedEmail = emailNormalized.replace(/^(.)(.*)(@.*)$/, (_, first, middle, domain) =>
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
        purpose: LOGIN_OTP_PURPOSE,
        userId: user._id,
        lastSentAt: new Date(),
      });
      await otpRecord.save();

      // Send OTP email (fire-and-forget — failure is non-fatal here, client can resend)
      const emailResult = await sendOtpEmail(user.email, otp, {
        purpose: 'login',
        otpRecordId: otpRecord._id,
      });
      if (!emailResult.success) {
        console.error('❌ [Login 2FA] Failed to send OTP email:', emailResult.error);
        await OTP.deleteOne({ _id: otpRecord._id });
        return res.status(500).json({
          success: false,
          message: 'Failed to send verification code. Please try again.',
        });
      }

      logOtpDebug('login_2fa.generated_saved', {
        email: maskEmail(emailNormalized),
        generatedOtp: formatOtpForLog(otp),
        saved: otpRecordLogMeta(otpRecord),
      });

      logActivity({
        userId: user._id, userName: user.name || emailNormalized, userRole: user.role,
        type: 'login_otp_sent', module: 'Auth', action: '2FA OTP Sent',
        description: `OTP challenge issued for ${user.name || emailNormalized}.`, status: 'info',
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

    await saveLastSeen(user);

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject._id;
    delete userObject.__v;
    attachPhoneForClient(user, userObject);

    logActivity({
      userId: user._id, userName: user.name || emailNormalized, userRole: user.role,
      type: 'login', module: 'Auth', action: 'User Login',
      description: `${user.name || emailNormalized} logged in successfully.`, status: 'success',
    });

    const loginPayload = {
      success: true,
      message: 'Login successful',
      data: {
        user: userObject,
        token,
      },
    };
    try {
      JSON.stringify(loginPayload);
    } catch (serErr) {
      console.error('[Login] login response not JSON-serializable:', serErr);
      return res.status(500).json({
        success: false,
        message: 'Login failed',
        error: serErr?.message || String(serErr),
      });
    }

    res.json(loginPayload);
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
    attachPhoneForClient(user, userObject);

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

    await saveLastSeen(user);

    // Generate token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

     const userObject = user.toObject({ virtuals: true });
     delete userObject.password;
     // Keep _id so mobile clients can identify the MongoDB user ID.
     // The Mongoose virtual 'id' (string) is also present via virtuals: true.
     delete userObject.__v;
     attachPhoneForClient(user, userObject);

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
      if (admin.apps.length === 0) {
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
    const { userId } = req.body;
    const otp = normalizeOtpInput(req.body.otp);

    if (!userId || !otp) {
      return res.status(400).json({ success: false, message: 'userId and otp are required.' });
    }

    const otpRecord = await OTP.findOne({ userId, purpose: LOGIN_OTP_PURPOSE }).sort({ createdAt: -1, _id: -1 });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'OTP not found. Please request a new code.' });
    }
    logOtpDebug('login_verify.loaded', {
      userId,
      receivedOtp: formatOtpForLog(otp),
      record: otpRecordLogMeta(otpRecord),
    });

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
    const isValid = await compareOtpRecord(otpRecord, otp);
    logOtpDebug('login_verify.compare', {
      userId,
      receivedOtp: formatOtpForLog(otp),
      storedOtp: formatOtpForLog(otpRecord.otp),
      hasHash: Boolean(otpRecord.otpHash),
      match: isValid,
      expiresAt: otpRecord.expiresAt.toISOString(),
      now: new Date().toISOString(),
    });
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

    await saveLastSeen(user);

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject._id;
    delete userObject.__v;
    attachPhoneForClient(user, userObject);

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

    const existing = await OTP.findOne({ userId, purpose: LOGIN_OTP_PURPOSE }).sort({ createdAt: -1, _id: -1 });
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
    await OTP.deleteMany({ userId, purpose: LOGIN_OTP_PURPOSE });
    const otpRecord = new OTP({
      email: user.email,
      otp,
      otpHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
      maxAttempts: 3,
      verified: false,
      purpose: LOGIN_OTP_PURPOSE,
      userId: user._id,
      lastSentAt: new Date(),
    });
    await otpRecord.save();

    const emailResult = await sendOtpEmail(user.email, otp, {
      purpose: 'login',
      otpRecordId: otpRecord._id,
    });
    if (!emailResult.success) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(500).json({ success: false, message: 'Failed to send code. Please try again.' });
    }

    logOtpDebug('login_resend.generated_saved', {
      email: maskEmail(user.email),
      generatedOtp: formatOtpForLog(otp),
      saved: otpRecordLogMeta(otpRecord),
    });

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

    if (!STAFF_ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Allowed staff roles: ${STAFF_ASSIGNABLE_ROLES.join(', ')}` });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

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
      isFirstLogin: false,
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
 * Change Password (authenticated user changes their own password)
 * POST /api/auth/change-password
 * Requires: Bearer token
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    }

    const user = await User.findById(userId).select('+password');
    if (!user || user.isDeleted || !user.isActive) {
      return res.status(403).json({ success: false, message: 'Account not accessible.' });
    }

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'New password must be different from current password.' });
    }

    // Enforce same password policy as registration
    const passwordErrors = [];
    if (newPassword.length < 8) passwordErrors.push('at least 8 characters');
    if (!/[A-Z]/.test(newPassword)) passwordErrors.push('one uppercase letter');
    if (!/[a-z]/.test(newPassword)) passwordErrors.push('one lowercase letter');
    if (!/[0-9]/.test(newPassword)) passwordErrors.push('one number');
    if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(newPassword)) passwordErrors.push('one special character');
    if (passwordErrors.length > 0) {
      return res.status(400).json({ success: false, message: `Password must contain: ${passwordErrors.join(', ')}` });
    }

    user.password = newPassword; // hashed by pre-save hook
    await user.save();

    logActivity({
      userId: user._id, userName: user.name || user.email, userRole: user.role,
      type: 'password_changed', module: 'Auth', action: 'Change Password',
      description: `${user.name || user.email} changed their account password.`, status: 'success',
    });

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('❌ [changePassword] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to change password.', error: error.message });
  }
};

/**
 * Resend OTP (registration / account verification)
 * POST /api/auth/resend-otp
 */
export const resendOtp = async (req, res) => {
  try {
    const email = normalizeEmailForOtp(req.body.email);
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'No account found with this email.' });
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Account is already verified.' });

    const otp = generateOTP(config.otpLength);
    await OTP.deleteMany({ email, purpose: EMAIL_OTP_PURPOSE });
    const otpRecord = await OTP.create({
      email,
      otp,
      otpHash: await buildOtpHash(otp),
      expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
      attempts: 0,
      maxAttempts: 5,
      verified: false,
      purpose: EMAIL_OTP_PURPOSE,
      lastSentAt: new Date(),
    });

    logOtpDebug('resend.generated_saved', {
      email: maskEmail(email),
      generatedOtp: formatOtpForLog(otp),
      saved: otpRecordLogMeta(otpRecord),
    });
    const emailResult = await sendOtpEmail(email, otp, {
      purpose: 'verification',
      otpRecordId: otpRecord._id,
    });
    if (!emailResult.success) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(500).json({ success: false, message: 'Failed to resend OTP. Please try again.' });
    }

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

/**
 * Recover Firebase Account
 * POST /api/auth/recover-firebase
 *
 * Used by mobile clients when Firebase login fails (auth/user-not-found).
 * Validates credentials against MongoDB, then uses Firebase Admin SDK to
 * re-create the Firebase account. This restores cross-platform login for
 * web-registered customers whose Firebase accounts were purged by the old
 * /auth/register logic.
 *
 * No auth middleware required — the password serves as the credential.
 */
export const recoverFirebase = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Find the customer in MongoDB
    const user = await User.findOne({ email, isDeleted: { $ne: true } }).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    // Validate password against MongoDB hash
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // ── Helper: wrap Admin SDK calls with a timeout ─────────────────────────
    // Firebase Admin SDK calls can hang indefinitely if credentials are
    // misconfigured or the server can't reach Google APIs. This prevents
    // the mobile client from timing out with no response.
    const withAdminTimeout = (promise, ms = 8000) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error('ADMIN_SDK_TIMEOUT'), { code: 'admin/timeout' })), ms)
        ),
      ]);

    if (admin.apps.length === 0) {
      // ── Fallback: Firebase Admin SDK not configured ─────────────────────
      // Password is valid in MongoDB. Tell the mobile client to create the
      // Firebase account itself using createUserWithEmailAndPassword().
      // This avoids needing any Admin SDK credentials on the server.
      console.log(`[recoverFirebase] Admin SDK not configured — instructing client-side Firebase create for ${email}`);

      // Mark user as verified if not already
      if (!user.isVerified) {
        user.isVerified = true;
        await user.save();
      }

      // Issue a JWT so after Firebase create the client can call social-login
      const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role },
        config.jwtSecret,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        needsClientCreate: true,
        message: 'MongoDB credentials valid. Please create Firebase account on device.',
        data: { token, needsClientCreate: true, userName: user.name },
      });
    }

    // Check if a Firebase account already exists
    let firebaseUid = user.firebaseUid;
    try {
      const existingFbUser = await withAdminTimeout(admin.auth().getUserByEmail(email));
      firebaseUid = existingFbUser.uid;
      console.log(`[recoverFirebase] Firebase account already exists for ${email} (uid: ${firebaseUid})`);
    } catch (fbErr) {
      if (fbErr.code === 'auth/user-not-found') {
        // Create a new Firebase Auth account with the same password
        try {
          const newFbUser = await withAdminTimeout(admin.auth().createUser({
            email,
            password,
            displayName: user.name,
            emailVerified: true,
          }));
          firebaseUid = newFbUser.uid;
          console.log(`[recoverFirebase] ✅ Restored Firebase account for ${email} (uid: ${firebaseUid})`);
        } catch (createErr) {
          if (createErr.code === 'admin/timeout') {
            // Admin SDK hung on createUser — fall back to client-side creation
            console.warn(`[recoverFirebase] Admin SDK createUser timed out for ${email} — instructing client-side create`);
            if (!user.isVerified) { user.isVerified = true; await user.save(); }
            const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
            return res.json({ success: true, needsClientCreate: true, message: 'MongoDB credentials valid. Please create Firebase account on device.', data: { token, needsClientCreate: true, userName: user.name } });
          }
          throw createErr;
        }
      } else if (fbErr.code === 'admin/timeout') {
        // Admin SDK hung on getUserByEmail — fall back to client-side creation
        console.warn(`[recoverFirebase] Admin SDK getUserByEmail timed out for ${email} — instructing client-side create`);
        if (!user.isVerified) { user.isVerified = true; await user.save(); }
        const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
        return res.json({ success: true, needsClientCreate: true, message: 'MongoDB credentials valid. Please create Firebase account on device.', data: { token, needsClientCreate: true, userName: user.name } });
      } else {
        throw fbErr;
      }
    }

    // Link the Firebase UID to the MongoDB user
    if (!user.firebaseUid || user.firebaseUid !== firebaseUid) {
      user.firebaseUid = firebaseUid;
      if (!user.isVerified) user.isVerified = true;
      await user.save();
      console.log(`[recoverFirebase] Linked firebaseUid ${firebaseUid} to MongoDB user ${email}`);
    }

    // Issue a JWT so the client can complete the social-login flow
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    logActivity({
      userId: user._id, userName: user.name || email, userRole: user.role,
      type: 'login', module: 'Auth', action: 'Firebase Account Recovered',
      description: `Firebase account restored for ${email}. UID: ${firebaseUid}.`, status: 'success',
    });

    return res.json({
      success: true,
      message: 'Firebase account restored. You can now sign in.',
      data: { token, firebaseUid },
    });
  } catch (error) {
    console.error('❌ [recoverFirebase] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore Firebase account.', error: error.message });
  }
};
