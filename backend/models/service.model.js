import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['Exterior', 'Interior', 'Complete', 'Engine', 'Premium'],
      default: 'Exterior',
    },
    /** Sales billing catalog grouping (SPF / PPF / other add-ons) */
    billingGroup: {
      type: String,
      enum: ['ceramic_spf', 'ppf', 'other', 'uncategorized'],
      default: 'uncategorized',
    },
    displayOrder: { type: Number, default: 0 },
    duration: String,
    basePrice: {
      type: Number,
      required: false, // Legacy or fallback price
    },
    prices: {
      hatchback: { type: Number, default: null },
      sedan: { type: Number, default: null },
      midsized: { type: Number, default: null },
      suv: { type: Number, default: null },
      pickup: { type: Number, default: null },
      largesuv: { type: Number, default: null },
      highend: { type: Number, default: null },
    },
    memberPrice: {
      type: Number,
      default: null, // null = auto-compute (e.g. basePrice or prices * 0.85)
    },
    recipe: {
      type: [
        {
          product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
          },
          productName: String,
          quantity: {
            type: Number,
            required: true,
          },
          unit: String,
        }
      ],
      default: [],
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    bookingCount: {
      type: Number,
      default: 0,
    },
    lastUpdatedBy: {
      type: String,
      default: null,
    },
    lastUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

serviceSchema.index({ billingGroup: 1, isPublished: 1, displayOrder: 1 });

export default mongoose.model('Service', serviceSchema);
