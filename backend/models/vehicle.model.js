import mongoose from 'mongoose';
import { operationalClassificationPlugin } from '../plugins/operationalClassification.plugin.js';
import { VEHICLE_PRICING_CATEGORY_CODES } from '../constants/pricingCategories.js';
import { STANDARD_VEHICLE_COLORS, VEHICLE_COLOR_FINISHES } from './vehicleColor.model.js';

const vehicleSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    year: {
      type: String,
      default: '',
    },
    make: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
    generation: { type: String, default: '' },
    facelift: { type: String, default: '' },
    drivetrain: { type: String, default: '' },
    classification: { type: mongoose.Schema.Types.Mixed, default: null },
    classificationOverrides: { type: [mongoose.Schema.Types.Mixed], default: [] },
    color: {
      type: String,
      required: true,
    },
    standardColor: {
      type: String,
      enum: STANDARD_VEHICLE_COLORS,
      default: undefined,
    },
    factoryColorName: { type: String, default: '', trim: true },
    paintCode: { type: String, default: '', trim: true },
    finishType: { type: String, enum: ['', ...VEHICLE_COLOR_FINISHES], default: '' },
    colorHex: { type: String, default: '', trim: true },
    colorRgb: {
      type: new mongoose.Schema({
        r: { type: Number, min: 0, max: 255 },
        g: { type: Number, min: 0, max: 255 },
        b: { type: Number, min: 0, max: 255 },
      }, { _id: false }),
      default: undefined,
    },
    colorSource: {
      type: String,
      enum: ['oem_database', 'user_selected', 'not_specified', 'legacy'],
      default: 'legacy',
    },
    colorDatabaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleColor',
      default: null,
    },
    colorResolution: {
      type: new mongoose.Schema({
        reason: { type: String, default: '' },
        resolvedAt: { type: Date, default: null },
      }, { _id: false }),
      default: undefined,
    },
    plateNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: (value) =>
        typeof value === 'string'
          ? value.toUpperCase().replace(/[^A-Z0-9]/g, '')
          : value,
    },
    vehicleType: {
      type: String,
      default: '',
    },
    pricingCategory: {
      type: String,
      enum: VEHICLE_PRICING_CATEGORY_CODES,
      default: undefined,
    },
    pricingCategorySource: {
      type: String,
      enum: ['vehicle_database', 'customer_selected', 'admin_assigned', 'legacy_migration'],
      default: undefined,
    },
    pricingCategoryNeedsReview: {
      type: Boolean,
      default: true,
    },
    pricingCategoryReviewedAt: {
      type: Date,
      default: null,
    },
    pricingCategoryReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    transmission: {
      type: String,
      enum: ['', 'Automatic', 'Manual', 'CVT'],
      default: '',
    },
    fuelType: {
      type: String,
      enum: ['', 'Gasoline', 'Diesel', 'Electric', 'Hybrid', 'PHEV', 'HEV', 'MHEV', 'BEV', 'FCEV'],
      default: '',
    },
  },
  { timestamps: true, optimisticConcurrency: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Fast per-user vehicle lookup — without this, every getMyVehicles call is
// a full collection scan O(n) instead of an indexed O(k) lookup.
vehicleSchema.index({ customer: 1, createdAt: -1 });
vehicleSchema.plugin(operationalClassificationPlugin, {
  collectionName: 'vehicles',
  label: (vehicle) => [vehicle.year, vehicle.make, vehicle.model, vehicle.plateNumber].filter(Boolean).join(' '),
});

export default mongoose.model('Vehicle', vehicleSchema);
