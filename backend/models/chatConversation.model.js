import mongoose from 'mongoose';

export const CHAT_CONVERSATION_STATUSES = Object.freeze([
  'open',
  'closed',
  'ai_handling',
  'needs_sales',
  'in_conversation',
  'resolved',
  'converted',
]);

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
      enum: CHAT_CONVERSATION_STATUSES,
      default: 'ai_handling',
    },
    source: {
      type: String,
      default: 'ai_chatbot',
    },
    customerName: {
      type: String,
      default: '',
      trim: true,
    },
    customerEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    customerPhone: {
      type: String,
      default: '',
    },
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
    },
    vehicleLabel: {
      type: String,
      default: '',
      trim: true,
    },
    plateNumber: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
    },
    serviceInterest: {
      type: String,
      default: '',
      trim: true,
    },
    assignedSalesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assignedSalesName: {
      type: String,
      default: '',
      trim: true,
    },
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessagePreview: {
      type: String,
      default: '',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    unreadForSales: {
      type: Boolean,
      default: false,
    },
    unreadForCustomer: {
      type: Boolean,
      default: false,
    },
    aiSummary: {
      type: String,
      default: '',
    },
    handedOffAt: Date,
    salesJoinedAt: Date,
  },
  { timestamps: true }
);

chatConversationSchema.index({ guestKey: 1, lastMessageAt: -1 });
chatConversationSchema.index({ userId: 1, lastMessageAt: -1 });
chatConversationSchema.index({ status: 1, lastMessageAt: -1 });
chatConversationSchema.index({ handedOffAt: 1, lastMessageAt: -1 });

export default mongoose.model('ChatConversation', chatConversationSchema);
