import mongoose from 'mongoose';

/**
 * Cross-process lease for issuing one account-bound verification link.
 * Token history remains in StaffVerificationToken; this record only serializes
 * replacement/delivery so concurrent workers cannot leave multiple active links.
 */
const staffVerificationIssuanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    purpose: {
      type: String,
      enum: ['staff_email_verification'],
      required: true,
    },
    leaseOwner: {
      type: String,
      default: null,
      select: false,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    generation: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    currentTokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StaffVerificationToken',
      default: null,
    },
    currentTokenDeliveredAt: {
      type: Date,
      default: null,
    },
    lastCompletedAt: {
      type: Date,
      default: null,
    },
    lastErrorCode: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

staffVerificationIssuanceSchema.index(
  { userId: 1, purpose: 1 },
  { unique: true, name: 'one_staff_verification_issuance_lease_per_account' },
);

export default mongoose.model('StaffVerificationIssuance', staffVerificationIssuanceSchema);
