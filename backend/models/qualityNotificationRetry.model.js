import mongoose from 'mongoose';

const qualityNotificationRetrySchema = new mongoose.Schema(
  {
    // One pending recovery item per logical event/expected state. Repeated HTTP
    // retries update this row instead of growing an unbounded queue.
    retryKey: { type: String, required: true, unique: true, maxlength: 96 },
    kind: {
      type: String,
      required: true,
      enum: [
        'vehicle_arrived',
        'evidence_sync',
        'evidence_replacement',
        'stage_transition',
        'qc_failed',
        'ready_for_pickup',
        'job_assignment',
        'recipient_reconcile',
      ],
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    attempts: { type: Number, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date, default: null },
    lastError: { type: String, maxlength: 500, default: undefined },
    // Poisoned rows remain inspectable for a generous period without becoming
    // permanent operational debris.
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true },
);

qualityNotificationRetrySchema.index({ nextAttemptAt: 1, lockedAt: 1, createdAt: 1 });
qualityNotificationRetrySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('QualityNotificationRetry', qualityNotificationRetrySchema);
