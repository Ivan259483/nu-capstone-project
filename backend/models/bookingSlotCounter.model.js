import mongoose from 'mongoose';

const bookingSlotCounterSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    time: { type: String, required: true },
    count: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false }
);

bookingSlotCounterSchema.index({ date: 1, time: 1 }, { unique: true });

export default mongoose.model('BookingSlotCounter', bookingSlotCounterSchema);
