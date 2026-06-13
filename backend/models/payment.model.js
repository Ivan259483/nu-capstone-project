import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, required: true, unique: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
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
          serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
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

    /** Extended billing breakdown (POS / billing checkout) */
    taxVatAmount: { type: Number, default: 0 },
    additionalFees: { type: Number, default: 0 },
    downpayment: { type: Number, default: 0 },
    grandTotal: { type: Number, default: null },
    amountPaid: { type: Number, default: null },
    balanceRemaining: { type: Number, default: null },
    billingVersion: { type: Number, default: null },
    invoiceRecord: { type: mongoose.Schema.Types.ObjectId, ref: 'InvoiceRecord', default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ createdAt: -1 });
// Payment de-duplication check on booking create/pay
paymentSchema.index({ order: 1, status: 1 });
// Stripe & Maya webhook handlers look up by provider reference
paymentSchema.index({ providerReference: 1 }, { sparse: true });
// Customer payment history page
paymentSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model('Payment', paymentSchema);
