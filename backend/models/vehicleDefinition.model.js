import mongoose from 'mongoose';
import { VEHICLE_PRICING_CATEGORY_CODES } from '../constants/pricingCategories.js';

// Every update inserts a new revision. No API edits or deletes historical revisions.
const schema = new mongoose.Schema({
  definitionKey: { type: String, required: true },
  revision: { type: Number, required: true, min: 1 },
  brand: { type: String, required: true },
  model: { type: String, required: true },
  brandKey: { type: String, required: true },
  modelKey: { type: String, required: true },
  generation: { type: String, default: '' },
  facelift: { type: String, default: '' },
  yearFrom: { type: Number, default: null },
  yearTo: { type: Number, default: null },
  bodyType: { type: String, required: true },
  vehicleCategory: { type: String, required: true },
  pricingCategory: { type: String, enum: [...VEHICLE_PRICING_CATEGORY_CODES, 'OTHER'], required: true },
  fuelType: { type: String, default: '' },
  drivetrain: { type: String, default: '' },
  sizeSegment: { type: String, default: '' },
  confidenceLevel: { type: String, enum: ['low', 'medium', 'high'], required: true },
  status: { type: String, enum: ['draft', 'approved', 'retired'], required: true },
  sources: { type: [String], default: [] },
  reviewExpiresAt: { type: Date, default: null },
  reason: { type: String, required: true },
  authoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ definitionKey: 1, revision: -1 }, { unique: true });
schema.index({ brandKey: 1, modelKey: 1, definitionKey: 1, revision: -1 });
export default mongoose.model('VehicleDefinition', schema);
