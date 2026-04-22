import mongoose from 'mongoose';

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
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Fast per-user vehicle lookup — without this, every getMyVehicles call is
// a full collection scan O(n) instead of an indexed O(k) lookup.
vehicleSchema.index({ customer: 1, createdAt: -1 });

export default mongoose.model('Vehicle', vehicleSchema);
