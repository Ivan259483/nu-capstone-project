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
    // 'signup'  — email verification on registration (existing behaviour)
    // 'login'   — 2FA challenge after successful password login
    purpose: {
      type: String,
      enum: ['signup', 'login'],
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
  },
  { timestamps: true }
);

// Automatically delete expired OTPs
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Fast lookup for login OTP challenge
otpSchema.index({ userId: 1, purpose: 1 });

export default mongoose.model('OTP', otpSchema);

