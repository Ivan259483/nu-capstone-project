import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema({
  provider: { type: String, required: true, trim: true },
  sourceId: { type: String, default: '', trim: true },
  importedAt: { type: Date, required: true },
  sourceUpdatedAt: { type: Date, default: null },
  license: { type: String, default: '', trim: true },
}, { _id: false });

const schema = new mongoose.Schema({
  manufacturerId: { type: mongoose.Schema.Types.ObjectId, ref: 'VehicleManufacturer', required: true },
  brandName: { type: String, required: true, trim: true },
  brandKey: { type: String, required: true, trim: true },
  modelName: { type: String, required: true, trim: true },
  modelKey: { type: String, required: true, trim: true },
  generation: { type: String, default: '', trim: true },
  generationKey: { type: String, default: '', trim: true },
  classificationKey: { type: String, default: '', trim: true },
  productionStart: { type: Number, default: undefined, min: 1886 },
  productionEnd: { type: Number, default: undefined, min: 1886 },
  bodyType: { type: String, default: '', trim: true },
  vehicleClass: { type: String, default: '', trim: true },
  segment: { type: String, default: '', trim: true },
  fuelTypes: { type: [String], default: [] },
  driveTypes: { type: [String], default: [] },
  transmissions: { type: [String], default: [] },
  regions: { type: [String], default: [] },
  aliases: { type: [String], default: [] },
  aliasKeys: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'discontinued', 'inactive'], default: 'active' },
  provider: { type: String, required: true, trim: true },
  providerModelId: { type: String, default: '', trim: true },
  classificationConfidence: { type: String, enum: ['unknown', 'partial', 'verified'], default: 'unknown' },
  sources: { type: [sourceSchema], default: [] },
}, { timestamps: true, collection: 'vehicle_models' });

schema.index({ manufacturerId: 1, modelKey: 1, generationKey: 1, classificationKey: 1, provider: 1 }, { unique: true });
schema.index({ brandKey: 1, modelKey: 1, productionStart: 1, productionEnd: 1 });
schema.index({ provider: 1, providerModelId: 1 });
schema.index({ modelName: 1 });

export default mongoose.model('VehicleCatalogModel', schema);
