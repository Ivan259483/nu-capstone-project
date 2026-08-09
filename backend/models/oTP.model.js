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
      required: true,
    },
    // Bcrypt hash of the OTP — populated for login 2FA OTPs
    otpHash: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 10 * 60 * 1000),
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
    // 'login'          — staff 2FA challenge after successful password login
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
otpSchema.index({ userId: 1, purpose: 1 });

export default mongoose.model('OTP', otpSchema);
