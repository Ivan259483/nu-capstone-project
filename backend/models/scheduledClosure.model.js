import mongoose from 'mongoose';

const CLOSURE_REASONS = ['Holiday', 'Renovation', 'Emergency', 'Staff Leave', 'Custom'];

const scheduledClosureSchema = new mongoose.Schema(
  {
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, enum: CLOSURE_REASONS, default: 'Custom' },
    note: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

scheduledClosureSchema.index({ fromDate: 1, toDate: 1 });

const ScheduledClosure = mongoose.model('ScheduledClosure', scheduledClosureSchema);
export default ScheduledClosure;
