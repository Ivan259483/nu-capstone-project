import mongoose from 'mongoose';
import { operationalClassificationPlugin } from '../plugins/operationalClassification.plugin.js';

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
    color: {
      type: String,
      required: true,
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
    transmission: {
      type: String,
      enum: ['', 'Automatic', 'Manual', 'CVT'],
      default: '',
    },
    fuelType: {
      type: String,
      enum: ['', 'Gasoline', 'Diesel', 'Electric', 'Hybrid'],
      default: '',
    },
  },
  { timestamps: true }
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
