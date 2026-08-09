import mongoose from 'mongoose';

const systemBootstrapOperationSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    operation: {
      type: String,
      required: true,
      enum: ['administrator_provision', 'administrator_email_migration'],
      immutable: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['in_progress', 'completed', 'failed', 'skipped_existing'],
      default: 'in_progress',
      index: true,
    },
    attemptId: {
      type: String,
      required: true,
    },
    phase: {
      type: String,
      required: true,
      enum: [
        'claimed',
        'account_ready',
        'migration_prepared',
        'identity_updated',
        'verification_delivered',
        'rolled_back',
      ],
      default: 'claimed',
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    sourceEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    targetEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    rollbackSnapshot: {
      email: {
        type: String,
        lowercase: true,
        trim: true,
        default: null,
      },
      isVerified: {
        type: Boolean,
        default: null,
      },
      status: {
        type: String,
        enum: ['active', 'suspended', 'pending', null],
        default: null,
      },
      inspectedUpdatedAt: {
        type: Date,
        default: null,
      },
      inspectedVersion: {
        type: Number,
        default: null,
      },
      inspectedAuthVersion: {
        type: Number,
        default: null,
      },
    },
    lastErrorCode: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model('SystemBootstrapOperation', systemBootstrapOperationSchema);
