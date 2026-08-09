import crypto from 'crypto';
import { config } from '../config/environment.js';
import { STAFF_2FA_ROLES, requiresStaffTwoFactor } from '../constants/roles.js';
import OTP from '../models/oTP.model.js';
import StaffVerificationIssuance from '../models/staffVerificationIssuance.model.js';
import StaffVerificationToken from '../models/staffVerificationToken.model.js';
import User from '../models/user.model.js';
import { sendStaffVerificationEmail } from '../utils/mail.utils.js';
import { EMAIL_OTP_PURPOSE, normalizeEmailForOtp } from '../utils/otp.utils.js';

export const STAFF_VERIFICATION_TOKEN_PURPOSE = 'staff_email_verification';
export const STAFF_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const STAFF_VERIFICATION_ISSUANCE_LEASE_MS = 5 * 60 * 1000;

const generateVerificationToken = () => crypto.randomBytes(32).toString('base64url');

export const hashStaffVerificationToken = (token) =>
  crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');

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

const buildVerificationUrl = (rawToken) =>
  `${getPublicAppUrl()}/verify-account?token=${encodeURIComponent(rawToken)}`;

const serviceError = (message, code, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const acquireIssuanceLease = async (userId) => {
  await StaffVerificationIssuance.init();
  const leaseOwner = crypto.randomUUID();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + STAFF_VERIFICATION_ISSUANCE_LEASE_MS);

  try {
    const lease = await StaffVerificationIssuance.findOneAndUpdate(
      {
        userId,
        purpose: STAFF_VERIFICATION_TOKEN_PURPOSE,
        $or: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { $exists: false } },
          { leaseExpiresAt: { $lte: now } },
        ],
      },
      {
        $setOnInsert: {
          userId,
          purpose: STAFF_VERIFICATION_TOKEN_PURPOSE,
        },
        $set: {
          leaseOwner,
          leaseExpiresAt,
          lastErrorCode: null,
        },
        $inc: { generation: 1 },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).select('+leaseOwner');

    if (lease?.leaseOwner === leaseOwner) return lease;
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const current = await StaffVerificationIssuance.findOne({
    userId,
    purpose: STAFF_VERIFICATION_TOKEN_PURPOSE,
  });
  const error = serviceError(
    'A verification email is already being issued for this account.',
    'VERIFICATION_ISSUANCE_IN_PROGRESS',
    409,
  );
  if (current?.leaseExpiresAt) {
    error.retryAfterSeconds = Math.max(
      1,
      Math.ceil((current.leaseExpiresAt.getTime() - Date.now()) / 1000),
    );
  }
  throw error;
};

const releaseIssuanceLease = async (
  lease,
  { currentTokenId, delivered = false, errorCode = null } = {},
) => {
  const releasedAt = new Date();
  const update = {
    $set: {
      leaseExpiresAt: null,
      lastCompletedAt: releasedAt,
      lastErrorCode: errorCode,
    },
    $unset: { leaseOwner: 1 },
  };
  if (currentTokenId !== undefined) {
    update.$set.currentTokenId = currentTokenId;
    if (
      !delivered
      && String(currentTokenId || '') !== String(lease.currentTokenId || '')
    ) {
      update.$set.currentTokenDeliveredAt = null;
    }
  }
  if (delivered) {
    update.$set.currentTokenDeliveredAt = releasedAt;
  }

  const released = await StaffVerificationIssuance.updateOne(
    { _id: lease._id, leaseOwner: lease.leaseOwner },
    update,
  );
  if (released.matchedCount !== 1) {
    throw serviceError(
      'Verification issuance lease was lost before delivery completed.',
      'VERIFICATION_ISSUANCE_LEASE_LOST',
      409,
    );
  }
};

/**
 * Sends an opaque, expiring staff-account verification link. Only a SHA-256
 * hash is persisted; the raw token exists solely in the email link.
 */
export async function issueStaffVerificationLink(user, { enforceCooldown = false } = {}) {
  const email = normalizeEmailForOtp(user?.email);
  if (!user?._id || !email || !requiresStaffTwoFactor(user.role)) {
    throw serviceError('A valid pending staff account is required.', 'INVALID_STAFF_ACCOUNT', 400);
  }
  if (user.isDeleted || !user.isActive || user.status === 'suspended') {
    throw serviceError('This account is disabled and cannot receive verification email.', 'ACCOUNT_INACTIVE', 403);
  }
  if (user.isVerified) {
    throw serviceError('This account is already verified.', 'ACCOUNT_ALREADY_VERIFIED', 409);
  }

  const lease = await acquireIssuanceLease(user._id);
  let tokenRecord = null;
  let priorToken = null;
  let invalidatedAt = null;

  try {
    const currentUser = await User.findOne({
      _id: user._id,
      email,
      role: { $in: STAFF_2FA_ROLES },
      isVerified: false,
      isDeleted: { $ne: true },
      isActive: true,
      status: { $ne: 'suspended' },
    });
    if (!currentUser) {
      throw serviceError(
        'The staff account changed before verification delivery began.',
        'VERIFICATION_ACCOUNT_STATE_CHANGED',
        409,
      );
    }

    const now = new Date();
    const previousTokens = await StaffVerificationToken.find({
      userId: currentUser._id,
      purpose: STAFF_VERIFICATION_TOKEN_PURPOSE,
      usedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1, _id: -1 })
      .select('+tokenHash');
    priorToken = previousTokens[0] || null;

    if (enforceCooldown && priorToken?.lastSentAt) {
      const elapsed = Date.now() - priorToken.lastSentAt.getTime();
      if (elapsed < STAFF_VERIFICATION_RESEND_COOLDOWN_MS) {
        const cooldownError = serviceError(
          'Please wait before resending the verification email.',
          'VERIFICATION_RESEND_COOLDOWN',
          429,
        );
        cooldownError.retryAfterSeconds = Math.ceil(
          (STAFF_VERIFICATION_RESEND_COOLDOWN_MS - elapsed) / 1000,
        );
        throw cooldownError;
      }
    }

    invalidatedAt = new Date();
    const previousIds = previousTokens.map((record) => record._id);
    if (previousIds.length) {
      await StaffVerificationToken.updateMany(
        { _id: { $in: previousIds }, usedAt: null },
        { $set: { usedAt: invalidatedAt } },
      );
    }

    const rawToken = generateVerificationToken();
    const expiresAt = new Date(
      invalidatedAt.getTime() + config.staffVerificationTokenExpiry * 1000,
    );
    tokenRecord = await StaffVerificationToken.create({
      userId: currentUser._id,
      email,
      tokenHash: hashStaffVerificationToken(rawToken),
      purpose: STAFF_VERIFICATION_TOKEN_PURPOSE,
      expiresAt,
      usedAt: null,
      lastSentAt: invalidatedAt,
    });

    // Remove any legacy staff signup OTP so a deployed pending account cannot
    // be activated through the customer code endpoint.
    await OTP.deleteMany({
      purpose: EMAIL_OTP_PURPOSE,
      $or: [{ userId: currentUser._id }, { email }],
    });

    const emailResult = await sendStaffVerificationEmail(
      email,
      currentUser.name,
      buildVerificationUrl(rawToken),
      {
        tokenRecordId: tokenRecord._id,
        expiresInSeconds: config.staffVerificationTokenExpiry,
      },
    );

    if (!emailResult.success) {
      throw serviceError('Failed to send the verification email.', 'VERIFICATION_EMAIL_FAILED', 502);
    }

    await releaseIssuanceLease(lease, {
      currentTokenId: tokenRecord._id,
      delivered: true,
    });
    return {
      method: 'link',
      expiresIn: config.staffVerificationTokenExpiry,
      resendAfter: Math.ceil(STAFF_VERIFICATION_RESEND_COOLDOWN_MS / 1000),
    };
  } catch (error) {
    if (tokenRecord) {
      await StaffVerificationToken.deleteOne({ _id: tokenRecord._id });
    }
    if (priorToken && invalidatedAt && priorToken.expiresAt > new Date()) {
      await StaffVerificationToken.updateOne(
        {
          _id: priorToken._id,
          usedAt: invalidatedAt,
          expiresAt: { $gt: new Date() },
        },
        {
          $set: {
            email: priorToken.email,
            tokenHash: priorToken.tokenHash,
            expiresAt: priorToken.expiresAt,
            usedAt: null,
            lastSentAt: priorToken.lastSentAt,
          },
        },
      );
    }

    try {
      await releaseIssuanceLease(lease, {
        currentTokenId: priorToken?._id || null,
        errorCode: error?.code || 'VERIFICATION_ISSUANCE_FAILED',
      });
    } catch (releaseError) {
      releaseError.cause = error;
      throw releaseError;
    }
    throw error;
  }
}

/** Atomically consumes a staff verification link and activates its bound account. */
export async function consumeStaffVerificationToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token || token.length > 512) {
    throw serviceError('Verification token is required.', 'INVALID_VERIFICATION_TOKEN', 400);
  }

  const tokenRecord = await StaffVerificationToken.findOne({
    tokenHash: hashStaffVerificationToken(token),
    purpose: STAFF_VERIFICATION_TOKEN_PURPOSE,
  });
  if (!tokenRecord) {
    throw serviceError('This verification link is invalid.', 'INVALID_VERIFICATION_TOKEN', 400);
  }
  if (tokenRecord.usedAt) {
    throw serviceError('This verification link has already been used.', 'VERIFICATION_TOKEN_USED', 409);
  }
  if (tokenRecord.expiresAt <= new Date()) {
    throw serviceError('This verification link has expired. Ask an administrator to resend it.', 'VERIFICATION_TOKEN_EXPIRED', 410);
  }

  const user = await User.findById(tokenRecord.userId);
  const email = normalizeEmailForOtp(tokenRecord.email);
  if (
    !user
    || user.isDeleted
    || !requiresStaffTwoFactor(user.role)
    || normalizeEmailForOtp(user.email) !== email
  ) {
    throw serviceError('This verification link is not valid for this account.', 'VERIFICATION_ACCOUNT_MISMATCH', 400);
  }
  if (!user.isActive || user.status === 'suspended') {
    throw serviceError('This account is disabled. Contact an administrator.', 'ACCOUNT_INACTIVE', 403);
  }
  if (user.isVerified) {
    throw serviceError('This account is already verified. Please sign in.', 'ACCOUNT_ALREADY_VERIFIED', 409);
  }

  const now = new Date();
  const consumed = await StaffVerificationToken.findOneAndUpdate(
    {
      _id: tokenRecord._id,
      usedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { usedAt: now } },
    { new: true },
  );
  if (!consumed) {
    throw serviceError('This verification link has already been used or expired.', 'VERIFICATION_TOKEN_UNAVAILABLE', 409);
  }

  const activated = await User.findOneAndUpdate(
    {
      _id: user._id,
      email,
      role: { $in: STAFF_2FA_ROLES },
      isDeleted: { $ne: true },
      isActive: true,
      status: { $ne: 'suspended' },
      isVerified: false,
    },
    {
      $set: {
        isVerified: true,
        isActive: true,
        status: 'active',
      },
    },
    { new: true },
  );
  if (!activated) {
    throw serviceError('This verification link is not valid for the current account state.', 'VERIFICATION_ACCOUNT_MISMATCH', 409);
  }

  return activated;
}
