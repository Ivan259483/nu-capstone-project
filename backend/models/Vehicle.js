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
      required: true,
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
      match: [/^[A-Z]{3}\d{4}$/, 'Plate number must be 3 letters followed by 4 numbers'],
    },
  },
  { timestamps: true }
);

export default mongoose.model('Vehicle', vehicleSchema);
