import mongoose from 'mongoose';

const chatSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    leadName: String,
    leadPhone: String,
    leadCapturedAt: Date,
    pendingMessage: String,
    pendingAt: Date,
    source: String,
  },
  { timestamps: true }
);

export default mongoose.model('ChatSession', chatSessionSchema);
