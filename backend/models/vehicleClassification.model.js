import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  code: { type: String, required: true, trim: true },
  bodyType: { type: String, required: true, trim: true },
  vehicleClass: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  source: { type: String, required: true, trim: true },
}, { timestamps: true, collection: 'vehicle_classification' });

schema.index({ code: 1 }, { unique: true });
schema.index({ vehicleClass: 1, bodyType: 1 });

export default mongoose.model('VehicleClassification', schema);
