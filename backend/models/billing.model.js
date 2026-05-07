import mongoose from 'mongoose';

const lineItemSchema = new mongoose.Schema(
  {
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
    name: { type: String, required: true },
    billingGroup: {
      type: String,
      enum: ['ceramic_spf', 'ppf', 'other', 'uncategorized'],
      default: 'uncategorized',
    },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 1, min: 1 },
    vehicleTier: { type: String, default: '' },
  },
  { _id: true }
);

const discountSchema = {
  discountType: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
  value: { type: Number, default: 0, min: 0 },
  reason: { type: String, default: '' },
};

const billingEventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    summary: { type: String, default: '' },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const snapshotSchema = {
  subtotal: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0 },
  taxVatTotal: { type: Number, default: 0 },
  additionalFeesTotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  balanceDue: { type: Number, default: 0 },
};

const billingSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'updated', 'checked_out'],
      default: 'pending',
    },
    lineItems: { type: [lineItemSchema], default: [] },
    discount: { type: discountSchema, default: () => ({}) },
    /** VAT/tax as fixed peso amount (simpler than rate for MVP) */
    taxVatAmount: { type: Number, default: 0, min: 0 },
    additionalFees: { type: Number, default: 0, min: 0 },
    downpayment: { type: Number, default: 0, min: 0 },
    computed: { type: snapshotSchema, default: () => ({}) },
    version: { type: Number, default: 1 },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    events: { type: [billingEventSchema], default: [] },
    dedupeByServiceId: { type: Boolean, default: true },
  },
  { timestamps: true }
);

billingSchema.index({ order: 1, version: -1 });
billingSchema.index({ order: 1, updatedAt: -1 });

export default mongoose.model('Billing', billingSchema);
