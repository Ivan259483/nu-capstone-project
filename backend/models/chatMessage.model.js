import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      index: true,
    },
    clientMessageId: {
      type: String,
      trim: true,
      maxlength: 128,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    sender: {
      type: String,
      enum: ['user', 'assistant', 'sales', 'system'],
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    senderName: {
      type: String,
      default: '',
      trim: true,
    },
    message: {
      type: String,
      required: true,
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

chatMessageSchema.index({ createdAt: -1 });
chatMessageSchema.index({ conversationId: 1, createdAt: 1 });
chatMessageSchema.index(
  { sessionId: 1, sender: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string' } },
  }
);

export default mongoose.model('ChatMessage', chatMessageSchema);
