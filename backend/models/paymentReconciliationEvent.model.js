import mongoose from 'mongoose';

const paymentReconciliationEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, trim: true, index: true, immutable: true },
    eventId: { type: String, required: true, trim: true, immutable: true },
    eventType: { type: String, required: true, trim: true, immutable: true },
    signatureVerified: { type: Boolean, required: true, immutable: true },
    payloadHash: { type: String, required: true, immutable: true },
    // Minimal immutable facts needed for a human reconciliation decision.
    // Raw provider payloads, signatures, headers, customer PII, and secrets are
    // deliberately never persisted.
    providerSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null, index: true, immutable: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null, index: true, immutable: true },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'applied', 'dismissed'],
      default: 'pending',
      index: true,
    },
    receivedAt: { type: Date, default: Date.now, required: true, immutable: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: null, maxlength: 2000 },
  },
  { timestamps: true },
);

paymentReconciliationEventSchema.index(
  { provider: 1, eventId: 1 },
  { unique: true, name: 'one_reconciliation_record_per_provider_event' },
);

export default mongoose.model('PaymentReconciliationEvent', paymentReconciliationEventSchema);
