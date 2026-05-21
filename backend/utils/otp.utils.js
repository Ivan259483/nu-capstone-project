import crypto from 'crypto';

const OTP_LOG_SECRET =
  process.env.OTP_LOG_SALT ||
  process.env.JWT_SECRET ||
  process.env.ENCRYPTION_KEY ||
  'autospf-otp-log-fallback';

export const EMAIL_OTP_PURPOSE = 'signup';
export const LOGIN_OTP_PURPOSE = 'login';

export const normalizeEmailForOtp = (email) =>
  String(email || '').trim().toLowerCase();

export const normalizeOtpInput = (value) =>
  String(value ?? '').normalize('NFKC').replace(/\D/g, '');

export const maskEmail = (email) => {
  const normalized = normalizeEmailForOtp(email);
  const [local = '', domain = ''] = normalized.split('@');
  if (!local || !domain) return normalized ? '[invalid-email]' : '[missing-email]';
  const first = local[0] || '*';
  const last = local.length > 2 ? local[local.length - 1] : '';
  return `${first}${'*'.repeat(Math.max(local.length - 2, 1))}${last}@${domain}`;
};

export const otpFingerprint = (otp) => {
  const normalized = normalizeOtpInput(otp);
  if (!normalized) return 'empty';
  return crypto
    .createHmac('sha256', OTP_LOG_SECRET)
    .update(normalized)
    .digest('hex')
    .slice(0, 12);
};

export const formatOtpForLog = (otp) => {
  const normalized = normalizeOtpInput(otp);
  if (process.env.NODE_ENV === 'development' || process.env.LOG_OTP_CODES === 'true') {
    return normalized || '[empty]';
  }
  return `len=${normalized.length}, fp=${otpFingerprint(normalized)}`;
};

export const timingSafeOtpEqual = (a, b) => {
  const left = Buffer.from(normalizeOtpInput(a));
  const right = Buffer.from(normalizeOtpInput(b));
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
};

export const otpRecordLogMeta = (record) => {
  if (!record) return null;
  const now = Date.now();
  const expiresAt = record.expiresAt instanceof Date ? record.expiresAt : new Date(record.expiresAt);
  return {
    id: record._id?.toString?.() || String(record._id || ''),
    email: maskEmail(record.email),
    purpose: record.purpose || EMAIL_OTP_PURPOSE,
    verified: Boolean(record.verified),
    attempts: record.attempts,
    maxAttempts: record.maxAttempts,
    expiresAt: expiresAt.toISOString(),
    secondsRemaining: Math.max(0, Math.ceil((expiresAt.getTime() - now) / 1000)),
    storedOtp: formatOtpForLog(record.otp),
    hasHash: Boolean(record.otpHash),
    createdAt: record.createdAt?.toISOString?.(),
    updatedAt: record.updatedAt?.toISOString?.(),
  };
};
