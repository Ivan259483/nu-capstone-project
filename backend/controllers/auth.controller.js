import User from '../models/user.model.js';
import OTP from '../models/oTP.model.js';
import AccountSetupToken from '../models/accountSetupToken.model.js';
import StaffVerificationToken from '../models/staffVerificationToken.model.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config/environment.js';
import { sendOtpEmail, sendWelcomeEmail, sendPasswordResetEmail, sendPasswordSetupEmail } from '../utils/mail.utils.js'; // Resend mailer
import {
  getInvalidUserRoleMessage,
  isValidUserRole,
  STAFF_ASSIGNABLE_ROLES,
  STAFF_2FA_AUTH_LEVEL,
  STAFF_2FA_ROLES,
  requiresStaffTwoFactor,
} from '../constants/roles.js';
import { logActivity } from '../utils/logActivity.utils.js';
import firebaseAdmin, { firebaseTokenVerifier } from '../config/firebaseAdmin.js';
import { parseRegisterPhone, parseOptionalProfilePhone } from '../utils/phone.utils.js';
import { isLoginLockoutExemptEmail } from '../constants/loginLockout.exempt.js';
import { attachPhoneForClient } from '../utils/phone-client.utils.js';
import { attachProfileImageForClient } from '../utils/profile-image.utils.js';
import { startChatRegistrationForCustomer } from '../services/chatRegistration.service.js';
import {
  EMAIL_OTP_PURPOSE,
  PASSWORD_RESET_OTP_PURPOSE,
  LOGIN_OTP_PURPOSE,
  formatOtpForLog,
  generateLoginChallengeToken,
  hashLoginChallengeToken,
  loginChallengeMatches,
  maskEmail,
  normalizeEmailForOtp,
  normalizeOtpInput,
  otpRecordLogMeta,
  timingSafeOtpEqual,
} from '../utils/otp.utils.js';
import {
  consumeStaffVerificationToken,
  issueStaffVerificationLink,
} from '../services/staffVerification.service.js';
import { normalizeAuthVersion } from '../utils/authVersion.utils.js';
import {
  buildAdminDeepLink,
  buildAdminGroupingKey,
  createAdminNotification,
} from '../services/adminNotification.service.js';
import { runInBackground, timeOperation } from '../utils/performance.utils.js';

// Roles that require Email OTP 2FA after password verification.
// 'customer' is intentionally excluded — direct JWT login.
// ⚠️  Must mirror every non-customer value from constants/roles.js → USER_ROLES.
const NON_CUSTOMER_ROLES = STAFF_2FA_ROLES;

const PASSWORD_SETUP_PURPOSE = 'password_setup';
const PASSWORD_SETUP_RESEND_COOLDOWN_MS = 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

const notifyAuthSecurityEvent = async ({
  event,
  title,
  message,
  severity = 'warning',
  targetUser,
  actionRequired,
  groupingWindowMs = 24 * 60 * 60 * 1000,
  metadata = {},
}) => {
  try {
    const targetUserId = targetUser?._id || targetUser?.id;
    return await createAdminNotification({
      title,
      message,
      category: 'security',
      event,
      severity,
      source: 'Authentication',
      actionRequired: actionRequired ?? (severity === 'critical' || severity === 'warning'),
      groupingKey: buildAdminGroupingKey('security', event, targetUserId || 'unknown_user'),
      groupingWindowMs,
      link: buildAdminDeepLink('security', targetUserId ? { userId: String(targetUserId) } : {}),
      action: { label: 'Review security activity' },
      metadata: {
        targetUserId,
        targetUserName: targetUser?.name,
        targetUserRole: targetUser?.role,
        ...metadata,
      },
    });
  } catch (error) {
    console.warn('[Auth] Admin security notification failed:', error.message);
    return null;
  }
};

/**
 * Generate OTP
 */
const generateOTP = (length = 6) => {
  // Use cryptographically secure random integer and preserve leading zeroes.
  const max = Math.pow(10, length); // crypto.randomInt upper bound is exclusive
  return crypto.randomInt(0, max).toString().padStart(length, '0');
};

const buildOtpHash = (otp) => bcrypt.hash(normalizeOtpInput(otp), 10);

const findLatestOtp = (email, purpose, extraQuery = {}) =>
  OTP.findOne({
    email: normalizeEmailForOtp(email),
    purpose,
    ...extraQuery,
  }).sort({ createdAt: -1, _id: -1 });

const findLatestEmailOtp = (email, extraQuery = {}) =>
  findLatestOtp(email, EMAIL_OTP_PURPOSE, extraQuery);

const findLatestPasswordResetOtp = (email, extraQuery = {}) =>
  findLatestOtp(email, PASSWORD_RESET_OTP_PURPOSE, extraQuery);

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

/** Presence is best-effort and must never hold a successful auth response open. */
function scheduleLastSeen(userDoc, req) {
  const userId = userDoc?._id || userDoc?.id;
  if (!userId) return;
  runInBackground({ req, kind: 'db', name: 'auth.user.lastSeenAt.update' }, () =>
    User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } })
  );
}

const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

function serializeUserForAuthResponse(user) {
  const userObject = user.toObject({ virtuals: true });
  delete userObject.password;
  delete userObject._id;
  delete userObject.__v;
  attachPhoneForClient(user, userObject);
  attachProfileImageForClient(user, userObject);
  return userObject;
}

const buildAuthTokenClaims = (user, additionalClaims = {}) => ({
  id: user._id,
  email: user.email,
  role: user.role,
  ...(requiresStaffTwoFactor(user.role)
    ? { authVersion: normalizeAuthVersion(user.authVersion) }
    : {}),
  ...additionalClaims,
});

async function issueAuthTokenResponse(user, req) {
  const token = jwt.sign(
    buildAuthTokenClaims(user),
    config.jwtSecret,
    { expiresIn: '7d' }
  );
  scheduleLastSeen(user, req);
  return { user: serializeUserForAuthResponse(user), token };
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

  const user = await User.findById(tokenRecord.userId);
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

    if (existingUser && requiresStaffTwoFactor(existingUser.role)) {
      return res.status(400).json({
        success: false,
        code: 'STAFF_VERIFICATION_LINK_REQUIRED',
        message: 'Staff accounts are verified through the secure link sent by an administrator.',
      });
    }

    if (existingUser?.isVerified) {
      return res.status(409).json({
        success: false,
        message: 'This account is already verified. Please sign in.',
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

    if (existingOtp?.lastSentAt) {
      const elapsed = Date.now() - existingOtp.lastSentAt.getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${retryAfterSeconds} second(s) before requesting another code.`,
          data: { retryAfterSeconds },
        });
      }
    }

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
        ...(existingUser && requiresStaffTwoFactor(existingUser.role)
          ? { userId: existingUser._id }
          : {}),
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

    const existingResetOtp = await findLatestPasswordResetOtp(email, {
      verified: false,
      expiresAt: { $gt: new Date() },
    });
    if (existingResetOtp?.lastSentAt) {
      const elapsed = Date.now() - existingResetOtp.lastSentAt.getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${retryAfterSeconds} second(s) before requesting another reset code.`,
          data: { retryAfterSeconds },
        });
      }
    }

    // reuse sendOtp logic or call it directly? 
    // For now, let's implement the core logic to generate and send OTP here 
    // to be specific for password reset if needed, or we can just reuse the generic OTP flow.
    // Given the routes, send-otp is public for signup/login. 
    // forgot-password is specific.
    
    // Generate new OTP
    const otp = generateOTP(config.otpLength);

    // Delete previous OTP
    await OTP.deleteMany({ email, purpose: PASSWORD_RESET_OTP_PURPOSE });

    // Create OTP record
    const otpRecord = new OTP({
      email,
      otp,
      otpHash: await buildOtpHash(otp),
      expiresAt: new Date(Date.now() + config.otpExpiry * 1000),
      attempts: 0,
      maxAttempts: 5,
      verified: false,
      purpose: PASSWORD_RESET_OTP_PURPOSE,
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
    const otpRecord = await findLatestPasswordResetOtp(email, { verified: true });

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

    const consumedOtp = await OTP.findOneAndDelete({
      _id: otpRecord._id,
      purpose: PASSWORD_RESET_OTP_PURPOSE,
      verified: true,
      expiresAt: { $gt: new Date() },
    });
    if (!consumedOtp) {
      return res.status(409).json({
        success: false,
        message: 'This reset code has already been used. Please request a new code.',
      });
    }

    // Update password only after atomically consuming the purpose-bound reset OTP.
    user.password = newPassword;
    await user.save();

    // Clean up OTP
    await OTP.deleteMany({ email, purpose: PASSWORD_RESET_OTP_PURPOSE });

    logActivity({
      userId: user._id, userName: user.name || email, userRole: user.role,
      type: 'password_reset', module: 'Auth', action: 'Password Reset',
      description: `${user.name || email} reset their password.`, status: 'success',
    });

    if (requiresStaffTwoFactor(user.role)) {
      await notifyAuthSecurityEvent({
        event: 'staff_password_reset',
        title: 'Staff password reset',
        message: `${user.name || user.email} reset their staff account password.`,
        severity: 'warning',
        targetUser: user,
        actionRequired: false,
      });
    }

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

    const account = await User.findOne({ email });
    if (account && requiresStaffTwoFactor(account.role)) {
      return res.status(400).json({
        success: false,
        code: 'STAFF_VERIFICATION_LINK_REQUIRED',
        message: 'Staff accounts must use the secure verification link sent to their registered email.',
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
      const updatedOtp = await OTP.findOneAndUpdate(
        { _id: otpRecord._id, attempts: { $lt: otpRecord.maxAttempts } },
        { $inc: { attempts: 1 } },
        { new: true },
      );
      const currentAttempts = Number(updatedOtp?.attempts ?? otpRecord.maxAttempts);

      return res.status(400).json({
        success: false,
        message: `Invalid OTP. Attempts remaining: ${Math.max(0, otpRecord.maxAttempts - currentAttempts)}`,
      });
    }

    const user = account;
    if (user?.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted by an administrator.',
      });
    }

    if (user && !user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    if (user?.isVerified) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(409).json({
        success: false,
        message: 'This account is already verified. Please sign in.',
      });
    }

    if (user && otpRecord.userId && String(otpRecord.userId) !== String(user._id)) {
      return res.status(400).json({
        success: false,
        message: 'This verification code is not valid for the requested account.',
      });
    }

    if (!user) {
      // Mobile registration verifies ownership before the customer document exists.
      // Keep this purpose-bound record briefly so /register can consume it.
      const marked = await OTP.findOneAndUpdate(
        {
          _id: otpRecord._id,
          purpose: EMAIL_OTP_PURPOSE,
          verified: false,
          expiresAt: { $gt: new Date() },
        },
        { $set: { verified: true } },
        { new: true },
      );
      if (!marked) {
        return res.status(409).json({
          success: false,
          message: 'This verification code has already been used.',
        });
      }

      return res.json({
        success: true,
        message: 'OTP verified successfully',
        data: { email, verified: true, role: 'customer', isFirstLogin: false },
      });
    }

    // Existing accounts consume their activation code atomically. Only one
    // concurrent request can activate the account or continue to session issuance.
    const consumedOtp = await OTP.findOneAndDelete({
      _id: otpRecord._id,
      purpose: EMAIL_OTP_PURPOSE,
      verified: false,
      expiresAt: { $gt: new Date() },
    });
    if (!consumedOtp) {
      return res.status(409).json({
        success: false,
        message: 'This verification code has already been used.',
      });
    }

    user.isVerified = true;
    user.isActive = true;
    user.status = 'active';
    await user.save();
    console.log(`✅ [verifyOtp] Activated account for ${maskEmail(email)}`);
    sendWelcomeEmail(email, user.name).catch(err => console.warn('⚠️ Welcome email failed:', err.message));

    logActivity({
      userId: user._id,
      userName: user.name || email,
      userRole: user.role,
      type: 'email_verified',
      module: 'Auth',
      action: 'Email Verified',
      description: `${user.name || email} verified their account email.`,
      status: 'success',
    });

    console.log(`✅ OTP verified successfully for ${maskEmail(email)}`);

    // Staff activation is not authentication. Password + a separate login OTP
    // are still required, so this response intentionally contains no JWT/user.
    if (requiresStaffTwoFactor(user.role)) {
      return res.json({
        success: true,
        message: 'Email verified. Sign in with your password to receive a login code.',
        data: {
          email,
          verified: true,
          role: user.role,
          requiresLogin: true,
          requires2FA: true,
        },
      });
    }

    // Preserve the existing customer activation experience: verified customers
    // receive their normal session immediately after registration verification.
    const { user: userObject, token } = await issueAuthTokenResponse(user, req);
    return res.json({
      success: true,
      message: 'Email verified. You are now signed in.',
      data: {
        email,
        verified: true,
        role: user.role || 'customer',
        isFirstLogin: user.isFirstLogin || false,
        user: userObject,
        token,
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
 * Verify a staff account through an opaque, account-bound email link.
 * This activates the account but never authenticates a session or returns a JWT.
 * POST /api/auth/verify-staff-email
 */
export const verifyStaffEmail = async (req, res) => {
  try {
    const user = await consumeStaffVerificationToken(req.body?.token);

    sendWelcomeEmail(user.email, user.name)
      .catch((error) => console.warn('[verifyStaffEmail] Welcome email failed:', error?.message || error));

    logActivity({
      userId: user._id,
      userName: user.name || user.email,
      userRole: user.role,
      type: 'email_verified',
      module: 'Auth',
      action: 'Staff Email Verified',
      description: `${user.name || user.email} verified their staff account email.`,
      status: 'success',
    });

    return res.json({
      success: true,
      message: 'Account verified. Sign in with your password to receive your 6-digit sign-in code.',
      data: {
        verified: true,
        role: user.role,
        requiresLogin: true,
        requires2FA: true,
      },
    });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    if (status >= 500) {
      console.error('[verifyStaffEmail] Error:', error);
    }
    return res.status(status).json({
      success: false,
      code: error?.code || 'STAFF_VERIFICATION_FAILED',
      message: status >= 500 ? 'Account verification failed. Please try again.' : error.message,
    });
  }
};

/**
 * Verify a password-reset OTP without activating an account or issuing a JWT.
 * POST /api/auth/verify-reset-otp
 */
export const verifyPasswordResetOtp = async (req, res) => {
  try {
    const email = normalizeEmailForOtp(req.body.email);
    const otp = normalizeOtpInput(req.body.otp);
    const otpRecord = await findLatestPasswordResetOtp(email, { verified: false });

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Reset code not found. Request a new code.' });
    }
    if (otpRecord.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(400).json({ success: false, message: 'Reset code has expired. Request a new code.' });
    }
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(429).json({ success: false, message: 'Maximum reset-code attempts exceeded.' });
    }

    const matches = await compareOtpRecord(otpRecord, otp);
    if (!matches) {
      const updated = await OTP.findOneAndUpdate(
        { _id: otpRecord._id, verified: false, attempts: { $lt: otpRecord.maxAttempts } },
        { $inc: { attempts: 1 } },
        { new: true },
      );
      const remaining = Math.max(0, otpRecord.maxAttempts - Number(updated?.attempts || otpRecord.attempts + 1));
      return res.status(400).json({
        success: false,
        message: `Invalid reset code. Attempts remaining: ${remaining}`,
      });
    }

    const verifiedRecord = await OTP.findOneAndUpdate(
      {
        _id: otpRecord._id,
        purpose: PASSWORD_RESET_OTP_PURPOSE,
        verified: false,
        expiresAt: { $gt: new Date() },
      },
      { $set: { verified: true } },
      { new: true },
    );
    if (!verifiedRecord) {
      return res.status(409).json({ success: false, message: 'This reset code has already been used.' });
    }

    return res.json({
      success: true,
      message: 'Reset code verified.',
      data: { email, verified: true },
    });
  } catch (error) {
    console.error('❌ Verify Password Reset OTP Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify reset code.' });
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
      buildAuthTokenClaims(user),
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    scheduleLastSeen(user, req);
    sendWelcomeEmail(user.email, user.name).catch(err => console.warn('⚠️ Welcome email failed:', err.message));

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject.__v;
    attachPhoneForClient(user, userObject);
    attachProfileImageForClient(user, userObject);

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
        if (requiresStaffTwoFactor(existingUser.role)) {
          return res.status(409).json({
            success: false,
            code: 'ACCOUNT_PENDING_VERIFICATION',
            message: 'This staff account is pending verification. Use the secure link sent to its registered email.',
          });
        }
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
          data: { email, requiresOtp: true, expiresIn: config.otpExpiry },
        });
      }
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Never trust or act on a client-supplied Firebase UID here. The account is
    // linked later by /social-login only after its Firebase ID token is verified.

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
      data: {
        email,
        requiresOtp: !isPreVerified,
        expiresIn: isPreVerified ? undefined : config.otpExpiry,
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
    let user = await timeOperation(
      { req, res, kind: 'db', name: 'login.user.findByEmail' },
      () => User.findOne({ email: emailNormalized })
    );
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

    // Legacy or malformed role strings are never treated as customer accounts.
    // In particular, raw `admin` records require an explicit audited migration;
    // they are not silently promoted and cannot bypass Administrator 2FA.
    if (!isValidUserRole(user.role)) {
      return res.status(403).json({
        success: false,
        code: 'INVALID_ACCOUNT_ROLE',
        message: 'This account role requires administrator review.',
      });
    }

    // Preserve the existing customer registration flow. Staff verification is
    // handled only after their administrator-provisioned password is validated.
    if (!user.isVerified && !requiresStaffTwoFactor(user.role)) {
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

    // Check account lockout before password verification. Once a lock expires,
    // atomically open a fresh failure window so the preserved threshold counter
    // cannot immediately re-lock the account on its next password attempt.
    const lockoutExempt = isLoginLockoutExemptEmail(emailNormalized);
    const lockCheckTime = new Date();
    if (user.lockUntil && user.lockUntil > lockCheckTime && !lockoutExempt) {
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

    if (!lockoutExempt && user.lockUntil && user.lockUntil <= lockCheckTime) {
      const expiredLockUntil = user.lockUntil;
      const resetUser = await User.findOneAndUpdate(
        { _id: user._id, lockUntil: expiredLockUntil },
        { $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } },
        { new: true },
      );

      if (resetUser) {
        user = resetUser;
      } else {
        // Another request changed the lock concurrently. Reload and fail closed
        // if it installed a new active lock; never clear that newer lock here.
        const currentUser = await User.findById(user._id);
        if (!currentUser) {
          return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        if (currentUser.lockUntil && currentUser.lockUntil > new Date()) {
          const remainingMs = currentUser.lockUntil.getTime() - Date.now();
          const remainingMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
          return res.status(423).json({
            success: false,
            message: `Account locked. Please try again in ${remainingMinutes} minute(s).`,
            data: {
              locked: true,
              lockUntilMs: currentUser.lockUntil.getTime(),
              remainingMinutes,
            },
          });
        }
        user = currentUser;
      }
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
    const isPasswordValid = await timeOperation(
      { req, res, kind: 'cpu', name: 'login.password.bcryptCompare' },
      () => user.comparePassword(password)
    );

    if (!isPasswordValid) {
      if (!lockoutExempt) {
        const updatedUser = await User.findOneAndUpdate(
          { _id: user._id, loginAttempts: { $lt: MAX_LOGIN_ATTEMPTS } },
          { $inc: { loginAttempts: 1 } },
          { new: true },
        );
        const currentAttempts = Number(updatedUser?.loginAttempts ?? MAX_LOGIN_ATTEMPTS);

        if (currentAttempts >= MAX_LOGIN_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCK_TIME_MS);
          await User.updateOne(
            { _id: user._id },
            { $set: { loginAttempts: MAX_LOGIN_ATTEMPTS, lockUntil } },
          );

          logActivity({
            userId: user._id, userName: user.name || emailNormalized, userRole: user.role,
            type: 'account_lock', module: 'Auth', action: 'Account Locked',
            description: `${user.name || emailNormalized} locked after ${MAX_LOGIN_ATTEMPTS} failed attempts.`,
            status: 'warning',
          });

          await notifyAuthSecurityEvent({
            event: 'account_locked',
            title: 'Account locked after failed logins',
            message: `${user.name || emailNormalized} was locked after ${MAX_LOGIN_ATTEMPTS} failed password attempts.`,
            severity: 'critical',
            targetUser: user,
            actionRequired: true,
            groupingWindowMs: 60 * 60 * 1000,
            metadata: { loginAttempts: MAX_LOGIN_ATTEMPTS, lockUntil },
          });

          return res.status(423).json({
            success: false,
            message: 'Account locked for 15 minutes due to too many failed attempts.',
            data: {
              locked: true,
              lockUntilMs: lockUntil.getTime(),
              remainingMinutes: 15,
            },
          });
        }

        const remainingAttempts = MAX_LOGIN_ATTEMPTS - currentAttempts;

        logActivity({
          userId: user._id, userName: user.name || emailNormalized, userRole: user.role,
          type: 'failed_login', module: 'Auth', action: 'Failed Login',
          description: `Failed login attempt for ${emailNormalized}. Attempts: ${currentAttempts}/${MAX_LOGIN_ATTEMPTS}. Remaining: ${remainingAttempts}.`,
          status: 'error',
        });

        return res.status(401).json({
          success: false,
          message: `Invalid credentials. ${remainingAttempts} attempt(s) remaining before your account is locked.`,
          data: {
            loginAttempts: currentAttempts,
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

    if (!user.isVerified && requiresStaffTwoFactor(user.role)) {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_PENDING_VERIFICATION',
        message: 'Verify your staff account email before signing in.',
        data: {
          requiresEmailVerification: true,
          email: emailNormalized,
        },
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
      otpRequired: requiresStaffTwoFactor(user.role),
      allOtpRoles: NON_CUSTOMER_ROLES,
    });
    if (requiresStaffTwoFactor(user.role)) {
      // Staff 2FA is mandatory in every environment. The opaque challenge is
      // returned only after the password succeeds and is required for verify/resend.
      const existingLoginOtp = await timeOperation(
        { req, res, kind: 'db', name: 'login.otp.findLatest' },
        () => OTP.findOne({
          userId: user._id,
          purpose: LOGIN_OTP_PURPOSE,
        }).sort({ createdAt: -1, _id: -1 })
      );
      let carriedAttempts = 0;
      if (existingLoginOtp && existingLoginOtp.expiresAt > new Date()) {
        if (existingLoginOtp.attempts >= existingLoginOtp.maxAttempts) {
          const lockUntil = new Date(Date.now() + LOCK_TIME_MS);
          await User.updateOne({ _id: user._id }, { $set: { lockUntil } });
          return res.status(423).json({
            success: false,
            message: 'Account locked for 15 minutes due to too many failed verification attempts.',
            data: { locked: true, lockUntilMs: lockUntil.getTime(), remainingMinutes: 15 },
          });
        }

        if (existingLoginOtp.lastSentAt) {
          const elapsed = Date.now() - existingLoginOtp.lastSentAt.getTime();
          if (elapsed < OTP_RESEND_COOLDOWN_MS) {
            const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
            return res.status(429).json({
              success: false,
              message: `Please wait ${waitSeconds} second(s) before requesting another login code.`,
              data: { waitSeconds },
            });
          }
        }
        carriedAttempts = existingLoginOtp.attempts;
      }

      const otp = generateOTP(6);
      const otpHash = await timeOperation(
        { req, res, kind: 'cpu', name: 'login.otp.bcryptHash' },
        () => bcrypt.hash(otp, 10)
      );
      const challengeToken = generateLoginChallengeToken();

      const maskedEmail = emailNormalized.replace(/^(.)(.*)(@.*)$/, (_, first, middle, domain) =>
        `${first}${'*'.repeat(Math.min(middle.length, 5))}${domain}`
      );

      // Replace the current challenge in one database command. The previous
      // delete + insert sequence added an avoidable Atlas network round trip.
      const otpRecord = await timeOperation(
        { req, res, kind: 'db', name: 'login.otp.replaceChallenge' },
        () => OTP.findOneAndUpdate(
          { userId: user._id, purpose: LOGIN_OTP_PURPOSE },
          {
            $set: {
              email: user.email,
              otp,              // plain — kept for legacy queries, never sent to client
              otpHash,          // bcrypt hash — used for verification
              expiresAt: new Date(Date.now() + 5 * 60 * 1000),
              attempts: carriedAttempts,
              maxAttempts: 3,
              verified: false,
              lastSentAt: new Date(),
              loginChallengeHash: hashLoginChallengeToken(challengeToken),
            },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true, sort: { createdAt: -1, _id: -1 } }
        )
      );

      // Send OTP email (fire-and-forget — failure is non-fatal here, client can resend)
      const emailResult = await timeOperation(
        { req, res, kind: 'external', name: 'login.email.sendOtp' },
        () => sendOtpEmail(user.email, otp, {
          purpose: 'login',
          otpRecordId: otpRecord._id,
        })
      );
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
          challengeToken,
        },
      });
    }

    // ── Customer (or any unlisted role): direct JWT ─────────────────────────
    const token = jwt.sign(
      buildAuthTokenClaims(user),
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    scheduleLastSeen(user, req);

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject._id;
    delete userObject.__v;
    attachPhoneForClient(user, userObject);
    attachProfileImageForClient(user, userObject);

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
    attachProfileImageForClient(user, userObject);

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
    const { idToken, name } = req.body;

    if (!firebaseTokenVerifier) {
      return res.status(503).json({
        success: false,
        message: 'Social authentication is temporarily unavailable.',
      });
    }

    let verifiedIdentity;
    try {
      verifiedIdentity = await firebaseTokenVerifier.verifyIdToken(idToken, true);
    } catch {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired identity token.',
      });
    }

    const email = normalizeEmailForOtp(verifiedIdentity.email);
    const providerId = verifiedIdentity.uid;
    const provider = verifiedIdentity.firebase?.sign_in_provider || 'firebase';
    if (!email || !providerId) {
      return res.status(401).json({
        success: false,
        message: 'The verified identity has no email address.',
      });
    }
    if (req.body.email && normalizeEmailForOtp(req.body.email) !== email) {
      return res.status(401).json({
        success: false,
        message: 'Identity token does not match the requested account.',
      });
    }

    // Resolve the UID first and require its stored email to match. This prevents
    // poisoned or stale UID links from crossing account boundaries.
    let user = await User.findOne({ firebaseUid: providerId });
    if (user && normalizeEmailForOtp(user.email) !== email) {
      return res.status(409).json({
        success: false,
        message: 'This identity is linked to a different account.',
      });
    }
    if (!user) user = await User.findOne({ email });

    if (user && user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deleted. Please contact an administrator.',
        code: 'USER_DELETED',
      });
    }

    // Block archived/deactivated accounts — even for Firebase/social logins
    if (user && !user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    if (user?.lockUntil && user.lockUntil > new Date()) {
      return res.status(423).json({
        success: false,
        message: 'This account is temporarily locked. Please try again later.',
        code: 'ACCOUNT_LOCKED',
      });
    }

    if (user?.firebaseUid && user.firebaseUid !== providerId) {
      return res.status(409).json({
        success: false,
        message: 'This identity is not linked to the requested account.',
      });
    }

    // Firebase proves identity but does not satisfy the mandated staff flow of
    // administrator-issued password plus a fresh login OTP. Never mint a staff
    // session (or activate a pending staff account) through social login.
    if (user && requiresStaffTwoFactor(user.role)) {
      return res.status(403).json({
        success: false,
        code: user.isVerified ? 'STAFF_PASSWORD_LOGIN_REQUIRED' : 'ACCOUNT_PENDING_VERIFICATION',
        message: user.isVerified
          ? 'Staff accounts must sign in with email, password, and a login code.'
          : 'Verify your staff account email before signing in.',
      });
    }

    if (!user) {
      if (!verifiedIdentity.email_verified) {
        return res.status(403).json({
          success: false,
          message: 'Verify your email before creating an account.',
          code: 'EMAIL_NOT_VERIFIED',
        });
      }

      // A verified Firebase identity can only auto-create the least-privileged role.
      const randomPassword = crypto.randomBytes(16).toString('hex');
      user = await User.create({
        name: verifiedIdentity.name || name || email.split('@')[0],
        email,
        password: randomPassword,
        role: 'customer',
        isVerified: true,
        isActive: true,
        firebaseUid: providerId,
        avatar: verifiedIdentity.picture || undefined,
      });
      console.log(`[socialLogin] Auto-created new user for ${email}`);

    } else {
      if (!user.isVerified && !verifiedIdentity.email_verified) {
        return res.status(403).json({
          success: false,
          message: 'Verify your email before signing in.',
          code: 'EMAIL_NOT_VERIFIED',
        });
      }
      if (verifiedIdentity.email_verified) user.isVerified = true;
      if (!user.firebaseUid) user.firebaseUid = providerId;
      if (verifiedIdentity.picture) user.avatar = verifiedIdentity.picture;
      await user.save();
    }

    scheduleLastSeen(user, req);

    // Generate token
    const token = jwt.sign(
      buildAuthTokenClaims(user),
      config.jwtSecret,
      { expiresIn: '7d' }
    );

     const userObject = user.toObject({ virtuals: true });
     delete userObject.password;
     // Keep _id so mobile clients can identify the MongoDB user ID.
     // The Mongoose virtual 'id' (string) is also present via virtuals: true.
     delete userObject.__v;
     attachPhoneForClient(user, userObject);
     attachProfileImageForClient(user, userObject);

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
      if (!firebaseAdmin) {
        console.error('[DELETE_ACCOUNT] Firebase Admin SDK is not initialized. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env');
        return res.status(503).json({
          success: false,
          message: 'Account deletion is temporarily unavailable. Please contact support.',
        });
      }
      try {
        await firebaseAdmin.auth().deleteUser(firebaseUid);
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
      const [Customer, Vehicle, AIServiceRequest, ActivityLog, ChatSession, ChatMessage, Notification] =
        await Promise.all([
          import('../models/customer.model.js').then((m) => m.default),
          import('../models/vehicle.model.js').then((m) => m.default),
          import('../models/aIServiceRequest.model.js').then((m) => m.default),
          import('../models/activityLog.model.js').then((m) => m.default),
          import('../models/chatSession.model.js').then((m) => m.default),
          import('../models/chatMessage.model.js').then((m) => m.default),
          import('../models/notification.model.js').then((m) => m.default),
        ]);

      const { deleteOrdersAndReleaseSlotCounters } = await import('../services/slot.service.js');

      // Run all deletions in parallel
      const deletionResults = await Promise.allSettled([
        deleteOrdersAndReleaseSlotCounters({ customer: mongoId }),
        Customer.deleteMany({ user: mongoId }),
        Vehicle.deleteMany({ user: mongoId }),
        AIServiceRequest.deleteMany({ customer: mongoId }),
        ActivityLog.deleteMany({ userId: mongoId }),
        ChatSession.deleteMany({ userId: mongoId }),
        ChatMessage.deleteMany({ userId: mongoId }),
        Notification.deleteMany({ userId: mongoId }),
        OTP.deleteMany({ email: user.email }),
        StaffVerificationToken.deleteMany({ userId: mongoId }),
      ]);

      // Log any partial failures (non-fatal for the user experience)
      deletionResults.forEach((result, i) => {
        const labels = ['Order', 'Customer', 'Vehicle', 'AIServiceRequest', 'ActivityLog', 'ChatSession', 'ChatMessage', 'Notification', 'OTP', 'StaffVerificationToken'];
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
 * Body: { userId: string, challengeToken: string, otp: string }
 * - Validates bcrypt hash, checks expiry, enforces 3-attempt limit.
 * - On success: clears OTP record, returns JWT + user object.
 * - After 3 failures: sets lockUntil = +15 min on the OTP record (429).
 */
export const verifyLoginOtp = async (req, res) => {
  const OTP_LOCK_MS = 15 * 60 * 1000;
  try {
    const { userId, challengeToken } = req.body;
    const otp = normalizeOtpInput(req.body.otp);

    if (!userId || !challengeToken || !otp) {
      return res.status(400).json({
        success: false,
        message: 'userId, challengeToken, and otp are required.',
      });
    }

    // Both records are required and independent. Fetching them concurrently
    // removes one full Atlas round trip from every OTP verification.
    const [otpRecord, user] = await Promise.all([
      timeOperation(
        { req, res, kind: 'db', name: 'verifyLoginOtp.otp.findLatest' },
        () => OTP.findOne({ userId, purpose: LOGIN_OTP_PURPOSE })
          .select('+loginChallengeHash')
          .sort({ createdAt: -1, _id: -1 })
      ),
      timeOperation(
        { req, res, kind: 'db', name: 'verifyLoginOtp.user.findById' },
        () => User.findById(userId)
      ),
    ]);
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Login challenge not found. Sign in again.' });
    }
    if (!loginChallengeMatches(otpRecord, challengeToken)) {
      return res.status(401).json({ success: false, message: 'Invalid login challenge. Sign in again.' });
    }
    logOtpDebug('login_verify.loaded', {
      userId,
      receivedOtp: formatOtpForLog(otp),
      record: otpRecordLogMeta(otpRecord),
    });

    if (
      !user
      || user.isDeleted
      || !user.isActive
      || !user.isVerified
      || !requiresStaffTwoFactor(user.role)
      || normalizeEmailForOtp(user.email) !== normalizeEmailForOtp(otpRecord.email)
    ) {
      await OTP.deleteOne({ _id: otpRecord._id });
      return res.status(403).json({ success: false, message: 'Account not accessible.' });
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(423).json({ success: false, message: 'Your account is temporarily locked.' });
    }

    // Check the OTP attempt lock. Exhaustion also locks the live account so a
    // new password login cannot immediately reset the second-factor limit.
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      const lockExpiry = user.lockUntil || new Date(otpRecord.updatedAt.getTime() + OTP_LOCK_MS);
      if (lockExpiry > new Date()) {
        const remainingMs = lockExpiry.getTime() - Date.now();
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. Please wait ${remainingMinutes} minute(s).`,
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
    const isValid = await timeOperation(
      { req, res, kind: 'cpu', name: 'verifyLoginOtp.otp.bcryptCompare' },
      () => compareOtpRecord(otpRecord, otp)
    );
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
      const updatedRecord = await OTP.findOneAndUpdate(
        { _id: otpRecord._id, attempts: { $lt: otpRecord.maxAttempts } },
        { $inc: { attempts: 1 } },
        { new: true },
      );
      const currentAttempts = Number(updatedRecord?.attempts ?? otpRecord.attempts + 1);
      const remaining = Math.max(0, otpRecord.maxAttempts - currentAttempts);
      if (remaining <= 0) {
        user.lockUntil = new Date(Date.now() + OTP_LOCK_MS);
        await user.save({ validateBeforeSave: false });
        logActivity({
          userId: user._id,
          userName: user.name || user.email,
          userRole: user.role,
          type: 'failed_login_otp',
          module: 'Auth',
          action: 'Login OTP Locked',
          description: `${user.name || user.email} exhausted login OTP attempts.`,
          status: 'warning',
        });

        await notifyAuthSecurityEvent({
          event: 'account_locked',
          title: 'Staff account locked during 2FA',
          message: `${user.name || user.email} exhausted the allowed login OTP attempts.`,
          severity: 'critical',
          targetUser: user,
          actionRequired: true,
          groupingWindowMs: 60 * 60 * 1000,
          metadata: { factor: 'email_otp', lockUntil: user.lockUntil },
        });
        return res.status(429).json({
          success: false,
          message: 'Too many failed attempts. Please wait 15 minutes.',
          data: { locked: true, remainingMinutes: 15 },
        });
      }
      logActivity({
        userId: user._id,
        userName: user.name || user.email,
        userRole: user.role,
        type: 'failed_login_otp',
        module: 'Auth',
        action: 'Invalid Login OTP',
        description: `Invalid login OTP submitted for ${user.name || user.email}.`,
        status: 'warning',
        metadata: { remainingAttempts: remaining },
      });
      return res.status(401).json({
        success: false,
        message: `Invalid code. ${remaining} attempt(s) remaining.`,
        data: { remainingAttempts: remaining },
      });
    }

    // Atomically consume the OTP. A concurrent replay cannot also receive a JWT.
    const consumed = await timeOperation(
      { req, res, kind: 'db', name: 'verifyLoginOtp.otp.consume' },
      () => OTP.findOneAndDelete({
        _id: otpRecord._id,
        purpose: LOGIN_OTP_PURPOSE,
        expiresAt: { $gt: new Date() },
        attempts: { $lt: otpRecord.maxAttempts },
      })
    );
    if (!consumed) {
      return res.status(409).json({ success: false, message: 'This login code has already been used.' });
    }

    const token = jwt.sign(
      buildAuthTokenClaims(user, {
        authLevel: STAFF_2FA_AUTH_LEVEL,
      }),
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    scheduleLastSeen(user, req);

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject._id;
    delete userObject.__v;
    attachPhoneForClient(user, userObject);
    attachProfileImageForClient(user, userObject);

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
 * Body: { userId: string, challengeToken: string }
 * - Enforces a 60-second resend cooldown.
 * - Regenerates OTP, re-hashes, resends email.
 */
export const resendLoginOtp = async (req, res) => {
  const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
  try {
    const { userId, challengeToken } = req.body;

    if (!userId || !challengeToken) {
      return res.status(400).json({ success: false, message: 'userId and challengeToken are required.' });
    }

    const existing = await OTP.findOne({ userId, purpose: LOGIN_OTP_PURPOSE })
      .select('+loginChallengeHash')
      .sort({ createdAt: -1, _id: -1 });
    if (!existing || !loginChallengeMatches(existing, challengeToken)) {
      return res.status(401).json({ success: false, message: 'Invalid login challenge. Sign in again.' });
    }
    if (existing.expiresAt < new Date()) {
      await OTP.deleteOne({ _id: existing._id });
      return res.status(400).json({ success: false, message: 'Login challenge expired. Sign in again.' });
    }

    const user = await User.findById(userId);
    if (
      !user
      || user.isDeleted
      || !user.isActive
      || !user.isVerified
      || !requiresStaffTwoFactor(user.role)
      || normalizeEmailForOtp(user.email) !== normalizeEmailForOtp(existing.email)
    ) {
      await OTP.deleteOne({ _id: existing._id });
      return res.status(403).json({ success: false, message: 'Account not accessible.' });
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(423).json({ success: false, message: 'Your account is temporarily locked.' });
    }
    if (existing.attempts >= existing.maxAttempts) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed attempts. Sign in again after the account lock expires.',
      });
    }

    if (existing.lastSentAt) {
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

    // Replace only the authenticated challenge with a fresh single-use code.
    await OTP.deleteOne({ _id: existing._id });
    const otpRecord = new OTP({
      email: user.email,
      otp,
      otpHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: existing.attempts,
      maxAttempts: 3,
      verified: false,
      purpose: LOGIN_OTP_PURPOSE,
      userId: user._id,
      lastSentAt: new Date(),
      loginChallengeHash: existing.loginChallengeHash,
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
    const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
    const normalizedEmail = normalizeEmailForOtp(email);

    if (!normalizedName || !normalizedEmail || !role || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, role, and password are required.' });
    }

    if (normalizedName.length < 2 || normalizedName.length > 80) {
      return res.status(400).json({ success: false, message: 'Name must be between 2 and 80 characters.' });
    }
    if (typeof req.body.confirmPassword !== 'undefined' && req.body.confirmPassword !== password) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    if (!STAFF_ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Allowed staff roles: ${STAFF_ASSIGNABLE_ROLES.join(', ')}` });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
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

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const phoneParsed = parseOptionalProfilePhone(phone);
    if (!phoneParsed.ok) {
      return res.status(400).json({
        success: false,
        message: phoneParsed.message || 'Invalid phone number.',
      });
    }

    const user = new User({
      name: normalizedName,
      email: normalizedEmail,
      password, // hashed by pre-save hook
      role,
      phone: phoneParsed.phone || undefined,
      isVerified: false,
      isActive: true,
      status: 'pending',
      isFirstLogin: false,
    });
    await user.save();

    let verification;
    try {
      const delivery = await issueStaffVerificationLink(user);
      verification = { required: true, emailSent: true, ...delivery };
    } catch (emailError) {
      verification = { required: true, emailSent: false };
      console.error('[createStaff] Staff verification email failed:', emailError?.message || emailError);
    }

    logActivity({
      userId: req.user?.id, userName: req.user?.name || req.user?.email, userRole: req.user?.role,
      type: 'user_created', module: 'Auth', action: 'Create Staff Account',
      description: `Staff account created for ${normalizedName} (${role}) by ${req.user?.email}.`, status: 'success',
      metadata: { targetUserId: user._id, verificationEmailSent: verification.emailSent },
    });

    await notifyAuthSecurityEvent({
      event: 'staff_account_created',
      title: 'New staff account added',
      message: `${req.user?.name || req.user?.email || 'An administrator'} added ${normalizedName} as ${role}.`,
      severity: 'info',
      targetUser: user,
      actionRequired: !user.isVerified,
      groupingWindowMs: 30 * 24 * 60 * 60 * 1000,
      metadata: {
        actorUserId: req.user?.id || req.user?._id,
        actorName: req.user?.name || req.user?.email,
        verificationEmailSent: verification.emailSent,
      },
    });

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject.__v;
    attachPhoneForClient(user, userObject);
    attachProfileImageForClient(user, userObject);

    res.status(201).json({
      success: true,
      message: verification.emailSent
        ? 'User created. A verification email was sent to the user.'
        : 'User created, but the verification email could not be sent. Please resend it.',
      data: { user: userObject, verification, twoFactorRequired: true },
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

    if (req.user?.requiresPasswordChange !== true) {
      return res.status(403).json({
        success: false,
        message: 'This password-setup session is not valid. Use Change Password instead.',
      });
    }

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
    if (!user.isFirstLogin) {
      return res.status(403).json({ success: false, message: 'Password setup has already been completed.' });
    }

    user.password = newPassword; // hashed by pre-save hook
    user.isFirstLogin = false;
    user.isVerified = true;
    user.status = 'active';
    await user.save();

    // Issue a fresh full-access JWT
    const token = jwt.sign(
      buildAuthTokenClaims(user),
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    const userObject = user.toObject({ virtuals: true });
    delete userObject.password;
    delete userObject._id;
    delete userObject.__v;
    attachPhoneForClient(user, userObject);
    attachProfileImageForClient(user, userObject);

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

    const user = await User.findById(userId);
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

    if (requiresStaffTwoFactor(user.role)) {
      await notifyAuthSecurityEvent({
        event: 'staff_password_changed',
        title: 'Staff password changed',
        message: `${user.name || user.email} changed their staff account password.`,
        severity: 'info',
        targetUser: user,
        actionRequired: false,
      });
    }

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
    if (user.isDeleted) return res.status(404).json({ success: false, message: 'No account found with this email.' });
    if (!user.isActive || user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'This account is disabled. Please contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      });
    }
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Account is already verified.' });

    if (requiresStaffTwoFactor(user.role)) {
      return res.status(400).json({
        success: false,
        code: 'STAFF_VERIFICATION_LINK_REQUIRED',
        message: 'Staff verification links can only be resent by an authorized administrator.',
      });
    }

    const existingOtp = await findLatestEmailOtp(email, {
      verified: false,
      expiresAt: { $gt: new Date() },
    });
    if (existingOtp?.lastSentAt) {
      const elapsed = Date.now() - existingOtp.lastSentAt.getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({
          success: false,
          message: `Please wait ${retryAfterSeconds} second(s) before requesting a new code.`,
          data: { retryAfterSeconds },
        });
      }
    }

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
      ...(requiresStaffTwoFactor(user.role) ? { userId: user._id } : {}),
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

    if (requiresStaffTwoFactor(user.role)) {
      return res.status(403).json({
        success: false,
        code: 'STAFF_PASSWORD_LOGIN_REQUIRED',
        message: 'Firebase recovery is only available to customer accounts. Staff must use password and login OTP.',
      });
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

    if (!firebaseAdmin) {
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
        buildAuthTokenClaims(user),
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
      const existingFbUser = await withAdminTimeout(firebaseAdmin.auth().getUserByEmail(email));
      firebaseUid = existingFbUser.uid;
      console.log(`[recoverFirebase] Firebase account already exists for ${email} (uid: ${firebaseUid})`);
    } catch (fbErr) {
      if (fbErr.code === 'auth/user-not-found') {
        // Create a new Firebase Auth account with the same password
        try {
          const newFbUser = await withAdminTimeout(firebaseAdmin.auth().createUser({
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
            const token = jwt.sign(buildAuthTokenClaims(user), config.jwtSecret, { expiresIn: '7d' });
            return res.json({ success: true, needsClientCreate: true, message: 'MongoDB credentials valid. Please create Firebase account on device.', data: { token, needsClientCreate: true, userName: user.name } });
          }
          throw createErr;
        }
      } else if (fbErr.code === 'admin/timeout') {
        // Admin SDK hung on getUserByEmail — fall back to client-side creation
        console.warn(`[recoverFirebase] Admin SDK getUserByEmail timed out for ${email} — instructing client-side create`);
        if (!user.isVerified) { user.isVerified = true; await user.save(); }
        const token = jwt.sign(buildAuthTokenClaims(user), config.jwtSecret, { expiresIn: '7d' });
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
      buildAuthTokenClaims(user),
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
