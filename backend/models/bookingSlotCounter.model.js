import mongoose from 'mongoose';

// One counter row represents one concrete appointment time. The unique index
// lets reservation requests atomically compete for that time's single seat.
// Legacy __DAILY__ rows from the retired date-capacity model are harmless and
// intentionally ignored by current reads and writes.

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
