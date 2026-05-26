import mongoose from 'mongoose';

const accountSetupTokenSchema = new mongoose.Schema(
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
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['password_setup'],
      default: 'password_setup',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastSentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

accountSetupTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
accountSetupTokenSchema.index({ userId: 1, purpose: 1, usedAt: 1, expiresAt: 1 });

export default mongoose.model('AccountSetupToken', accountSetupTokenSchema);
