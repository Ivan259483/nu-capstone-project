import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, required: true, unique: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'PHP' },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed', 'refunded'],
      default: 'pending',
    },
    method: {
      type: String,
      enum: ['card', 'gcash', 'maya', 'cash', 'other'],
      default: 'card',
    },
    provider: { type: String, default: 'stripe' },
    providerReference: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

paymentSchema.index({ createdAt: -1 });

export default mongoose.model('Payment', paymentSchema);
