import mongoose from 'mongoose';

export const CHAT_CONVERSATION_STATUSES = Object.freeze([
  'open',
  'closed',
  'ai_handling',
  'needs_sales',
  'in_conversation',
  'waiting_customer',
  'booking_created',
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
    selectedServiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
    },
    selectedServiceName: { type: String, default: '', trim: true },
    selectedVehicleType: { type: String, default: '', trim: true },
    offeredSchedule: [
      {
        date: { type: String, required: true, trim: true },
        time: { type: String, required: true, trim: true },
      },
    ],
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
    lastCustomerMessageAt: {
      type: Date,
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
    linkedBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      index: true,
    },
    linkedBookingReference: {
      type: String,
      default: '',
      trim: true,
    },
    resolutionReason: {
      type: String,
      enum: [
        'booking_created',
        'question_answered',
        'customer_declined',
        'no_response',
        'duplicate_spam',
        'other',
        '',
      ],
      default: '',
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    internalNotes: [
      {
        authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        authorName: { type: String, default: 'Sales Team', trim: true },
        text: { type: String, required: true, trim: true, maxlength: 2000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    handedOffAt: Date,
    salesJoinedAt: Date,
  },
  { timestamps: true },
);

chatConversationSchema.index({ guestKey: 1, lastMessageAt: -1 });
chatConversationSchema.index({ userId: 1, lastMessageAt: -1 });
chatConversationSchema.index({ status: 1, lastMessageAt: -1 });
chatConversationSchema.index({ handedOffAt: 1, lastMessageAt: -1 });

export default mongoose.model('ChatConversation', chatConversationSchema);
