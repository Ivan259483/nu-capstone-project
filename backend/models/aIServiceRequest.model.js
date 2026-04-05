import mongoose from 'mongoose';

const damageSchema = new mongoose.Schema(
  {
    damageType: { type: String, required: true, trim: true },
    affectedArea: { type: String, required: true, trim: true },
    severity: {
      type: String,
      enum: ['minor', 'moderate', 'severe'],
      required: true,
      default: 'minor',
    },
    confidence: { type: Number, min: 0, max: 1, default: 0.5 },
    recommendedAction: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const recommendationSchema = new mongoose.Schema(
  {
    serviceId: { type: String, trim: true, required: true },
    serviceName: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: '' },
    urgency: {
      type: String,
      enum: ['Immediate', 'Can Wait', 'Optional'],
      default: 'Can Wait',
    },
    relatedAreas: [{ type: String, trim: true }],
    estimatedMin: { type: Number, default: 0, min: 0 },
    estimatedMax: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const estimateLineSchema = new mongoose.Schema(
  {
    serviceId: { type: String, trim: true, required: true },
    serviceName: { type: String, trim: true, required: true },
    labor: { type: Number, default: 0, min: 0 },
    materials: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, default: 0, min: 0 },
    affectedAreas: [{ type: String, trim: true }],
  },
  { _id: false }
);

const aiServiceRequestSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vehicleId: { type: String, trim: true, default: '' },
    imageAngles: [{ type: String, trim: true }],
    imageCount: { type: Number, required: true, min: 1 },

    analysisSource: { type: String, enum: ['rule_based', 'fallback'], default: 'rule_based' },
    damages: [damageSchema],
    recommendations: [recommendationSchema],
    selectedServiceIds: [{ type: String, trim: true }],

    estimate: {
      min: { type: Number, default: 0, min: 0 },
      max: { type: Number, default: 0, min: 0 },
      formattedRange: { type: String, default: '' },
      breakdown: [estimateLineSchema],
      assumptions: [{ type: String, trim: true }],
    },

    modelUrl: { type: String, trim: true, default: '' },
    modelTaskId: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },

    status: {
      type: String,
      enum: ['confirmed', 'cancelled'],
      default: 'confirmed',
    },
  },
  { timestamps: true }
);

export default mongoose.model('AIServiceRequest', aiServiceRequestSchema);
