import mongoose from 'mongoose';

const priceBreakdownSchema = new mongoose.Schema(
  {
    base: { type: Number, default: null },
    original: { type: Number, default: null },
    addon: { type: Number, default: null },
  },
  { _id: false }
);

/** Public /services page SPF card overrides (optional; falls back to app defaults) */
const catalogCardSchema = new mongoose.Schema(
  {
    badge: String,
    warrantyLabel: String,
    tagline: String,
    tierLabel: String,
    features: [{ type: String }],
    highlighted: [{ type: String }],
    addonLabel: String,
    discountBadge: String,
    iconKey: {
      type: String,
      enum: ['sparkles', 'shield', 'star', 'crown', 'zap'],
    },
    accentFrom: String,
    accentTo: String,
    accentMid: String,
    popular: Boolean,
    flagship: Boolean,
    originalPriceMultiplier: { type: Number, default: null },
  },
  { _id: false }
);

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
    pricing: {
      hatchback: { type: priceBreakdownSchema, default: () => ({}) },
      sedan: { type: priceBreakdownSchema, default: () => ({}) },
      midsized: { type: priceBreakdownSchema, default: () => ({}) },
      suv: { type: priceBreakdownSchema, default: () => ({}) },
      pickup: { type: priceBreakdownSchema, default: () => ({}) },
      largeSuv: { type: priceBreakdownSchema, default: () => ({}) },
      highend: { type: priceBreakdownSchema, default: () => ({}) },
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
    catalogCard: {
      type: catalogCardSchema,
      default: undefined,
    },
  },
  { timestamps: true }
);

serviceSchema.index({ billingGroup: 1, isPublished: 1, displayOrder: 1 });

export default mongoose.model('Service', serviceSchema);
