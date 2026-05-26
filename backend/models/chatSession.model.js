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
    leadEmail: String,
    leadPhone: String,
    leadCapturedAt: Date,
    lastIntent: String,
    lastVehicleType: String,
    lastServiceInterest: String,
    preferredLanguage: {
      type: String,
      enum: ['english', 'tagalog', 'taglish'],
    },
    lastDetectedLanguage: {
      type: String,
      enum: ['english', 'tagalog', 'taglish'],
    },
    lastTopic: String,
    lastAnsweredIntent: String,
    lastFallbackAt: Date,
    consecutiveFallbackCount: { type: Number, default: 0 },
    lastAssistantReplySignature: String,
    conversationContinuityScore: { type: Number, default: 0 },
    memoryUpdatedAt: Date,
    onboarding: {
      status: {
        type: String,
        enum: ['collecting', 'submitting', 'sent', 'failed'],
      },
      step: {
        type: String,
        enum: ['firstName', 'lastName', 'email', 'phone'],
      },
      intent: String,
      draft: {
        firstName: String,
        lastName: String,
        email: String,
        phone: String,
        phoneSkipped: Boolean,
      },
      startedAt: Date,
      completedAt: Date,
      lastError: String,
    },
    pendingMessage: String,
    pendingAt: Date,
    lastHandoffPromptAt: Date,
    handoffPromptCount: { type: Number, default: 0 },
    conversationFrustrationScore: { type: Number, default: 0 },
    source: String,
  },
  { timestamps: true }
);

export default mongoose.model('ChatSession', chatSessionSchema);
