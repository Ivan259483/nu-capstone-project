import mongoose from 'mongoose';

const staffVerificationTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      select: false,
    },
    purpose: {
      type: String,
      enum: ['staff_email_verification'],
      default: 'staff_email_verification',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastSentAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

staffVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
staffVerificationTokenSchema.index({ userId: 1, purpose: 1, createdAt: -1 });

export default mongoose.model('StaffVerificationToken', staffVerificationTokenSchema);
