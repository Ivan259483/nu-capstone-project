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
      enum: ['card', 'gcash', 'maya', 'cash', 'other', 'split'],
      default: 'card',
    },
    splitPayments: {
      type: [
        {
          method: String,
          amount: Number,
        }
      ],
      default: []
    },
    provider: { type: String, default: 'stripe' },
    providerReference: String,
    metadata: mongoose.Schema.Types.Mixed,

    // POS-specific fields
    staffAssigned: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    discount: {
      type: {
        discountType: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
        value: { type: Number, default: 0 },
        reason: { type: String, default: '' },
      },
      default: null,
    },
    cashReceived: { type: Number, default: null },
    changeGiven: { type: Number, default: null },
    items: {
      type: [
        {
          name: String,
          price: Number,
          quantity: { type: Number, default: 1 },
          isAddon: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    subtotal: { type: Number, default: null },
    discountAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

paymentSchema.index({ createdAt: -1 });

export default mongoose.model('Payment', paymentSchema);
