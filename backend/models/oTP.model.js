import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
    },
    otp: {
      type: String,
      default: null,
    },
    // Bcrypt hash used for verification. Password-login OTPs never populate
    // the legacy plaintext `otp` field.
    otpHash: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 10 * 60 * 1000),
    },
    // For purpose='login', the code expires before the opaque challenge so an
    // expired code can still be safely replaced without asking for a password
    // again. Other OTP purposes continue to use expiresAt directly.
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    // 'signup'         — account email verification
    // 'password_reset' — password-reset challenge (never authenticates a session)
    // 'login'          — customer/staff challenge after successful password login
    purpose: {
      type: String,
      enum: ['signup', 'password_reset', 'login'],
      default: 'signup',
    },
    // Only set for purpose='login' OTPs — links to the User document
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      sparse: true,
    },
    // Timestamp of the last send — used for 60-second resend rate-limit
    lastSentAt: {
      type: Date,
      default: null,
    },
    // Per-account send window in addition to the IP-level auth limiter.
    sendCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    sendWindowStartedAt: {
      type: Date,
      default: null,
    },
    // SHA-256 hash of the opaque login challenge returned only after password validation.
    // Prevents /resend-login-otp or /verify-login-otp from becoming password bypasses.
    loginChallengeHash: {
      type: String,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

// Automatically delete expired OTPs
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Deterministic lookup for email verification/password-reset OTPs.
otpSchema.index({ email: 1, purpose: 1, createdAt: -1 });
// Fast lookup for login OTP challenge
otpSchema.index(
  { userId: 1, purpose: 1 },
  {
    unique: true,
    partialFilterExpression: { purpose: 'login', userId: { $type: 'objectId' } },
  },
);

export default mongoose.model('OTP', otpSchema);
