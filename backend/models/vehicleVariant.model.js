import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema({
  provider: { type: String, required: true, trim: true },
  sourceId: { type: String, default: '', trim: true },
  importedAt: { type: Date, required: true },
  sourceUpdatedAt: { type: Date, default: null },
  license: { type: String, default: '', trim: true },
}, { _id: false });

const schema = new mongoose.Schema({
  modelId: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleCatalogModel', required: true },
  variantName: { type: String, required: true, trim: true },
  variantKey: { type: String, required: true, trim: true },
  engine: { type: String, default: '', trim: true },
  year: { type: Number, default: undefined, min: 1886 },
  productionStart: { type: Number, default: undefined, min: 1886 },
  productionEnd: { type: Number, default: undefined, min: 1886 },
  hybrid: { type: Boolean, default: false },
  electric: { type: Boolean, default: false },
  fuelType: { type: String, default: '', trim: true },
  driveType: { type: String, default: '', trim: true },
  transmission: { type: String, default: '', trim: true },
  bodyType: { type: String, default: '', trim: true },
  vehicleClass: { type: String, default: '', trim: true },
  segment: { type: String, default: '', trim: true },
  provider: { type: String, required: true, trim: true },
  providerVariantId: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'discontinued', 'inactive'], default: 'active' },
  sources: { type: [sourceSchema], default: [] },
}, { timestamps: true, collection: 'vehicle_variants' });

schema.index({ modelId: 1, variantKey: 1, year: 1, provider: 1 }, { unique: true });
schema.index({ provider: 1, providerVariantId: 1 });
schema.index({ modelId: 1, productionStart: 1, productionEnd: 1 });

export default mongoose.model('VehicleVariant', schema);
