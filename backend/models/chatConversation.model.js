import mongoose from 'mongoose';

const chatConversationSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    guestKey: {
      type: String,
      index: true,
    },
    title: {
      type: String,
      default: 'AutoSPF+ Concierge',
      trim: true,
    },
    mode: {
      type: String,
      enum: ['concierge', 'support'],
      default: 'concierge',
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
    },
    source: String,
    lastMessagePreview: {
      type: String,
      default: '',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

chatConversationSchema.index({ guestKey: 1, lastMessageAt: -1 });
chatConversationSchema.index({ userId: 1, lastMessageAt: -1 });

export default mongoose.model('ChatConversation', chatConversationSchema);
