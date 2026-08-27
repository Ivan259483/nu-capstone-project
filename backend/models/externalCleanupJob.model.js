import mongoose from 'mongoose';

const externalCleanupJobSchema = new mongoose.Schema(
  {
    operationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SystemOperation', required: true, index: true },
    provider: { type: String, enum: ['cloudinary', 'firebase_auth', 'firestore'], required: true },
    action: {
      type: String,
      enum: ['delete_asset', 'delete_identity', 'delete_document', 'revoke_sessions'],
      required: true,
    },
    target: { type: mongoose.Schema.Types.Mixed, required: true },
    targetHash: { type: String, required: true },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], default: 'pending', index: true },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastError: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true },
);

externalCleanupJobSchema.index(
  { operationId: 1, provider: 1, action: 1, targetHash: 1 },
  { unique: true, name: 'one_external_cleanup_target_per_operation' },
);
externalCleanupJobSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

export default mongoose.model('ExternalCleanupJob', externalCleanupJobSchema);
