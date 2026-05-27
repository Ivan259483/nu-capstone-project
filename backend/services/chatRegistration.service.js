import crypto from 'crypto';
import AccountSetupToken from '../models/accountSetupToken.model.js';
import User from '../models/user.model.js';
import { config } from '../config/environment.js';
import { sendPasswordSetupEmail } from '../utils/mail.utils.js';
import { normalizeEmailForOtp } from '../utils/otp.utils.js';
import { parseRegisterPhone } from '../utils/phone.utils.js';
import { logActivity } from '../utils/logActivity.utils.js';

export const PASSWORD_SETUP_PURPOSE = 'password_setup';
export const PASSWORD_SETUP_RESEND_COOLDOWN_MS = 60 * 1000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

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

export const hashSetupToken = (token) =>
  crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');

const buildSetupUrl = (rawToken) =>
  `${getPublicAppUrl()}/set-password?token=${encodeURIComponent(rawToken)}`;

export const normalizeNamePart = (value = '') =>
  String(value || '').trim().replace(/\s+/g, ' ');

export const validateNamePart = (value = '', label = 'name') => {
  const normalized = normalizeNamePart(value);
  if (!normalized || normalized.length > 40 || !NAME_PART_REGEX.test(normalized)) {
    return { ok: false, message: `Please enter a valid ${label}.` };
  }
  return { ok: true, value: normalized };
};

export const normalizeChatRegistrationEmail = (value = '') => normalizeEmailForOtp(value);

export const validateChatRegistrationEmail = (value = '') => {
  const email = normalizeChatRegistrationEmail(value);
  if (!email || !EMAIL_REGEX.test(email)) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }
  return { ok: true, value: email };
};

export const validateChatRegistrationPhone = (value = '') => {
  const parsed = parseRegisterPhone(value);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message || 'Invalid phone number.' };
  }
  return { ok: true, value: parsed.phone };
};

export const parseChatRegistrationBody = (body = {}) => {
  const firstNameResult = validateNamePart(body.firstName, 'first name');
  if (!firstNameResult.ok) {
    return { ok: false, status: 400, message: firstNameResult.message };
  }

  const lastNameResult = validateNamePart(body.lastName, 'last name');
  if (!lastNameResult.ok) {
    return { ok: false, status: 400, message: lastNameResult.message };
  }

  const emailResult = validateChatRegistrationEmail(body.email);
  if (!emailResult.ok) {
    return { ok: false, status: 400, message: emailResult.message };
  }

  const fullName = [firstNameResult.value, lastNameResult.value].filter(Boolean).join(' ');
  if (fullName.length < 2 || fullName.length > 80) {
    return { ok: false, status: 400, message: 'Name must be between 2 and 80 characters.' };
  }

  const phoneResult = validateChatRegistrationPhone(body.phone);
  if (!phoneResult.ok) {
    return {
      ok: false,
      status: 400,
      message: phoneResult.message || 'Please enter a valid mobile number.',
    };
  }

  return {
    ok: true,
    firstName: firstNameResult.value,
    lastName: lastNameResult.value,
    fullName,
    email: emailResult.value,
    phone: phoneResult.value,
  };
};

export const issuePasswordSetupEmail = async (user) => {
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

export const startChatRegistrationForCustomer = async (body = {}) => {
  const parsed = parseChatRegistrationBody(body);
  if (!parsed.ok) return parsed;

  const { firstName, lastName, fullName, email, phone } = parsed;
  let user = await User.findOne({ email });
  let created = false;

  if (user) {
    if (user.isDeleted) {
      return { ok: false, status: 403, message: 'This account has been deleted by an administrator.' };
    }
    if (!user.isActive) {
      return {
        ok: false,
        status: 403,
        message: 'Your account has been deactivated. Please contact an administrator.',
        code: 'ACCOUNT_INACTIVE',
      };
    }
    if (user.role !== 'customer') {
      return {
        ok: false,
        status: 409,
        message: 'This email is linked to a staff account. Please sign in or contact support.',
      };
    }
    if (user.isVerified) {
      return {
        ok: false,
        status: 409,
        message: 'An active account with this email already exists. Please sign in.',
      };
    }

    user.name = fullName;
    if (phone) {
      user.phone = phone;
    }
    user.status = 'pending';
    user.isVerified = false;
    user.isActive = true;
    await user.save();
  } else {
    user = new User({
      name: fullName,
      email,
      ...(phone ? { phone } : {}),
      role: 'customer',
      isVerified: false,
      isActive: true,
      status: 'pending',
    });
    await user.save();
    created = true;
  }

  const tokenRecord = await issuePasswordSetupEmail(user);

  logActivity({
    userId: user._id,
    userName: user.name || email,
    userRole: user.role,
    type: 'chat_registration_started',
    module: 'Auth',
    action: 'Chat Registration Started',
    description: `Password setup email sent to ${user.name || email}.`,
    status: 'success',
  });

  return {
    ok: true,
    status: created ? 201 : 200,
    message: 'Verification email sent',
    data: {
      email,
      firstName,
      lastName,
      expiresAt: tokenRecord.expiresAt,
      expiresIn: config.passwordSetupTokenExpiry,
    },
  };
};
