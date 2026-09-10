import mongoose from 'mongoose';

const normalizeOptionalUniqueReference = (value) => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, required: true, unique: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    service: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'PHP' },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'rejected', 'failed', 'refunded', 'partially_refunded', 'voided'],
      default: 'pending',
    },
    transactionType: {
      type: String,
      enum: ['reservation_fee', 'service_balance', 'full_service_payment', 'additional_charge', 'refund'],
      default: 'full_service_payment',
      index: true,
    },
    /** Amount claimed by the customer before Sales verification. */
    amountSubmitted: { type: Number, default: null, min: 0 },
    /** Amount accepted by Sales and eligible for revenue recognition. */
    amountVerified: { type: Number, default: null, min: 0 },
    method: {
      type: String,
      enum: ['card', 'gcash', 'maya', 'cash', 'other', 'split'],
      default: 'card',
    },
    splitPayments: {
      type: [
        {
          method: String,
          amount: { type: Number, min: 0 },
        }
      ],
      default: []
    },
    provider: { type: String, default: 'stripe' },
    providerReference: String,
    /** Customer-facing reference supplied by an external tender such as GCash. */
    paymentReference: {
      type: String,
      default: undefined,
      set: normalizeOptionalUniqueReference,
    },
    proofImage: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    /** Financial recognition timestamp. Reporting never derives this from an Order flag. */
    effectiveAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewReason: { type: String, default: null },
    verificationChecklist: {
      amount: { type: Boolean, default: false },
      identity: { type: Boolean, default: false },
      timestamp: { type: Boolean, default: false },
      reference: { type: Boolean, default: false },
    },
    statusHistory: {
      type: [
        {
          status: String,
          amountSubmitted: Number,
          amountVerified: Number,
          proofImage: String,
          reason: String,
          changedAt: { type: Date, default: Date.now },
          changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        },
      ],
      default: [],
    },
    relatedPayment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    refundReason: { type: String, default: null, trim: true, maxlength: 500 },
    refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    idempotencyKey: { type: String, default: null, trim: true },
    checkoutReference: {
      type: String,
      default: undefined,
      set: normalizeOptionalUniqueReference,
    },
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
    amountReceived: { type: Number, default: null },
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
paymentSchema.index({ status: 1, transactionType: 1, effectiveAt: -1 });
paymentSchema.index({ submittedAt: -1, status: 1 });
// Payment de-duplication check on booking create/pay
paymentSchema.index({ order: 1, status: 1 });
paymentSchema.index(
  { order: 1, transactionType: 1 },
  { unique: true, partialFilterExpression: { transactionType: 'reservation_fee' } }
);
// Stripe & Maya webhook handlers look up by provider reference
paymentSchema.index({ providerReference: 1 }, { sparse: true });
paymentSchema.index(
  { checkoutReference: 1 },
  { unique: true, partialFilterExpression: { checkoutReference: { $type: 'string' } } }
);
paymentSchema.index(
  { paymentReference: 1 },
  { unique: true, partialFilterExpression: { paymentReference: { $type: 'string' } } }
);
// Customer payment history page
paymentSchema.index({ customer: 1, createdAt: -1 });
paymentSchema.index({ customer: 1, effectiveAt: -1 });
paymentSchema.index({ order: 1, effectiveAt: -1 });
paymentSchema.index({ relatedPayment: 1, transactionType: 1, status: 1 });
paymentSchema.index(
  { relatedPayment: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transactionType: 'refund',
      idempotencyKey: { $type: 'string' },
    },
  }
);

export default mongoose.model('Payment', paymentSchema);
