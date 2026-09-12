/**
 * AIScan model — stores GPT-4 Vision damage detection results so the
 * mobile client can rehydrate state across screens (analyzing → results
 * → ar-view → estimate → confirm) and retrieve historical scans.
 */
import mongoose from 'mongoose';
import { operationalClassificationPlugin } from '../plugins/operationalClassification.plugin.js';

const coordinateSchema = new mongoose.Schema(
  {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 0.2 },
    height: { type: Number, default: 0.2 },
  },
  { _id: false }
);

const maskPointSchema = new mongoose.Schema(
  {
    x: { type: Number, min: 0, max: 1, required: true },
    y: { type: Number, min: 0, max: 1, required: true },
  },
  { _id: false }
);

const segmentationSchema = new mongoose.Schema(
  {
    format: { type: String, enum: ['polygon', 'rle'], default: 'polygon' },
    points: [maskPointSchema],
    pointCount: { type: Number, min: 0, default: 0 },
    rle: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

const detectedAreaSchema = new mongoose.Schema(
  {
    pixels: { type: Number, min: 0, default: 0 },
    percentage: { type: Number, min: 0, max: 100, default: 0 },
    imageWidth: { type: Number, min: 1, default: 1 },
    imageHeight: { type: Number, min: 1, default: 1 },
  },
  { _id: false }
);

const subtypeAnalysisSchema = new mongoose.Schema(
  {
    accepted: { type: Boolean, default: false },
    rawClass: { type: String, default: null },
    top1Confidence: { type: Number, min: 0, max: 1, default: null },
    top2Class: { type: String, default: null },
    top2Confidence: { type: Number, min: 0, max: 1, default: null },
    margin: { type: Number, min: 0, max: 1, default: null },
    reason: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

/**
 * Which guided camera view a damage region came from. A camera position, not a
 * vehicle component — `component` stays `Unknown Vehicle Panel`.
 */
const sourceViewSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true, default: '' },
    label: { type: String, trim: true, default: '' },
    index: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const damageSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true, required: true },
    type: { type: String, trim: true, required: true },
    damageClass: { type: String, trim: true, default: '' },
    damageSubtype: { type: String, trim: true, default: 'Unknown Damage' },
    component: { type: String, trim: true, default: 'Unknown Vehicle Panel' },
    subtypeAnalysis: { type: subtypeAnalysisSchema, default: () => ({}) },
    severity: {
      type: String,
      enum: ['high', 'medium', 'low'],
      required: true,
      default: 'medium',
    },
    description: { type: String, trim: true, default: '' },
    severityLabel: { type: String, enum: ['Severe', 'Moderate', 'Minor'], default: 'Moderate' },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    coordinates: { type: coordinateSchema, default: () => ({}) },
    affectedArea: { type: String, trim: true, default: 'Vehicle Body' },
    imageIndex: { type: Number, default: 0 },
    angleHint: { type: String, trim: true, default: 'close_up' },
    sourceView: { type: sourceViewSchema, default: undefined },
    segmentation: { type: segmentationSchema, default: () => ({}) },
    detectedArea: { type: detectedAreaSchema, default: () => ({}) },
    affectedAreaPercent: { type: Number, min: 0, max: 100, default: 0 },
    recommendation: { type: String, trim: true, default: '' },
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

const imageArchiveSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['cloudinary'], default: 'cloudinary' },
    status: {
      type: String,
      enum: ['pending', 'not_configured', 'succeeded', 'partial', 'failed'],
      default: 'not_configured',
    },
    uploadMode: { type: String, enum: ['signed', 'unsigned', 'none'], default: 'none' },
    requestedCount: { type: Number, min: 0, default: 0 },
    uploadedCount: { type: Number, min: 0, default: 0 },
    httpStatus: { type: Number, default: null },
    errorCode: { type: String, trim: true, default: '' },
    errorMessage: { type: String, trim: true, default: '' },
    failedField: { type: String, trim: true, default: '' },
    attemptedAt: { type: Date, default: null },
  },
  { _id: false }
);

/**
 * Per-view outcome for a multi-view inspection. Intentionally lightweight: it
 * references damages by id rather than duplicating damage documents, and holds
 * no image data.
 */
const viewResultSchema = new mongoose.Schema(
  {
    viewId: { type: String, trim: true, default: '' },
    label: { type: String, trim: true, default: '' },
    index: { type: Number, min: 0, default: 0 },
    success: { type: Boolean, default: false },
    errorCode: { type: String, trim: true, default: '' },
    message: { type: String, trim: true, default: '' },
    noDamageDetected: { type: Boolean, default: false },
    detectedRegions: { type: Number, min: 0, default: 0 },
    damageIds: [{ type: String, trim: true }],
  },
  { _id: false }
);

const aiScanSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    vehicleId: { type: String, trim: true, default: '' },
    imageUrls: [{ type: String, trim: true }],
    imageArchive: { type: imageArchiveSchema, default: () => ({}) },
    angles: [{ type: String, trim: true }],
    imageCount: { type: Number, default: 1, min: 1 },

    // Multi-view guided inspection. One AIScan document still represents one
    // inspection; `views` is a lightweight aggregation over `damages`.
    inspectionId: { type: String, trim: true, default: '' },
    inspectionMode: { type: String, enum: ['single', 'multi_view'], default: 'single' },
    views: [viewResultSchema],

    source: {
      type: String,
      enum: ['mock', 'gpt4_vision', 'roboflow', 'fallback'],
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
    damageReport: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    estimate: { type: estimateSchema, default: () => ({}) },

    modelTaskId: { type: String, default: '' },
    modelUrl: { type: String, default: '' },
    repairedModelUrl: { type: String, default: '' },
    usdzUrl: { type: String, default: '' },
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
aiScanSchema.index({ createdAt: -1 });
aiScanSchema.index({ modelStatus: 1, createdAt: -1 });
aiScanSchema.plugin(operationalClassificationPlugin, {
  collectionName: 'ai_scans',
  label: (scan) => scan.summary || scan.source,
});

export default mongoose.model('AIScan', aiScanSchema);
