import mongoose from 'mongoose';

// Most rows represent one concrete appointment time, letting reservation
// requests atomically compete for that time's single seat. A versioned daily
// sentinel row enforces the Admin-selected date-wide booking capacity. Legacy
// __DAILY__ rows remain harmless and are intentionally ignored.

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
