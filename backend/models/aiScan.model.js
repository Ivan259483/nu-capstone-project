/**
 * AIScan model — stores GPT-4 Vision damage detection results so the
 * mobile client can rehydrate state across screens (analyzing → results
 * → ar-view → estimate → confirm) and retrieve historical scans.
 */
import mongoose from 'mongoose';

const coordinateSchema = new mongoose.Schema(
  {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 0.2 },
    height: { type: Number, default: 0.2 },
  },
  { _id: false }
);

const damageSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true, required: true },
    type: { type: String, trim: true, required: true },
    severity: {
      type: String,
      enum: ['high', 'medium', 'low'],
      required: true,
      default: 'medium',
    },
    description: { type: String, trim: true, default: '' },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    coordinates: { type: coordinateSchema, default: () => ({}) },
    affectedArea: { type: String, trim: true, default: 'Vehicle Body' },
    imageIndex: { type: Number, default: 0 },
    angleHint: { type: String, trim: true, default: 'close_up' },
    urgency: {
      type: String,
      enum: ['Immediate', 'Can Wait', 'Optional'],
      default: 'Can Wait',
    },
  },
  { _id: false }
);

const lineItemSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    damageId: { type: String, trim: true },
    serviceId: { type: String, trim: true, required: true },
    serviceName: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    affectedArea: { type: String, trim: true, default: 'Vehicle Body' },
    damageType: { type: String, trim: true, default: 'Damage' },
    severity: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
    urgency: {
      type: String,
      enum: ['Immediate', 'Can Wait', 'Optional'],
      default: 'Can Wait',
    },
    confidence: { type: Number, min: 0, max: 1, default: 0.85 },
    subtotalMin: { type: Number, default: 0 },
    subtotalMax: { type: Number, default: 0 },
    formattedSubtotal: { type: String, default: '' },
    color: { type: String, default: '#F59E0B' },
    icon: { type: String, default: 'shield-outline' },
  },
  { _id: false }
);

const recommendedPackageSchema = new mongoose.Schema(
  {
    id: { type: String, default: '' },
    name: { type: String, default: '' },
    tier: { type: String, default: '' },
    durationYears: { type: Number, default: 0 },
    basePrice: { type: Number, default: 0 },
    premiumPrice: { type: Number, default: 0 },
    description: { type: String, default: '' },
    formattedPrice: { type: String, default: '' },
    color: { type: String, default: '#F59E0B' },
    icon: { type: String, default: 'shield-outline' },
  },
  { _id: false }
);

const estimateSchema = new mongoose.Schema(
  {
    currency: { type: String, default: 'PHP' },
    lineItems: [lineItemSchema],
    subtotal: { type: Number, default: 0 },
    subtotalMax: { type: Number, default: 0 },
    totalEstimate: { type: Number, default: 0 },
    formattedSubtotal: { type: String, default: '' },
    formattedTotal: { type: String, default: '' },
    recommendedPackage: { type: recommendedPackageSchema, default: () => ({}) },
    savingsAmount: { type: Number, default: 0 },
    formattedSavings: { type: String, default: '' },
    condition: { type: String, default: 'Fair' },
    urgency: {
      type: String,
      enum: ['Immediate', 'Can Wait', 'Optional'],
      default: 'Can Wait',
    },
    assumptions: [{ type: String, trim: true }],
  },
  { _id: false }
);

const aiScanSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vehicleId: { type: String, trim: true, default: '' },
    imageUrls: [{ type: String, trim: true }],
    angles: [{ type: String, trim: true }],
    imageCount: { type: Number, default: 1, min: 1 },

    source: {
      type: String,
      enum: ['mock', 'gpt4_vision', 'fallback'],
      default: 'mock',
    },
    model: { type: String, default: 'gpt-4-vision-mock' },

    vehicleDetected: { type: Boolean, default: true },
    overallCondition: { type: String, default: 'Fair' },
    recommendedPackage: { type: String, default: 'SPF 89 Advanced' },
    urgency: {
      type: String,
      enum: ['Immediate', 'Can Wait', 'Optional'],
      default: 'Can Wait',
    },
    summary: { type: String, default: '' },

    damages: [damageSchema],
    estimate: { type: estimateSchema, default: () => ({}) },

    modelTaskId: { type: String, default: '' },
    modelUrl: { type: String, default: '' },
    repairedModelUrl: { type: String, default: '' },
    modelStatus: {
      type: String,
      enum: ['idle', 'processing', 'ready', 'failed', 'unavailable'],
      default: 'idle',
    },
    // The Meshy base URL that actually accepted the start POST — polling must use the same base.
    // e.g. "https://api.meshy.ai/v1" or "https://api.meshy.ai/openapi/v2"
    meshyPollBase: { type: String, default: '' },

    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

aiScanSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model('AIScan', aiScanSchema);
