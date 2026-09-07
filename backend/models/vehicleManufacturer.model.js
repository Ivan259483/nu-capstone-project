import mongoose from 'mongoose';

const providerKeySchema = new mongoose.Schema({
  provider: { type: String, required: true, trim: true },
  id: { type: String, required: true, trim: true },
}, { _id: false });

const sourceSchema = new mongoose.Schema({
  provider: { type: String, required: true, trim: true },
  sourceId: { type: String, default: '', trim: true },
  importedAt: { type: Date, required: true },
  sourceUpdatedAt: { type: Date, default: null },
  license: { type: String, default: '', trim: true },
}, { _id: false });

const schema = new mongoose.Schema({
  brandName: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, trim: true },
  country: { type: String, default: '', trim: true },
  logo: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'discontinued', 'inactive'], default: 'active' },
  aliases: { type: [String], default: [] },
  aliasKeys: { type: [String], default: [] },
  providerKeys: { type: [providerKeySchema], default: [] },
  sources: { type: [sourceSchema], default: [] },
}, { timestamps: true, collection: 'manufacturers' });

schema.index({ normalizedName: 1 }, { unique: true });
schema.index({ 'providerKeys.provider': 1, 'providerKeys.id': 1 });
schema.index({ brandName: 1 });
schema.index({ aliasKeys: 1 });

export default mongoose.model('VehicleManufacturer', schema);
