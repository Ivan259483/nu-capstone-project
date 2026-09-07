import mongoose from 'mongoose';

export const STANDARD_VEHICLE_COLORS = [
  'Black',
  'White',
  'Gray',
  'Silver',
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'Orange',
  'Brown',
  'Gold',
  'Purple',
  'Pink',
  'Beige',
  'Bronze',
  'Two-Tone',
  'Custom',
];

export const VEHICLE_COLOR_FINISHES = [
  'Solid',
  'Metallic',
  'Pearlescent',
  'Matte',
  'Matte Metallic',
  'Satin',
  'Gloss',
  'Chrome',
  'Carbon Fiber',
  'Two Tone',
];

const rgbSchema = new mongoose.Schema({
  r: { type: Number, required: true, min: 0, max: 255 },
  g: { type: Number, required: true, min: 0, max: 255 },
  b: { type: Number, required: true, min: 0, max: 255 },
}, { _id: false });

const sourceSchema = new mongoose.Schema({
  provider: { type: String, required: true, trim: true },
  sourceId: { type: String, default: '', trim: true },
  sourceUrl: { type: String, default: '', trim: true },
  license: { type: String, default: '', trim: true },
  importedAt: { type: Date, required: true },
  sourceUpdatedAt: { type: Date, default: null },
}, { _id: false });

const vehicleColorSchema = new mongoose.Schema({
  vehicleBrand: { type: String, required: true, trim: true },
  vehicleModel: { type: String, required: true, trim: true },
  year: { type: Number, required: true, min: 1886, max: 2200 },
  factoryColorName: { type: String, required: true, trim: true },
  standardColor: { type: String, required: true, enum: STANDARD_VEHICLE_COLORS },
  paintCode: { type: String, default: '', trim: true },
  finishType: { type: String, required: true, enum: VEHICLE_COLOR_FINISHES },
  hexColor: { type: String, default: '', trim: true },
  rgbValue: { type: rgbSchema, default: undefined },
  availability: {
    type: String,
    enum: ['available', 'limited', 'special_edition', 'discontinued', 'unknown'],
    default: 'unknown',
  },
  specialEdition: { type: Boolean, default: false },
  editionName: { type: String, default: '', trim: true },
  regions: { type: [String], default: [] },
  brandKey: { type: String, required: true, trim: true },
  modelKey: { type: String, required: true, trim: true },
  factoryColorKey: { type: String, required: true, trim: true },
  paintCodeKey: { type: String, default: '', trim: true },
  importKey: { type: String, required: true, trim: true },
  source: { type: sourceSchema, required: true },
}, { timestamps: true, collection: 'vehicle_colors' });

// Exact lookups remain logarithmic even when the collection contains millions
// of brand/model/year/color combinations.
vehicleColorSchema.index({ importKey: 1 }, { unique: true });
vehicleColorSchema.index({ brandKey: 1, modelKey: 1, year: 1, factoryColorKey: 1 });
vehicleColorSchema.index({ brandKey: 1, modelKey: 1, year: 1, paintCodeKey: 1 });
vehicleColorSchema.index({ standardColor: 1, year: -1 });
vehicleColorSchema.index({ 'source.provider': 1, 'source.sourceId': 1 });

export default mongoose.model('VehicleColor', vehicleColorSchema);
