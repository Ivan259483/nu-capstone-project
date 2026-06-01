import Groq from 'groq-sdk';
import jwt from 'jsonwebtoken';
import ChatSession from '../models/chatSession.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import Service from '../models/service.model.js';
import Product from '../models/product.model.js';
import Notification from '../models/notification.model.js';
import Order from '../models/order.model.js';
import Setting from '../models/setting.model.js';
import BusinessSettings from '../models/businessSettings.model.js';
import { COMPANY_BRANDING } from '../constants/companyBranding.js';
import { config } from '../config/environment.js';
import { getIO } from '../utils/socket.utils.js';
import {
  buildCompleteServicePriceListReply,
  buildOtherServicesSummary,
  buildSpfPricingKnowledge,
  detectVehicleProfileFromMessage,
  detectVehicleTypeFromMessage,
  getVehicleLabel,
  isAutoSpfScopeMessage,
  isPriceListRequest,
} from '../services/chatbotKnowledge.service.js';
import {
  applyReplyDeduplication,
  buildBusinessScopeRedirectReply,
  buildLanguageSwitchReply,
  buildUnsupportedLanguageReply,
  detectBusinessConversationIntent,
  detectDirectAnswerIntent,
  detectLanguageSwitch,
  detectMessageLanguage,
  detectPackageInterestFromMessage,
  detectProtectionGoalFromMessage,
  detectServiceInterestFromMessage,
  detectUnsupportedLanguageRequest,
  isFallbackRecentlyUsed,
  resolveConversationLanguage,
  updateConversationMemoryForReply,
} from '../services/chatbotIntelligence.service.js';
import {
  startChatRegistrationForCustomer,
  validateChatRegistrationEmail,
  validateChatRegistrationPhone,
  validateNamePart,
} from '../services/chatRegistration.service.js';
import {
  buildCollectedOnboardingFields,
  getMissingRequiredOnboardingFields,
  ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD,
  analyzeOnboardingMessage,
} from '../services/chatOnboardingSemantic.service.js';
import { extractActionChipsFromReply, sanitizeChatReply } from '../utils/chatReplyFormat.utils.js';
import {
  buildChatAiFallbackReply,
  GROQ_CHAT_MODEL,
} from '../utils/groqChat.utils.js';
import {
  buildCasualConciergeReply,
  buildComplaintSoftReply,
  isExplicitHumanHandoffRequest,
  isStrongComplaintOrPaymentDispute,
  markSpecialistEscalationOffered,
  shouldEscalateToSpecialist,
  SPECIALIST_ESCALATION_REPLY,
} from '../utils/chatEscalation.utils.js';
import {
  alignOnboardingAnalysisToCollectingStep,
  applyExplicitFieldCorrectionToAnalysis,
  buildCorrectionConfirmedReply,
  buildCorrectionNeedsValueReply,
  CORRECTION_INTENT_REGEX,
  normalizeLeadPhone,
} from '../utils/chatOnboardingCorrection.utils.js';
import {
  buildOnboardingInterruptionReply,
} from '../utils/chatOnboardingInterruption.utils.js';
import {
  hasExplicitRegistrationIntent,
  isGreetingMessage,
} from '../utils/chatConciergeRouting.utils.js';
import {
  adoptLegacySessionAsConversation,
  createFreshConversation,
  findConversationForAccess,
  listConversationsForCustomer,
  maybeTitleConversationFromFirstUserMessage,
  serializeChatMessages,
  serializeConversation,
  touchConversationActivity,
} from '../services/chatConversation.service.js';
import {
  buildConversationalState,
  buildGreetingConversationalState,
  buildGreetingGroqMessages,
  buildMinimalGreetingFallback,
  buildPostSentOnboardingReply,
  generateGroqGreetingReply,
  generatePrimaryConciergeReply,
  isOnboardingContext,
  looksLikeFullWelcomeMessage,
  shouldPreferGroqReply,
} from '../services/chatConciergeReasoning.service.js';

const GROQ_MODEL = GROQ_CHAT_MODEL;
const GROQ_MAX_COMPLETION_TOKENS = Number(process.env.GROQ_CHAT_MAX_TOKENS || 190);
const CHAT_SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
const CHAT_KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000;
const CHAT_HISTORY_LIMIT = 4;
const CHAT_HISTORY_CHAR_LIMIT = 1800;
const PROMPT_CONTEXT_CHAR_LIMIT = 700;

let groqClient = null;
const chatSessionCache = new Map();
const chatHistoryCache = new Map();
const knowledgeCache = new Map();
let priceListCache = null;

const QUOTE_INTENT_REGEX = /(quote|price|price\s*list|pricelist|cost|how much|pricing|rate|rates|estimate|presyo|magkano)/i;
const BOOKING_INTENT_REGEX = /(book|schedule|appointment|reserve|book now)/i;
const TRACKER_INTENT_REGEX = /\b(track|tracker|tracking|status|where\s+is\s+my\s+(car|vehicle)|live\s+tracker|order\s+status|repair\s+status)\b/i;
const CORRECTION_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const CORRECTION_PHONE_REGEX = /(?:\+?63|0)?9\d{9}\b/;
const PASSWORD_IN_CHAT_REGEX = /\b(password|passcode|pwd|set\s+my\s+pass|temporary\s+password|new\s+password|confirm\s+password)\b/i;
const TRACKER_REFERENCE_PROMPT = 'Sure! Please enter your Appointment Reference Number to pull up your status.\nIt looks like this: ASPF-XXXXXX-XXXX\nYou can find it in your booking confirmation screen or email.';
const TRACKER_TOKEN_PURPOSE = 'public_tracker';
const TRACKER_TOKEN_EXPIRES_IN = '1h';

const AVAILABILITY_MAP = [
  {
    keywords: ['ceramic', 'coating'],
    productNames: ['Ceramic Coating', 'Wax Sealant', 'Ceramic Spray'],
  },
  {
    keywords: ['ppf', 'paint protection', 'matte'],
    productNames: ['PPF Film', 'Matte PPF', 'Paint Protection Film'],
  },
  {
    keywords: ['wash', 'shampoo', 'soap'],
    productNames: ['Car Wash Shampoo', 'Premium Wash Soap', 'Wash Shampoo'],
  },
  {
    keywords: ['wax'],
    productNames: ['Wax Sealant', 'Wax'],
  },
];

const TRACKER_STEPS = [
  { key: 'confirmed', label: 'Appointment Confirmed' },
  { key: 'received', label: 'Vehicle Arrived' },
  { key: 'in_progress', label: 'Service In Progress' },
  { key: 'quality_check', label: 'Quality Check' },
  { key: 'ready_pickup', label: 'Ready for Pickup' },
];

const TRACKER_STAGE_ALIASES = {
  confirmed: 'confirmed',
  approved: 'confirmed',
  assigned: 'confirmed',
  received: 'received',
  queued: 'received',
  'in-progress': 'in_progress',
  in_progress: 'in_progress',
  detailing: 'in_progress',
  washing: 'in_progress',
  finishing: 'quality_check',
  quality_check: 'quality_check',
  completed: 'ready_pickup',
  ready: 'ready_pickup',
  ready_pickup: 'ready_pickup',
  ready_for_payment: 'ready_pickup',
  paid: 'ready_pickup',
  released: 'ready_pickup',
};

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const runChatSideEffect = (label, task) => {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`[Chatbot] Background task failed (${label}):`, error?.message || error);
      }
    });
};

const getGroqClient = () => {
  const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
  if (!GROQ_API_KEY) return null;
  if (!groqClient) {
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
};

const truncateText = (value = '', max = 600) => {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
};

const compactJson = (value, max = PROMPT_CONTEXT_CHAR_LIMIT) => {
  if (!value) return '';
  try {
    return truncateText(JSON.stringify(value), max);
  } catch {
    return '';
  }
};

const cacheSession = (session) => {
  if (!session?.sessionId) return session;
  chatSessionCache.set(session.sessionId, {
    session,
    expiresAt: Date.now() + CHAT_SESSION_CACHE_TTL_MS,
  });
  return session;
};

const getCachedSession = async (sessionId, user = null, source = undefined) => {
  const cached = chatSessionCache.get(sessionId);
  if (cached && cached.expiresAt > Date.now()) {
    const session = cached.session;
    if (user?.id && String(session.userId || '') !== String(user.id)) {
      session.userId = user.id;
      persistSessionLater(session, 'persist cached chat user');
    }
    return session;
  }

  const session = await ChatSession.findOneAndUpdate(
    { sessionId },
    {
      $setOnInsert: { sessionId, source },
      ...(user?.id ? { $set: { userId: user.id } } : {}),
    },
    { upsert: true, new: true }
  );

  return cacheSession(session);
};

const rememberChatMessage = (sessionId, role, content) => {
  if (!sessionId || !content) return;
  const current = chatHistoryCache.get(sessionId)?.messages || [];
  const next = [
    ...current,
    { role, content: truncateText(content, 600), createdAt: Date.now() },
  ].slice(-8);
  chatHistoryCache.set(sessionId, {
    messages: next,
    expiresAt: Date.now() + CHAT_SESSION_CACHE_TTL_MS,
  });
};

const getCachedRecentMessages = async (sessionId, limit = CHAT_HISTORY_LIMIT) => {
  const cached = chatHistoryCache.get(sessionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.messages.slice(-limit);
  }

  const history = await ChatMessage.find({ sessionId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('sender message createdAt')
    .lean();

  const messages = history.reverse().map((m) => ({
    role: m.sender === 'user' ? 'user' : 'assistant',
    content: truncateText(m.message, 600),
    createdAt: m.createdAt,
  }));

  chatHistoryCache.set(sessionId, {
    messages,
    expiresAt: Date.now() + CHAT_SESSION_CACHE_TTL_MS,
  });

  return messages;
};

const getRecentUserMessagesFast = async (sessionId, limit = 4) => {
  const cached = chatHistoryCache.get(sessionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.messages
      .filter((entry) => entry.role === 'user')
      .slice(-limit)
      .map((entry) => entry.content)
      .reverse();
  }

  const recentUserLines = await ChatMessage.find({ sessionId, sender: 'user' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('message')
    .lean();
  return recentUserLines.map((row) => row.message);
};

const resolveThreadId = (body = {}) =>
  String(body?.conversationId || body?.sessionId || '').trim();

const saveChatMessageLater = (payload = {}) => {
  const conversationId = payload.conversationId || payload.sessionId;
  const doc = {
    ...payload,
    conversationId,
    sessionId: payload.sessionId || conversationId,
  };

  runChatSideEffect('save chat message', async () => {
    await ChatMessage.create(doc);
    if (!conversationId || !payload.message) return;
    await touchConversationActivity(conversationId, { preview: payload.message });
    if (payload.sender === 'user') {
      await maybeTitleConversationFromFirstUserMessage(conversationId, payload.message);
    }
  });
};

const persistSessionLater = (session, label = 'persist chat session') => {
  cacheSession(session);
  runChatSideEffect(label, () => {
    const fields = [
      'userId',
      'leadName',
      'leadEmail',
      'leadPhone',
      'leadCapturedAt',
      'onboarding',
      'pendingMessage',
      'pendingAt',
      'source',
      'lastIntent',
      'lastVehicleType',
      'lastVehicleMake',
      'lastVehicleModel',
      'lastVehicleLabel',
      'lastServiceInterest',
      'lastPackageInterest',
      'lastProtectionGoal',
      'lastBookingIntentAt',
      'preferredLanguage',
      'lastDetectedLanguage',
      'lastTopic',
      'lastAnsweredIntent',
      'lastFallbackAt',
      'consecutiveFallbackCount',
      'lastAssistantReplySignature',
      'conversationContinuityScore',
      'memoryUpdatedAt',
      'lastHandoffPromptAt',
      'handoffPromptCount',
      'conversationFrustrationScore',
    ];
    const $set = {};
    const $unset = {};
    fields.forEach((field) => {
      // Background registration owns onboarding while submitting — do not clobber sent/failed.
      if (field === 'onboarding' && session.onboarding?.status === 'submitting') {
        return;
      }
      if (session[field] === undefined) {
        $unset[field] = '';
      } else {
        $set[field] = session[field];
      }
    });

    const update = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    return Object.keys(update).length
      ? ChatSession.updateOne({ sessionId: session.sessionId }, update)
      : Promise.resolve();
  });
};

const inferIntent = (message = '') => {
  const businessIntent = detectBusinessConversationIntent(message);
  if (businessIntent?.intent) return businessIntent.intent;
  if (TRACKER_INTENT_REGEX.test(message)) return 'tracker';
  if (BOOKING_INTENT_REGEX.test(message)) return 'booking';
  if (QUOTE_INTENT_REGEX.test(message)) return 'quote';
  if (hasExplicitRegistrationIntent(message)) return 'account';
  if (isExplicitHumanHandoffRequest(message)) return 'handoff';
  return 'general';
};

const updateSessionMemory = (
  session,
  {
    intent,
    vehicleType,
    vehicleProfile,
    serviceInterest,
    packageInterest,
    protectionGoal,
    bookingIntentAt,
    preferredLanguage,
    detectedLanguage,
    topic,
    answeredIntent,
  } = {}
) => {
  let changed = false;
  if (intent && session.lastIntent !== intent) {
    session.lastIntent = intent;
    changed = true;
  }
  if (vehicleType && session.lastVehicleType !== vehicleType) {
    session.lastVehicleType = vehicleType;
    changed = true;
  }
  if (vehicleProfile?.vehicleType && session.lastVehicleType !== vehicleProfile.vehicleType) {
    session.lastVehicleType = vehicleProfile.vehicleType;
    changed = true;
  }
  if (vehicleProfile?.make && session.lastVehicleMake !== vehicleProfile.make) {
    session.lastVehicleMake = vehicleProfile.make;
    changed = true;
  }
  if (vehicleProfile?.model && session.lastVehicleModel !== vehicleProfile.model) {
    session.lastVehicleModel = vehicleProfile.model;
    changed = true;
  }
  if (vehicleProfile?.label && session.lastVehicleLabel !== vehicleProfile.label) {
    session.lastVehicleLabel = vehicleProfile.label;
    changed = true;
  }
  if (serviceInterest && session.lastServiceInterest !== serviceInterest) {
    session.lastServiceInterest = serviceInterest;
    changed = true;
  }
  if (packageInterest && session.lastPackageInterest !== packageInterest) {
    session.lastPackageInterest = packageInterest;
    changed = true;
  }
  if (protectionGoal && session.lastProtectionGoal !== protectionGoal) {
    session.lastProtectionGoal = protectionGoal;
    changed = true;
  }
  if (bookingIntentAt && String(session.lastBookingIntentAt || '') !== String(bookingIntentAt)) {
    session.lastBookingIntentAt = bookingIntentAt;
    changed = true;
  }
  if (preferredLanguage && session.preferredLanguage !== preferredLanguage) {
    session.preferredLanguage = preferredLanguage;
    changed = true;
  }
  if (detectedLanguage && session.lastDetectedLanguage !== detectedLanguage) {
    session.lastDetectedLanguage = detectedLanguage;
    changed = true;
  }
  if (topic && session.lastTopic !== topic) {
    session.lastTopic = topic;
    changed = true;
  }
  if (answeredIntent && session.lastAnsweredIntent !== answeredIntent) {
    session.lastAnsweredIntent = answeredIntent;
    changed = true;
  }
  if (changed) {
    session.memoryUpdatedAt = new Date();
    persistSessionLater(session, 'persist chat memory');
  }
};

const canonicalTrackerPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  if (digits.startsWith('00') && digits.length > 4) return digits.slice(2);
  return digits;
};

const detectSessionCorrection = (message = '') => {
  const text = String(message || '').trim();
  if (!CORRECTION_INTENT_REGEX.test(text)) return null;

  const email = text.match(CORRECTION_EMAIL_REGEX)?.[0]?.toLowerCase();
  if (email) {
    return { field: 'leadEmail', label: 'email', value: email };
  }

  const compact = text.replace(/[()\-\s.]/g, '');
  const phone = compact.match(CORRECTION_PHONE_REGEX)?.[0];
  if (phone) {
    return { field: 'leadPhone', label: 'mobile number', value: normalizeLeadPhone(phone) };
  }

  return null;
};

const buildCorrectionReply = (correction, session) => {
  const nextStep = (() => {
    if (correction.field === 'leadEmail' && !session.leadPhone) {
      return 'Now, what mobile number should we place on your account?';
    }
    if (correction.field === 'leadPhone' && !session.leadName) {
      return 'Now, may I have your name for the quote?';
    }
    if (session.pendingMessage) {
      return 'Now, I can continue with your AutoSPF+ quote. Please tell me your vehicle type if you have not shared it yet.';
    }
    return 'Now, how can I help with your AutoSPF+ booking, quote, or tracker?';
  })();

  return `Got it! Updated your ${correction.label} to ${correction.value}.\n${nextStep}`;
};

const isActiveOnboardingSession = (session) =>
  ['collecting', 'failed'].includes(session?.onboarding?.status) && !!session?.onboarding?.step;

const isFieldMutationIntent = (analysis = {}) =>
  SEMANTIC_UPDATE_INTENTS.has(analysis.intent)
  || SEMANTIC_CONFIRM_INTENTS.has(analysis.intent)
  || Boolean(analysis.field);

const appendOnboardingResumeIfNeeded = (body, { session, step, draft } = {}) => {
  const text = String(body || '').trim();
  if (!text) return text;
  if (session?.onboarding?.status === 'sent') return text;
  if (!['collecting', 'failed'].includes(session?.onboarding?.status) || !step) return text;
  return `${text}\n\n${buildOnboardingResumePrompt(step, draft)}`;
};

const resolveGroqOnboardingReply = (analysis = {}, { session, step, draft } = {}) => {
  if (!shouldPreferGroqReply(analysis)) {
    if (session?.onboarding?.status === 'sent') {
      return sanitizeChatReply(buildPostSentOnboardingReply(draft));
    }
    return null;
  }

  const body = analysis.reply || analysis.replySuggestion;
  return sanitizeChatReply(appendOnboardingResumeIfNeeded(body, { session, step, draft }));
};

const getOnboardingDraft = (session) => ({
  firstName: session?.onboarding?.draft?.firstName || '',
  lastName: session?.onboarding?.draft?.lastName || '',
  email: session?.onboarding?.draft?.email || '',
  phone: session?.onboarding?.draft?.phone || '',
});

const SEMANTIC_FIELD_TO_STEP = {
  first_name: 'firstName',
  last_name: 'lastName',
  email: 'email',
  phone: 'phone',
};

const STEP_TO_SEMANTIC_FIELD = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  phone: 'phone',
};

const getOnboardingStepFromSemanticField = (field) => SEMANTIC_FIELD_TO_STEP[field] || null;

const getOnboardingMissingFields = (draft = {}) => getMissingRequiredOnboardingFields(draft);

const getNextOnboardingStep = (draft = {}) => {
  const [firstMissingField] = getOnboardingMissingFields(draft);
  return getOnboardingStepFromSemanticField(firstMissingField);
};

const resolveOnboardingCollectingStep = (session, draft = {}) => {
  const explicit = session?.onboarding?.step;
  if (explicit && ['firstName', 'lastName', 'email', 'phone'].includes(explicit)) {
    return explicit;
  }

  const status = session?.onboarding?.status;
  if (status === 'failed' || status === 'submitting') {
    const lastField = session?.onboarding?.lastSubmittedField;
    if (lastField && ['firstName', 'lastName', 'email', 'phone'].includes(lastField)) {
      return lastField;
    }
    return 'email';
  }

  return getNextOnboardingStep(draft) || 'firstName';
};

const ONBOARDING_PROMPTS = {
  firstName: "What's your first name?",
  lastName: "Thanks. What's your last name?",
  phone: 'What mobile number should we place on your account?',
  email: 'What email address should we use for your secure setup link?',
};

const beginAccountOnboarding = async (session, { intentSource = 'groq', analysis = null } = {}) => {
  const draft = getOnboardingDraft(session);
  const missingRequiredFields = getOnboardingMissingFields(draft);
  const groqStep = getOnboardingStepFromSemanticField(analysis?.nextRequiredField);
  const step = groqStep || getNextOnboardingStep(draft) || 'firstName';

  session.onboarding = {
    status: 'collecting',
    step,
    intent: 'CREATE_ACCOUNT',
    draft,
    startedAt: session.onboarding?.startedAt || new Date(),
    lastError: undefined,
  };
  await session.save();

  const canUseGroqReply =
    analysis?.reply
    && analysis?.nextRequiredField
    && STEP_TO_SEMANTIC_FIELD[step] === analysis.nextRequiredField;
  const reply = canUseGroqReply
    ? analysis.reply
    : `Absolutely — I'll help you create your AutoSPF+ account.\n\n${ONBOARDING_PROMPTS[step]}`;

  return {
    reply: sanitizeChatReply(reply),
    metadata: {
      type: 'account_onboarding_started',
      intentSource,
      onboardingStep: step,
      onboardingStatus: 'collecting',
      missingRequiredFields,
      nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
      semanticIntent: analysis?.intent,
      semanticConfidence: analysis?.confidence,
      semanticSource: analysis?.source,
    },
  };
};

const ONBOARDING_SUBMITTING_STALE_MS = 25_000;

const getOnboardingSubmittingAgeMs = (session = {}) => {
  const submittedAt = session?.onboarding?.lastSubmittedAt;
  if (!submittedAt) return Number.POSITIVE_INFINITY;
  return Date.now() - new Date(submittedAt).getTime();
};

const isOnboardingSubmittingStale = (session = {}) =>
  session?.onboarding?.status === 'submitting'
  && getOnboardingSubmittingAgeMs(session) > ONBOARDING_SUBMITTING_STALE_MS;

const isOnboardingRetryMessage = (message = '') =>
  /\b(try\s+again|retry|resend|ulitin|subukan\s+muli)\b/i.test(String(message || '').trim());

const buildOnboardingSubmittingAckReply = (draft = {}) => {
  const firstName = String(draft.firstName || '').trim();
  const email = String(draft.email || '').trim();
  const greeting = firstName ? `Thanks, ${firstName}!` : 'Thanks!';
  const destination = email ? ` to ${email}` : '';
  return sanitizeChatReply(
    `${greeting} I'm sending your secure setup link${destination} now. You'll see a confirmation here in a few seconds.`
  );
};

const appendOnboardingOutcomeMessage = (sessionId, reply, metadata = {}) => {
  if (!sessionId || !reply) return;
  saveChatMessageLater({
    sessionId,
    conversationId: sessionId,
    sender: 'assistant',
    message: sanitizeChatReply(reply),
    metadata: {
      ...metadata,
      type: metadata.type || 'account_onboarding_outcome',
    },
  });
};

const runAccountOnboardingSubmission = async (
  session,
  draft,
  { submittedField = '', submittedValue = '' } = {}
) => {
  const finalSubmittedField = submittedField || session.onboarding?.lastSubmittedField || 'email';
  const finalSubmittedValue = submittedValue || draft[finalSubmittedField] || '';
  const submittedAt = session.onboarding?.lastSubmittedAt || new Date();

  let result;
  try {
    result = await startChatRegistrationForCustomer(draft);
  } catch (error) {
    session.onboarding = {
      ...session.onboarding,
      status: error?.emailError ? 'collecting' : 'failed',
      step: 'email',
      lastError: error?.message || 'Account setup failed.',
      draft,
      lastSuccessfulStep: finalSubmittedField,
      lastSubmittedField: finalSubmittedField,
      lastSubmittedValue: finalSubmittedValue,
      lastSubmittedAt: submittedAt,
    };
    await session.save();
    cacheSession(session);

    return {
      reply: error?.emailError
        ? 'I saved the account details, but the secure setup email could not be sent right now. Please send your email again in a moment and I will retry it here.'
        : 'I could not complete the account setup yet. Please say "try again" and I will resend your secure setup link.',
      metadata: { type: 'account_onboarding_failed', onboardingStep: 'email', onboardingStatus: session.onboarding.status },
    };
  }

  if (!result.ok) {
    session.onboarding = {
      ...session.onboarding,
      status: 'failed',
      step: 'email',
      lastError: result.message,
      draft,
      lastSuccessfulStep: finalSubmittedField,
      lastSubmittedField: finalSubmittedField,
      lastSubmittedValue: finalSubmittedValue,
      lastSubmittedAt: submittedAt,
    };
    await session.save();
    cacheSession(session);

    return {
      reply: result.message || 'I could not complete the account setup yet. Please say "try again" and I will resend your secure setup link.',
      metadata: { type: 'account_onboarding_failed', onboardingStep: 'email', onboardingStatus: 'failed' },
    };
  }

  session.leadName = [draft.firstName, draft.lastName].filter(Boolean).join(' ');
  session.leadEmail = result.data?.email || draft.email;
  session.leadPhone = draft.phone;
  session.leadCapturedAt = new Date();
  session.onboarding = {
    ...session.onboarding,
    status: 'sent',
    step: undefined,
    draft: {
      ...draft,
      email: result.data?.email || draft.email,
    },
    completedAt: new Date(),
    lastError: undefined,
    lastSuccessfulStep: finalSubmittedField,
    lastSubmittedField: finalSubmittedField,
    lastSubmittedValue: finalSubmittedValue,
    lastSubmittedAt: submittedAt,
  };
  await session.save();
  cacheSession(session);

  const reply = "We've sent a secure setup link to your email address. Please check your inbox to continue creating your password and activate your AutoSPF+ account.";

  return {
    reply: sanitizeChatReply(reply),
    metadata: {
      type: 'account_onboarding_complete',
      onboardingStatus: 'sent',
      email: result.data?.email || draft.email,
      missingRequiredFields: [],
      nextRequiredField: null,
    },
  };
};

const completeAccountOnboarding = async (
  session,
  draft,
  { submittedField = '', submittedValue = '' } = {},
  { background = true } = {}
) => {
  const finalSubmittedField = submittedField || session.onboarding?.lastSubmittedField || 'email';
  const finalSubmittedValue = submittedValue || draft[finalSubmittedField] || '';
  const submittedAt = new Date();
  session.onboarding = {
    ...session.onboarding,
    status: 'submitting',
    step: undefined,
    draft,
    lastError: undefined,
    lastSuccessfulStep: finalSubmittedField,
    lastSubmittedField: finalSubmittedField,
    lastSubmittedValue: finalSubmittedValue,
    lastSubmittedAt: submittedAt,
  };
  await session.save();
  cacheSession(session);

  const useBackground = background && process.env.CHAT_ONBOARDING_SYNC_SUBMIT !== 'true';
  if (!useBackground) {
    return runAccountOnboardingSubmission(session, draft, { submittedField, submittedValue });
  }

  const sessionId = session.sessionId;
  const draftSnapshot = { ...draft };
  runChatSideEffect('chat account registration', async () => {
    const freshSession = await ChatSession.findOne({ sessionId });
    if (!freshSession || freshSession.onboarding?.status !== 'submitting') {
      return;
    }
    const outcome = await runAccountOnboardingSubmission(freshSession, draftSnapshot, {
      submittedField,
      submittedValue,
    });
    appendOnboardingOutcomeMessage(sessionId, outcome.reply, outcome.metadata || {});
  });

  return {
    reply: buildOnboardingSubmittingAckReply(draft),
    metadata: {
      type: 'account_onboarding_submitting',
      onboardingStep: 'email',
      onboardingStatus: 'submitting',
      missingRequiredFields: [],
      nextRequiredField: null,
    },
  };
};

const ONBOARDING_RESUME_PROMPTS = {
  firstName: "what's your first name?",
  lastName: "what's your last name?",
  phone: 'what mobile number should we place on your account?',
  email: 'what email address should we use for your secure setup link?',
};

const buildOnboardingResumePrompt = (step, draft = {}) => {
  const text = ONBOARDING_RESUME_PROMPTS[step];
  if (!text) return 'Now, let us continue with your account setup.';
  if (step === 'lastName' && draft.firstName) {
    return `Now, thanks ${draft.firstName} — ${ONBOARDING_RESUME_PROMPTS.lastName}`;
  }
  return `Now, ${text}`;
};

const handleOnboardingBusinessInterruption = async (
  session,
  message,
  { draft, step, sessionId, language, wantsPriceList, semanticIntent, semanticConfidence } = {}
) => {
  const semanticDirectIntent = {
    ASK_LOCATION: { intent: 'location', topic: 'location' },
    ASK_PRICING: { intent: 'pricing', topic: 'pricing' },
    ASK_SERVICES: { intent: 'services', topic: 'services' },
    ASK_HOURS: { intent: 'hours', topic: 'hours' },
  }[semanticIntent];
  const intentInfo = semanticDirectIntent
    ? { ...semanticDirectIntent, confidence: semanticConfidence || 0.9 }
    : detectDirectAnswerIntent(message);
  if (!intentInfo) return null;

  const vehicleProfile = detectVehicleProfileFromMessage(message);
  const vehicleContextKey = await resolveVehicleContext(sessionId, message, session);

  if (vehicleProfile || vehicleContextKey) {
    updateSessionMemory(session, {
      vehicleProfile,
      vehicleType: vehicleContextKey,
    });
  }

  const directAnswer = await buildDirectAnswerReply({
    intentInfo,
    language,
    vehicleContextKey,
    wantsPriceList,
    session,
    vehicleProfile,
  });

  if (!directAnswer?.reply) return null;

  return {
    reply: sanitizeChatReply(`${directAnswer.reply}\n\n${buildOnboardingResumePrompt(step, draft)}`),
    metadata: {
      type: 'account_onboarding_business_interruption',
      intent: directAnswer.metadata.intent,
      topic: directAnswer.metadata.topic,
      confidence: directAnswer.metadata.confidence,
      step,
      resumeStep: step,
    },
    action: null,
  };
};

const SEMANTIC_FIELD_TO_DRAFT_FIELD = {
  first_name: 'firstName',
  last_name: 'lastName',
  email: 'email',
  phone: 'phone',
};

const SEMANTIC_FIELD_LABELS = {
  first_name: 'first name',
  last_name: 'last name',
  email: 'email address',
  phone: 'mobile number',
};

const SEMANTIC_UPDATE_INTENTS = new Set([
  'UPDATE_FIRST_NAME',
  'UPDATE_LAST_NAME',
  'UPDATE_EMAIL',
  'UPDATE_PHONE',
]);

const SEMANTIC_CONFIRM_INTENTS = new Set([
  'CONFIRM_PREVIOUS_FIRST_NAME',
  'CONFIRM_PREVIOUS_LAST_NAME',
  'CONFIRM_PREVIOUS_EMAIL',
  'CONFIRM_PREVIOUS_PHONE',
]);

const SEMANTIC_BUSINESS_INTENTS = new Set([
  'ASK_LOCATION',
  'ASK_PRICING',
  'ASK_SERVICES',
  'ASK_HOURS',
]);

const buildSemanticMetadata = (analysis = {}, extra = {}) => ({
  semanticIntent: analysis.intent,
  semanticConfidence: analysis.confidence,
  semanticField: analysis.field || undefined,
  semanticSource: analysis.source,
  semanticLanguage: analysis.language,
  semanticRecommendedAction: analysis.recommendedAction || undefined,
  nextRequiredField: analysis.nextRequiredField || undefined,
  duplicate: Boolean(analysis.duplicate) || undefined,
  clarificationRequired: false,
  ...extra,
});

const buildLowConfidenceOnboardingReply = (analysis = {}, { step = '', draft = {} } = {}) => {
  if (analysis.reply) return sanitizeChatReply(analysis.reply);
  if (analysis.clarificationQuestion) return sanitizeChatReply(analysis.clarificationQuestion);
  if (analysis.field) {
    const label = SEMANTIC_FIELD_LABELS[analysis.field] || 'detail';
    return `I want to get that right. What should I update your ${label} to?`;
  }
  if (analysis.intent === 'CLARIFICATION') {
    return 'What would you like me to correct?';
  }
  return buildOnboardingResumePrompt(step, draft);
};

const buildOnboardingStatusReply = ({ message = '', step = '', draft = {} } = {}) =>
  buildOnboardingInterruptionReply({
    message: message || 'what information do you have so far?',
    step,
    draft,
    resumePrompt: buildOnboardingResumePrompt(step, draft),
  });

const semanticFieldMatchesCurrentStep = (field, step) => SEMANTIC_FIELD_TO_DRAFT_FIELD[field] === step;

const shouldUseCorrectionTone = ({ field, step, draft = {}, pendingCorrection } = {}) => {
  const draftField = SEMANTIC_FIELD_TO_DRAFT_FIELD[field];
  if (!draftField) return false;
  if (pendingCorrection?.field === draftField) return true;
  if (!semanticFieldMatchesCurrentStep(field, step)) return true;
  return Boolean(String(draft[draftField] || '').trim());
};

const validateSemanticFieldValue = (field, value) => {
  if (field === 'first_name' || field === 'last_name') {
    return validateNamePart(value, field === 'first_name' ? 'first name' : 'last name');
  }
  if (field === 'email') {
    return validateChatRegistrationEmail(value);
  }
  if (field === 'phone') {
    return validateChatRegistrationPhone(value);
  }
  return { ok: false, message: 'I need one more detail before I can update that.' };
};

const applySemanticFieldUpdate = async (session, analysis, { draft, step, pendingCorrection } = {}) => {
  const field = analysis.field;
  const draftField = SEMANTIC_FIELD_TO_DRAFT_FIELD[field];
  const currentMissingRequiredFields = getOnboardingMissingFields(draft);
  if (!draftField) {
    return {
      reply: 'What would you like me to correct?',
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_clarification',
        onboardingStep: step,
        onboardingStatus: session.onboarding?.status,
        clarificationRequired: true,
        missingRequiredFields: currentMissingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
      }),
    };
  }

  if (!analysis.value) {
    session.onboarding = {
      ...session.onboarding,
      status: 'collecting',
      step: draftField,
      intent: 'CREATE_ACCOUNT',
      draft,
      correction: {
        field: draftField,
        returnStep: ['firstName', 'lastName', 'email', 'phone'].includes(step) ? step : draftField,
        requestedAt: new Date(),
      },
      startedAt: session.onboarding?.startedAt || new Date(),
      lastError: session.onboarding?.lastError,
    };
    await session.save();

    return {
      reply: buildCorrectionNeedsValueReply(draftField),
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_correction_prompt',
        field: draftField,
        onboardingStep: draftField,
        onboardingStatus: 'collecting',
        clarificationRequired: true,
        missingRequiredFields: currentMissingRequiredFields,
        nextRequiredField: field,
      }),
    };
  }

  const validation = validateSemanticFieldValue(field, analysis.value);
  if (!validation.ok) {
    return {
      reply: field === 'email'
        ? 'That email does not look quite right. Please send the email address for your secure setup link.'
        : field === 'phone'
          ? 'That does not look like a mobile number. Send a valid number like 09171234567 or +639171234567.'
          : validation.message,
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_validation',
        field: draftField,
        onboardingStep: step,
        onboardingStatus: session.onboarding?.status,
        missingRequiredFields: currentMissingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
      }),
    };
  }

  const nextDraft = {
    ...draft,
    [draftField]: validation.value,
  };
  const missingRequiredFields = getOnboardingMissingFields(nextDraft);
  const groqNextStep = getOnboardingStepFromSemanticField(analysis.nextRequiredField);
  const nextStep = groqNextStep && missingRequiredFields.includes(analysis.nextRequiredField)
    ? groqNextStep
    : getNextOnboardingStep(nextDraft);
  const expectedNextField = nextStep ? STEP_TO_SEMANTIC_FIELD[nextStep] : null;
  const canUseGroqReply =
    Boolean(analysis.reply)
    && (!expectedNextField || analysis.nextRequiredField === expectedNextField)
    && (!expectedNextField || field === expectedNextField || semanticFieldMatchesCurrentStep(field, step));
  const correctionTone = shouldUseCorrectionTone({ field, step, draft, pendingCorrection });

  if (!nextStep) {
    const completion = await completeAccountOnboarding(session, nextDraft, {
      submittedField: draftField,
      submittedValue: validation.value,
    });
    return {
      ...completion,
      reply: correctionTone
        ? buildCorrectionConfirmedReply({
            field: draftField,
            value: nextDraft[draftField],
            nextPrompt: completion.reply,
          })
        : completion.reply,
      metadata: {
        ...(completion.metadata || {}),
        ...buildSemanticMetadata(analysis, {
          type: completion.metadata?.type || 'account_onboarding_complete',
          field: draftField,
          onboardingStatus: 'sent',
          missingRequiredFields: [],
          nextRequiredField: null,
        }),
      },
    };
  }

  session.onboarding = {
    ...session.onboarding,
    status: 'collecting',
    step: nextStep,
    intent: 'CREATE_ACCOUNT',
    draft: nextDraft,
    correction: undefined,
    startedAt: session.onboarding?.startedAt || new Date(),
    lastError: undefined,
    lastSuccessfulStep: draftField,
    lastSubmittedField: draftField,
    lastSubmittedValue: validation.value,
    lastSubmittedAt: new Date(),
  };
  await session.save();

  const defaultNextPrompt = nextStep === 'phone' && nextDraft.firstName && nextDraft.lastName
    ? `Great, ${nextDraft.firstName} ${nextDraft.lastName}. ${ONBOARDING_PROMPTS[nextStep]}`
    : nextStep === 'lastName' && nextDraft.firstName && correctionTone
      ? `Great, ${nextDraft.firstName}. ${ONBOARDING_PROMPTS[nextStep]}`
      : step === 'firstName' && nextDraft.firstName
        ? `Thank you, ${nextDraft.firstName}. ${ONBOARDING_PROMPTS[nextStep]}`
        : ONBOARDING_PROMPTS[nextStep];
  const nextPrompt = canUseGroqReply ? analysis.reply : defaultNextPrompt;

  const reply = canUseGroqReply
    ? analysis.reply
    : correctionTone
    ? buildCorrectionConfirmedReply({
        field: draftField,
        value: nextDraft[draftField],
        nextPrompt,
      })
    : nextPrompt;

  return {
    reply: sanitizeChatReply(reply),
    metadata: buildSemanticMetadata(analysis, {
      type: correctionTone ? 'account_onboarding_correction' : 'account_onboarding_step',
      field: draftField,
      onboardingStep: nextStep,
      onboardingStatus: 'collecting',
      missingRequiredFields,
      nextRequiredField: STEP_TO_SEMANTIC_FIELD[nextStep] || undefined,
    }),
  };
};

const shouldRetryOnboardingBackendProcess = (analysis = {}, session = {}) =>
  analysis.recommendedAction === 'RETRY_BACKEND_PROCESS'
  || analysis.intent === 'RETRY_ONBOARDING_SUBMISSION'
  || (SEMANTIC_CONFIRM_INTENTS.has(analysis.intent) && Boolean(session.onboarding?.lastError));

const buildOnboardingBusinessContext = async (session = {}) => {
  const facts = await loadChatBusinessFacts().catch(() => null);
  return {
    brand: 'AutoSPF+',
    passwordPolicy: 'Passwords are created only through secure email setup links sent by Resend.',
    phone: facts?.phone || '',
    email: facts?.email || '',
    address: facts?.address || '',
    hoursSummary: facts?.hoursSummary || '',
    lastTopic: session.lastTopic || '',
    lastVehicleLabel: session.lastVehicleLabel || '',
    lastServiceInterest: session.lastServiceInterest || '',
  };
};

const retryOnboardingBackendProcess = async (session, analysis, { draft, step } = {}) => {
  let nextDraft = { ...draft };
  const draftField = SEMANTIC_FIELD_TO_DRAFT_FIELD[analysis.field];

  if (draftField && analysis.value) {
    const validation = validateSemanticFieldValue(analysis.field, analysis.value);
    if (!validation.ok) {
      return {
        reply: validation.message || buildOnboardingResumePrompt(step, draft),
        metadata: buildSemanticMetadata(analysis, {
          type: 'account_onboarding_retry_validation',
          field: draftField,
          onboardingStep: step,
          onboardingStatus: session.onboarding?.status,
          recoveryAction: 'retry_backend_process',
        }),
      };
    }

    nextDraft = {
      ...nextDraft,
      [draftField]: validation.value,
    };
  }

  const missingRequiredFields = getOnboardingMissingFields(nextDraft);
  const groqMissingStep = getOnboardingStepFromSemanticField(analysis.nextRequiredField);
  const missingStep = groqMissingStep && missingRequiredFields.includes(analysis.nextRequiredField)
    ? groqMissingStep
    : getNextOnboardingStep(nextDraft);
  if (missingStep) {
    session.onboarding = {
      ...session.onboarding,
      status: 'collecting',
      step: missingStep,
      intent: 'CREATE_ACCOUNT',
      draft: nextDraft,
      correction: undefined,
      startedAt: session.onboarding?.startedAt || new Date(),
    };
    await session.save();

    return {
      reply: sanitizeChatReply(
        analysis.reply || `${analysis.replySuggestion || 'Got it — I have that noted.'}\n\n${buildOnboardingResumePrompt(missingStep, nextDraft)}`
      ),
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_retry_incomplete',
        field: draftField,
        onboardingStep: missingStep,
        onboardingStatus: 'collecting',
        recoveryAction: 'retry_backend_process',
        missingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[missingStep] || undefined,
      }),
    };
  }

  const completion = await completeAccountOnboarding(session, nextDraft, {
    submittedField: draftField || session.onboarding?.lastSubmittedField,
    submittedValue: draftField ? nextDraft[draftField] : session.onboarding?.lastSubmittedValue,
  }, { background: false });
  return {
    ...completion,
    metadata: {
      ...(completion.metadata || {}),
      ...buildSemanticMetadata(analysis, {
        type: completion.metadata?.type === 'account_onboarding_complete'
          ? 'account_onboarding_retry_complete'
          : 'account_onboarding_retry_failed',
        field: draftField,
        onboardingStatus: completion.metadata?.onboardingStatus || session.onboarding?.status,
        recoveryAction: 'retry_backend_process',
      }),
    },
  };
};

const handleAccountOnboardingInput = async (
  session,
  message,
  { sessionId, language, wantsPriceList, recentMessages = [] } = {}
) => {
  const draft = getOnboardingDraft(session);
  const missingRequiredFields = getOnboardingMissingFields(draft);
  const onboardingStatus = session.onboarding?.status || 'collecting';

  if (!missingRequiredFields.length) {
    if (onboardingStatus === 'submitting') {
      if (isOnboardingSubmittingStale(session) || isOnboardingRetryMessage(message)) {
        return completeAccountOnboarding(session, draft, {
          submittedField: session.onboarding?.lastSubmittedField || 'email',
          submittedValue: draft[session.onboarding?.lastSubmittedField || 'email'] || draft.email,
        }, { background: false });
      }

      return {
        reply: sanitizeChatReply(
          `I'm still sending your secure setup link${draft.email ? ` to ${draft.email}` : ''}. Say "try again" if this takes more than a minute.`
        ),
        metadata: {
          type: 'account_onboarding_submitting',
          onboardingStep: session.onboarding?.lastSubmittedField || 'email',
          onboardingStatus: 'submitting',
          missingRequiredFields: [],
          nextRequiredField: null,
        },
      };
    }

    if (onboardingStatus === 'failed') {
      return retryOnboardingBackendProcess(session, {
        intent: 'RETRY_ONBOARDING_SUBMISSION',
        field: null,
        value: null,
        confidence: 0.95,
        recommendedAction: 'RETRY_BACKEND_PROCESS',
        reply: '',
      }, {
        draft,
        step: resolveOnboardingCollectingStep(session, draft),
      });
    }

    if (onboardingStatus === 'collecting') {
      return completeAccountOnboarding(session, draft, {
        submittedField: session.onboarding?.lastSubmittedField || 'email',
        submittedValue: draft[session.onboarding?.lastSubmittedField || 'email'] || draft.email,
      }, { background: true });
    }
  }

  const step = resolveOnboardingCollectingStep(session, draft);
  const collectedFields = buildCollectedOnboardingFields(draft);
  const businessContext = await buildOnboardingBusinessContext(session);
  const pendingCorrection = session.onboarding?.correction;
  const analysis = await analyzeOnboardingMessage({
    message,
    step,
    draft,
    collectedFields,
    missingRequiredFields,
    businessContext,
    pendingCorrection,
    preferredLanguage: language || session.preferredLanguage || session.lastDetectedLanguage || 'english',
    lastTopic: session.lastTopic,
    lastIntent: session.lastIntent,
    recentMessages,
    onboardingStatus: session.onboarding?.status || 'collecting',
    lastBackendError: session.onboarding?.lastError || '',
    lastSuccessfulStep: session.onboarding?.lastSuccessfulStep || '',
    lastSubmittedField: session.onboarding?.lastSubmittedField || '',
    lastSubmittedValue: session.onboarding?.lastSubmittedValue || '',
    lastSubmittedAt: session.onboarding?.lastSubmittedAt || '',
    session,
  });

  const explicitCorrectedAnalysis = applyExplicitFieldCorrectionToAnalysis(analysis, { message, draft });
  const alignedAnalysis = alignOnboardingAnalysisToCollectingStep(explicitCorrectedAnalysis, { message, step, draft });

  if (session.onboarding?.status === 'sent') {
    if (isFieldMutationIntent(alignedAnalysis)) {
      return applySemanticFieldUpdate(session, alignedAnalysis, { draft, step, pendingCorrection });
    }

    const reply = resolveGroqOnboardingReply(analysis, { session, step, draft })
      || buildPostSentOnboardingReply(draft);

    return {
      reply,
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_post_sent',
        intent: analysis.intent || 'ASK_ONBOARDING_STATUS',
        onboardingStep: step,
        onboardingStatus: 'sent',
        missingRequiredFields,
        nextRequiredField: null,
        replySource: shouldPreferGroqReply(analysis) ? 'groq' : 'deterministic_post_sent',
      }),
    };
  }

  const conversationalGroqReply = resolveGroqOnboardingReply(analysis, { session, step, draft });
  const isConversationalIntent = [
    'CLARIFICATION',
    'SMALL_TALK',
    'INTERRUPTION',
    'USER_FRUSTRATION',
    'ASK_ONBOARDING_STATUS',
  ].includes(analysis.intent);

  if (conversationalGroqReply && isConversationalIntent && !isFieldMutationIntent(analysis)) {
    return {
      reply: conversationalGroqReply,
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_conversational',
        onboardingStep: step,
        onboardingStatus: session.onboarding?.status,
        missingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
        replySource: 'groq',
      }),
    };
  }

  if (
    !shouldPreferGroqReply(analysis)
    && analysis.confidence < ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD
    && !isFieldMutationIntent(analysis)
  ) {
    return {
      reply: buildLowConfidenceOnboardingReply(analysis, { step, draft }),
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_clarification',
        onboardingStep: step,
        onboardingStatus: session.onboarding?.status,
        clarificationRequired: true,
        missingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
      }),
    };
  }

  if (analysis.intent === 'LANGUAGE_SWITCH') {
    session.preferredLanguage = analysis.language || session.preferredLanguage;
    session.lastDetectedLanguage = analysis.language || session.lastDetectedLanguage;
    session.memoryUpdatedAt = new Date();
    await session.save();

    return {
      reply: `${buildLanguageSwitchReply(session.preferredLanguage)}\n\n${buildOnboardingResumePrompt(step, draft)}`,
      metadata: buildSemanticMetadata(analysis, {
        type: 'language_switch',
        intent: 'language_switch',
        topic: 'language',
        onboardingStep: step,
        onboardingStatus: session.onboarding?.status,
        missingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
      }),
    };
  }

  if (analysis.intent === 'PASSWORD_IN_CHAT' || PASSWORD_IN_CHAT_REGEX.test(message)) {
    return {
      reply: sanitizeChatReply(
        analysis.reply ||
        'For your security, I cannot collect passwords here. I will send a secure setup link to your email after we finish your account details.'
      ),
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_password_rejected',
        onboardingStep: step,
        onboardingStatus: session.onboarding?.status,
        missingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
      }),
    };
  }

  if (SEMANTIC_BUSINESS_INTENTS.has(analysis.intent)) {
    const businessInterruption = await handleOnboardingBusinessInterruption(session, message, {
      draft,
      step,
      sessionId,
      language,
      wantsPriceList,
      semanticIntent: analysis.intent,
      semanticConfidence: analysis.confidence,
    });
    if (businessInterruption) {
      return {
        ...businessInterruption,
        metadata: {
          ...(businessInterruption.metadata || {}),
          ...buildSemanticMetadata(analysis, {
            type: businessInterruption.metadata?.type || 'account_onboarding_business_interruption',
            onboardingStep: step,
            onboardingStatus: session.onboarding?.status,
            missingRequiredFields,
            nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
          }),
        },
      };
    }
  }

  if (analysis.intent === 'ASK_ONBOARDING_STATUS') {
    const reply = resolveGroqOnboardingReply(analysis, { session, step, draft })
      || sanitizeChatReply(buildOnboardingStatusReply({ message, step, draft }));

    return {
      reply,
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_interruption',
        onboardingStep: step,
        onboardingStatus: session.onboarding?.status,
        missingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
        replySource: shouldPreferGroqReply(analysis) ? 'groq' : 'deterministic',
      }),
    };
  }

  if (shouldRetryOnboardingBackendProcess(analysis, session)) {
    return retryOnboardingBackendProcess(session, analysis, { draft, step });
  }

  if (SEMANTIC_UPDATE_INTENTS.has(alignedAnalysis.intent) || SEMANTIC_CONFIRM_INTENTS.has(alignedAnalysis.intent) || alignedAnalysis.field) {
    return applySemanticFieldUpdate(session, alignedAnalysis, { draft, step, pendingCorrection });
  }

  if (analysis.intent === 'SMALL_TALK' || analysis.intent === 'INTERRUPTION' || analysis.intent === 'USER_FRUSTRATION') {
    const reply = resolveGroqOnboardingReply(analysis, { session, step, draft })
      || sanitizeChatReply(
        appendOnboardingResumeIfNeeded(
          analysis.reply || analysis.replySuggestion || 'Of course — I am here to help with your AutoSPF+ account setup.',
          { session, step, draft }
        )
      );

    return {
      reply,
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_interruption',
        onboardingStep: step,
        onboardingStatus: session.onboarding?.status,
        missingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
        replySource: shouldPreferGroqReply(analysis) ? 'groq' : 'deterministic',
      }),
    };
  }

  if (shouldPreferGroqReply(analysis) && !isFieldMutationIntent(analysis)) {
    return {
      reply: resolveGroqOnboardingReply(analysis, { session, step, draft }),
      metadata: buildSemanticMetadata(analysis, {
        type: 'account_onboarding_conversational',
        onboardingStep: step,
        onboardingStatus: session.onboarding?.status,
        missingRequiredFields,
        nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
        replySource: 'groq',
      }),
    };
  }

  return {
    reply: buildLowConfidenceOnboardingReply(
      { ...analysis, clarificationQuestion: analysis.clarificationQuestion || 'What would you like me to correct?' },
      { step, draft }
    ),
    metadata: buildSemanticMetadata(analysis, {
      type: 'account_onboarding_clarification',
      onboardingStep: step,
      onboardingStatus: session.onboarding?.status,
      clarificationRequired: true,
      missingRequiredFields,
      nextRequiredField: STEP_TO_SEMANTIC_FIELD[step] || undefined,
    }),
  };
};

const analyzeAccountCreateIntent = async (session, message, {
  language = 'english',
  recentMessages = [],
} = {}) => {
  if (isGreetingMessage(message) || !hasExplicitRegistrationIntent(message)) {
    return { matched: false, source: 'intent_gate', analysis: null };
  }

  const draft = getOnboardingDraft(session);
  const missingRequiredFields = getOnboardingMissingFields(draft);
  const analysis = await analyzeOnboardingMessage({
    message,
    step: getNextOnboardingStep(draft) || 'firstName',
    draft,
    collectedFields: buildCollectedOnboardingFields(draft),
    missingRequiredFields,
    businessContext: await buildOnboardingBusinessContext(session),
    preferredLanguage: language || session.preferredLanguage || session.lastDetectedLanguage || 'english',
    lastTopic: session.lastTopic,
    lastIntent: session.lastIntent,
    recentMessages,
    onboardingStatus: 'idle',
    lastBackendError: '',
  });

  return {
    matched: analysis.intent === 'CREATE_ACCOUNT'
      && analysis.confidence >= ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD,
    source: analysis.source || 'groq',
    analysis,
  };
};

const trackerPhoneMatches = (providedPhone, order) => {
  const provided = canonicalTrackerPhone(providedPhone);
  if (!provided) return false;

  const candidates = [
    order?.customerPhone,
    typeof order?.customer === 'object' ? order.customer?.phone : '',
  ].map(canonicalTrackerPhone).filter(Boolean);

  return candidates.some((candidate) => candidate === provided);
};

const normalizeTrackerReference = (value = '') =>
  String(value || '').trim().replace(/\s+/g, '').toUpperCase();

const buildTrackerReferenceMatchers = (reference) => {
  const normalizedReference = normalizeTrackerReference(reference);
  const compact = normalizedReference.replace(/[^A-Z0-9]/g, '');
  const matchers = [
    { bookingReference: { $regex: `^${escapeRegex(normalizedReference)}$`, $options: 'i' } },
    { orderNumber: { $regex: `^${escapeRegex(normalizedReference)}$`, $options: 'i' } },
  ];

  const aspfMatch = compact.match(/^ASPF(\d{6})([A-Z0-9]{3,8})$/i);
  if (aspfMatch) {
    matchers.push({
      bookingReference: {
        $regex: `^ASPF[-\\s]?${escapeRegex(aspfMatch[1])}[-\\s]?${escapeRegex(aspfMatch[2])}$`,
        $options: 'i',
      },
    });
  }

  const orderMatch = compact.match(/^ORD(\d{6,})$/i);
  if (orderMatch) {
    matchers.push({
      orderNumber: {
        $regex: `^ORD[-\\s]?${escapeRegex(orderMatch[1])}$`,
        $options: 'i',
      },
    });
  }

  return matchers;
};

const resolveTrackerStage = (order) => {
  const raw = String(order?.serviceTrackingStage || order?.status || order?.customerStatus || 'confirmed')
    .trim()
    .toLowerCase();
  return TRACKER_STAGE_ALIASES[raw] || 'confirmed';
};

const buildTrackerProgress = (stage) => {
  const idx = TRACKER_STEPS.findIndex((step) => step.key === stage);
  const safeIdx = idx >= 0 ? idx : 0;
  const percent = Math.round((safeIdx / (TRACKER_STEPS.length - 1)) * 100);
  return { currentStageLabel: TRACKER_STEPS[safeIdx]?.label || TRACKER_STEPS[0].label, progressPercent: percent };
};

const buildPublicTrackerSummary = (orderDoc) => {
  const order = typeof orderDoc?.toObject === 'function'
    ? orderDoc.toObject({ virtuals: true })
    : orderDoc;

  const serviceName =
    order.serviceName ||
    order.serviceType ||
    order.items?.[0]?.product?.name ||
    'AutoSPF+ service';

  const vehicleLabel = [
    order.vehicleYear,
    order.vehicleMake,
    order.vehicleModel,
  ].filter(Boolean).join(' ').trim() || 'Your vehicle';

  const vehicleMeta = [vehicleLabel, order.vehicleColor].filter(Boolean).join(' / ');
  const scheduleLabel = [order.bookingDate, order.bookingTime].filter(Boolean).join(' · ') || 'Schedule syncing';
  const stage = resolveTrackerStage(order);
  const { currentStageLabel, progressPercent } = buildTrackerProgress(stage);

  return {
    bookingReference: order.bookingReference || order.orderNumber || '',
    serviceName,
    vehicleLabel: vehicleMeta,
    scheduleLabel,
    status: order.status || '',
    serviceTrackingStage: stage,
    currentStageLabel,
    progressPercent,
    updatedAt: order.serviceTrackingUpdatedAt || order.updatedAt || order.createdAt || null,
    trackerStageMedia: Array.isArray(order.trackerStageMedia)
      ? order.trackerStageMedia.map((entry) => ({
          stage: entry.stage || '',
          slot: entry.slot || '',
          photoUrl: entry.photoUrl || '',
          description: entry.description || '',
          uploadedAt: entry.uploadedAt || null,
        }))
      : [],
    serviceStaffAssignments: Array.isArray(order.serviceStaffAssignments)
      ? order.serviceStaffAssignments
          .filter((entry) => entry?.name)
          .map((entry) => ({
            slot: entry.slot || '',
            name: entry.name || '',
            role: entry.role || '',
          }))
      : [],
  };
};

const loadPublicTrackerOrderByReference = async (reference) => {
  const normalizedReference = normalizeTrackerReference(reference);
  if (!normalizedReference) return null;

  return Order.findOne({
    $or: buildTrackerReferenceMatchers(normalizedReference),
  })
    .populate('customer', 'name phone')
    .populate('items.product', 'name')
    .select(
      '_id orderNumber bookingReference customer customerName customerPhone serviceType items.product ' +
      'status customerStatus serviceTrackingStage serviceTrackingUpdatedAt serviceStaffAssignments trackerStageMedia ' +
      'vehicleYear vehicleMake vehicleModel vehicleColor bookingDate bookingTime archived createdAt updatedAt'
    );
};

const loadPublicTrackerOrderById = async (orderId) =>
  Order.findById(orderId)
    .populate('customer', 'name phone')
    .populate('items.product', 'name')
    .select(
      '_id orderNumber bookingReference customer customerName customerPhone serviceType items.product ' +
      'status customerStatus serviceTrackingStage serviceTrackingUpdatedAt serviceStaffAssignments trackerStageMedia ' +
      'vehicleYear vehicleMake vehicleModel vehicleColor bookingDate bookingTime archived createdAt updatedAt'
    );

const signPublicTrackerToken = (order) =>
  jwt.sign(
    {
      purpose: TRACKER_TOKEN_PURPOSE,
      orderId: order._id?.toString?.() || String(order._id),
    },
    config.jwtSecret,
    { expiresIn: TRACKER_TOKEN_EXPIRES_IN }
  );

const FAQS = [
  {
    q: 'How do I book?',
    a: 'On the website: tap Book Now (or Services → choose package). Add vehicle type and details, pick a date, then confirm. You can also log in first so your garage is saved.',
  },
  {
    q: 'How do I log in?',
    a: 'Use Login in the top navigation. New customers choose Register, then sign in to open the dashboard (bookings, tracker, garage).',
  },
  {
    q: 'Where are you located?',
    a: 'Marcos Alvarez Ave., Las Piñas City. See the Contact page for map and details.',
  },
  {
    q: 'How long does coating take?',
    a: 'SPF 80 about 2–3 hours; SPF 89 about 3–4 hours; SPF 99/101 about 4–8 hours depending on vehicle and prep.',
  },
];

const shouldIncludeInventoryData = (message = '') =>
  /\b(stock|inventory|available|availability|units|supplies|material)\b/i.test(message);

const buildKnowledgeBase = async (preferredVehicleKey = null, { includeInventory = false } = {}) => {
  const cacheKey = `${preferredVehicleKey || 'all'}:${includeInventory ? 'inventory' : 'no-inventory'}`;
  const cached = knowledgeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [spfPricingSummary, otherServicesSummary, products, services] = await Promise.all([
    buildSpfPricingKnowledge(preferredVehicleKey),
    buildOtherServicesSummary(),
    includeInventory
      ? Product.find({ isActive: true }).select('name inventory minLevel').lean()
      : Promise.resolve([]),
    Service.find({ status: 'Active' }).select('name basePrice category duration').lean(),
  ]);

  const serviceSummary = [spfPricingSummary, otherServicesSummary].filter(Boolean).join('\n\n');

  const inventorySummary = products
    .slice(0, 50)
    .map((p) => `${p.name}: ${p.inventory ?? 0} units${p.minLevel ? ` (min ${p.minLevel})` : ''}`)
    .join('\n');

  const faqSummary = FAQS.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n');

  const value = { services, products, serviceSummary, inventorySummary, faqSummary };
  knowledgeCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CHAT_KNOWLEDGE_CACHE_TTL_MS,
  });
  return value;
};

const buildCachedCompletePriceListReply = async () => {
  if (priceListCache && priceListCache.expiresAt > Date.now()) {
    return priceListCache.value;
  }
  const value = await buildCompleteServicePriceListReply();
  priceListCache = {
    value,
    expiresAt: Date.now() + CHAT_KNOWLEDGE_CACHE_TTL_MS,
  };
  return value;
};

const byLanguage = (language, variants) => variants[language] || variants.english;

const DAY_LABELS = [
  ['monday', 'Mon'],
  ['tuesday', 'Tue'],
  ['wednesday', 'Wed'],
  ['thursday', 'Thu'],
  ['friday', 'Fri'],
  ['saturday', 'Sat'],
  ['sunday', 'Sun'],
];

const formatClock = (value) => {
  const raw = String(value || '').trim();
  if (!raw || /^closed$/i.test(raw)) return 'Closed';
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour)) return raw;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour %= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${suffix}`;
};

const normalizeDayHours = (day = {}) => {
  const open = day.open ?? day.from;
  const close = day.close ?? day.to;
  const isClosed =
    day.isOpen === false ||
    /^closed$/i.test(String(open || '')) ||
    /^closed$/i.test(String(close || '')) ||
    !open ||
    !close;

  if (isClosed) return 'Closed';
  return `${formatClock(open)}-${formatClock(close)}`;
};

const formatHoursSummary = (hours = {}) => {
  const rows = DAY_LABELS.map(([key, label]) => ({
    key,
    label,
    value: normalizeDayHours(hours[key]),
  }));

  const groups = [];
  rows.forEach((row) => {
    const previous = groups[groups.length - 1];
    if (previous && previous.value === row.value) {
      previous.end = row.label;
    } else {
      groups.push({ start: row.label, end: row.label, value: row.value });
    }
  });

  return groups
    .map((group) => `${group.start}${group.end !== group.start ? `-${group.end}` : ''}: ${group.value}`)
    .join('; ');
};

const isPlaceholderPhone = (value = '') => /\(555\)|000-0000/.test(String(value));
const isPlaceholderEmail = (value = '') => /^admin@autospf\.com$/i.test(String(value || '').trim());

const loadChatBusinessFacts = async () => {
  const [settings, businessSettings] = await Promise.all([
    Setting.findOne()
      .select('contactEmail phoneNumber address operatingHours')
      .lean()
      .catch(() => null),
    BusinessSettings.getSettings().catch(() => null),
  ]);

  const phone = settings?.phoneNumber && !isPlaceholderPhone(settings.phoneNumber)
    ? settings.phoneNumber
    : COMPANY_BRANDING.phone;
  const email = settings?.contactEmail && !isPlaceholderEmail(settings.contactEmail)
    ? settings.contactEmail
    : COMPANY_BRANDING.email;
  const address = settings?.address || COMPANY_BRANDING.address;
  const hours = businessSettings?.openingHours || settings?.operatingHours || {};

  return {
    phone,
    email,
    address,
    hoursSummary: formatHoursSummary(hours),
  };
};

const resolveVehicleDisplayLabel = ({ session = {}, vehicleContextKey = null, vehicleProfile = null } = {}) =>
  vehicleProfile?.label ||
  session?.lastVehicleLabel ||
  (vehicleContextKey ? getVehicleLabel(vehicleContextKey) : '');

const buildPricingDirectReply = async ({ language, vehicleContextKey, wantsPriceList, session, vehicleProfile }) => {
  if (wantsPriceList) {
    return buildCachedCompletePriceListReply();
  }

  if (vehicleContextKey) {
    const pricing = await buildSpfPricingKnowledge(vehicleContextKey);
    const displayLabel = resolveVehicleDisplayLabel({ session, vehicleContextKey, vehicleProfile }) || getVehicleLabel(vehicleContextKey);
    return [
      byLanguage(language, {
        english: `Here are the current SPF package prices for ${displayLabel}:`,
        tagalog: `Ito ang current SPF package prices for ${displayLabel}:`,
        taglish: `Here are the current SPF package prices for ${displayLabel}:`,
      }),
      pricing,
      '',
      byLanguage(language, {
        english: 'If you want, I can also help compare SPF 80, 89, 99, and 101 for your goal.',
        tagalog: 'Pwede rin kitang tulungan i-compare ang SPF 80, 89, 99, at 101 para sa goal mo.',
        taglish: 'I can also help you compare SPF 80, 89, 99, and 101 for your goal.',
      }),
    ].join('\n');
  }

  return byLanguage(language, {
    english:
      'I can quote the right AutoSPF+ package. What vehicle type do you have: hatchback, sedan, midsized, SUV, pick up, large SUV/van, or highend sedan?',
    tagalog:
      'Para maibigay ko ang tamang AutoSPF+ price, anong vehicle type mo: hatchback, sedan, midsized, SUV, pick up, large SUV/van, o highend sedan?',
    taglish:
      'I can quote the right AutoSPF+ package. Anong vehicle type mo: hatchback, sedan, midsized, SUV, pick up, large SUV/van, or highend sedan?',
  });
};

const buildPackageRecommendationReply = ({ language, vehicleContextKey, session }) => {
  const vehicleLabel = resolveVehicleDisplayLabel({ session, vehicleContextKey });
  const goal = session?.lastProtectionGoal || '';
  const serviceInterest = session?.lastServiceInterest || '';

  if (!vehicleContextKey && !vehicleLabel) {
    return byLanguage(language, {
      english:
        'I can recommend the right AutoSPF+ package. What vehicle do you have, and is your priority daily gloss, scratch protection, tint, or maximum long-term protection?',
      tagalog:
        'Pwede kitang marecommendan ng tamang AutoSPF+ package. Anong vehicle mo, at priority mo ba daily gloss, scratch protection, tint, o maximum long-term protection?',
      taglish:
        'I can recommend the right AutoSPF+ package. Anong vehicle mo, and priority mo ba daily gloss, scratch protection, tint, or maximum long-term protection?',
    });
  }

  const target = vehicleLabel || getVehicleLabel(vehicleContextKey);
  const contextLine = [serviceInterest, goal].filter(Boolean).join(' / ');

  return byLanguage(language, {
    english:
      `For your ${target}, I would shortlist these AutoSPF+ packages:\n` +
      '• SPF 89 if you want strong daily gloss and 5-year protection.\n' +
      '• SPF 99 if you want a more premium 10-year coating finish.\n' +
      '• SPF 101 if you want the all-in setup with PPF, ceramic coating, tint, and undercoating.\n' +
      `${contextLine ? `Based on your interest in ${contextLine}, SPF 99 or SPF 101 is the stronger fit.` : 'Tell me your budget and protection goal and I will narrow it to one package.'}`,
    tagalog:
      `For your ${target}, ito ang shortlist ko:\n` +
      '• SPF 89 kung daily gloss at 5-year protection ang goal.\n' +
      '• SPF 99 kung mas premium 10-year coating finish ang gusto mo.\n' +
      '• SPF 101 kung all-in setup ang hanap: PPF, ceramic coating, tint, at undercoating.\n' +
      `${contextLine ? `Dahil interested ka sa ${contextLine}, mas bagay ang SPF 99 or SPF 101.` : 'Sabihin mo budget at protection goal mo para ma-narrow ko sa isang package.'}`,
    taglish:
      `For your ${target}, ito ang shortlist ko:\n` +
      '• SPF 89 for strong daily gloss and 5-year protection.\n' +
      '• SPF 99 for a more premium 10-year coating finish.\n' +
      '• SPF 101 for the all-in setup with PPF, ceramic coating, tint, and undercoating.\n' +
      `${contextLine ? `Based sa interest mo in ${contextLine}, SPF 99 or SPF 101 ang stronger fit.` : 'Tell me your budget and protection goal para ma-narrow ko to one package.'}`,
  });
};

const buildPackageComparisonReply = ({ language }) =>
  byLanguage(language, {
    english:
      'Quick AutoSPF+ package comparison:\n' +
      '• SPF 80: essential graphene ceramic protection, 3 years.\n' +
      '• SPF 89: stronger daily package, 5 years, with maintenance value.\n' +
      '• SPF 99: premium SONAX coating finish, 10 years.\n' +
      '• SPF 101: flagship all-in package with PPF, SONAX coating, nano ceramic tint, and undercoating.\n' +
      'Tell me your vehicle type and I can price the best fit.',
    tagalog:
      'Quick AutoSPF+ package comparison:\n' +
      '• SPF 80: essential graphene ceramic protection, 3 years.\n' +
      '• SPF 89: stronger daily package, 5 years, with maintenance value.\n' +
      '• SPF 99: premium SONAX coating finish, 10 years.\n' +
      '• SPF 101: flagship all-in with PPF, SONAX coating, nano ceramic tint, at undercoating.\n' +
      'Sabihin mo vehicle type mo para ma-price ko ang best fit.',
    taglish:
      'Quick AutoSPF+ package comparison:\n' +
      '• SPF 80: essential graphene ceramic protection, 3 years.\n' +
      '• SPF 89: stronger daily package, 5 years, with maintenance value.\n' +
      '• SPF 99: premium SONAX coating finish, 10 years.\n' +
      '• SPF 101: flagship all-in with PPF, SONAX coating, nano ceramic tint, and undercoating.\n' +
      'Tell me your vehicle type para ma-price ko ang best fit.',
  });

const buildServiceInfoReply = ({ language, session }) => {
  const interest = String(session?.lastServiceInterest || '').toLowerCase();

  if (interest.includes('ppf')) {
    return byLanguage(language, {
      english:
        'PPF is the strongest option for physical paint protection against road debris, scratches, and high-impact areas. AutoSPF+ offers full-body PPF options, and SPF 101 includes PPF with coating, tint, and undercoating.',
      tagalog:
        'PPF ang strongest option para sa physical paint protection laban sa road debris, scratches, at high-impact areas. May full-body PPF options ang AutoSPF+, at kasama ito sa SPF 101 all-in package.',
      taglish:
        'PPF is the strongest option for physical paint protection against road debris, scratches, and high-impact areas. May full-body PPF options ang AutoSPF+, and SPF 101 includes PPF with coating, tint, and undercoating.',
    });
  }

  if (interest.includes('tint')) {
    return byLanguage(language, {
      english:
        'Nano Ceramic Window Tint helps with heat rejection, privacy, and cabin comfort. It can be paired with SPF packages where available, or included in the SPF 101 all-in setup.',
      tagalog:
        'Nano Ceramic Window Tint helps sa heat rejection, privacy, at cabin comfort. Pwede itong i-pair sa SPF packages where available, or kasama sa SPF 101 all-in setup.',
      taglish:
        'Nano Ceramic Window Tint helps with heat rejection, privacy, and cabin comfort. Pwede siya with SPF packages where available, or included sa SPF 101 all-in setup.',
    });
  }

  if (interest.includes('detail')) {
    return byLanguage(language, {
      english:
        'Detailing refreshes the vehicle inside and out, while coating/PPF adds longer-term protection. If the paint has swirls or oxidation, detailing or paint correction before coating gives a cleaner finish.',
      tagalog:
        'Detailing refreshes the vehicle inside and out, habang coating/PPF ang long-term protection. Kung may swirls or oxidation, mas maganda ang detailing or paint correction before coating.',
      taglish:
        'Detailing refreshes the vehicle inside and out, while coating/PPF adds longer-term protection. If may swirls or oxidation, detailing or paint correction before coating gives a cleaner finish.',
    });
  }

  return byLanguage(language, {
    english:
      'For vehicle protection, AutoSPF+ focuses on ceramic coating, PPF, tint, detailing, and SPF packages. Ceramic adds gloss and hydrophobic protection; PPF adds stronger physical impact protection.',
    tagalog:
      'For vehicle protection, focus ng AutoSPF+ ang ceramic coating, PPF, tint, detailing, at SPF packages. Ceramic adds gloss and hydrophobic protection; PPF adds stronger physical impact protection.',
    taglish:
      'For vehicle protection, AutoSPF+ focuses on ceramic coating, PPF, tint, detailing, and SPF packages. Ceramic adds gloss and hydrophobic protection; PPF adds stronger physical impact protection.',
  });
};

const buildServiceComparisonReply = ({ language }) =>
  byLanguage(language, {
    english:
      'Ceramic coating and PPF protect in different ways: ceramic coating gives gloss, hydrophobic behavior, and easier maintenance; PPF adds stronger physical protection against scratches, chips, and road debris. For maximum protection, SPF 101 combines PPF with coating, tint, and undercoating.',
    tagalog:
      'Magkaiba ang protection ng ceramic coating at PPF: ceramic gives gloss, hydrophobic behavior, at easier maintenance; PPF adds stronger physical protection against scratches, chips, at road debris. For maximum protection, SPF 101 combines PPF with coating, tint, at undercoating.',
    taglish:
      'Ceramic coating and PPF protect differently: ceramic gives gloss, hydrophobic behavior, and easier maintenance; PPF adds stronger physical protection against scratches, chips, and road debris. For maximum protection, SPF 101 combines PPF with coating, tint, and undercoating.',
  });

const buildMaintenanceReply = ({ language }) =>
  byLanguage(language, {
    english:
      'For coating aftercare: avoid harsh chemicals, use pH-neutral shampoo, do not scrub aggressively, and keep up with maintenance visits when recommended. If your vehicle was newly coated, ask the studio for the curing window before the first wash.',
    tagalog:
      'For coating aftercare: iwasan ang harsh chemicals, gumamit ng pH-neutral shampoo, huwag mag-scrub aggressively, at sundin ang recommended maintenance visits. Kung bagong coated, ask the studio muna about curing window before first wash.',
    taglish:
      'For coating aftercare: avoid harsh chemicals, use pH-neutral shampoo, huwag mag-scrub aggressively, and keep up with maintenance visits when recommended. If bagong coated, ask the studio about the curing window before first wash.',
  });

const buildVehicleContextReply = ({ language, vehicleProfile }) => {
  const label = vehicleProfile?.label || 'your vehicle';
  return byLanguage(language, {
    english: `Got it — I will remember ${label}. I can recommend SPF packages, ceramic coating, PPF, tint, or detailing based on your protection goal.`,
    tagalog: `Got it — tatandaan ko ang ${label}. Pwede kitang marecommendan ng SPF packages, ceramic coating, PPF, tint, or detailing based sa protection goal mo.`,
    taglish: `Got it — I will remember ${label}. I can recommend SPF packages, ceramic coating, PPF, tint, or detailing based sa protection goal mo.`,
  });
};

const buildDirectAnswerReply = async ({
  intentInfo,
  language,
  vehicleContextKey,
  wantsPriceList,
  session,
  vehicleProfile,
}) => {
  if (!intentInfo) return null;

  const facts = ['location', 'contact', 'hours'].includes(intentInfo.intent)
    ? await loadChatBusinessFacts()
    : null;

  if (intentInfo.intent === 'location') {
    return {
      reply: byLanguage(language, {
        english: `We're located at ${facts.address}.`,
        tagalog: `Nasa ${facts.address} kami.`,
        taglish: `Nasa ${facts.address} kami.`,
      }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'hours') {
    return {
      reply: byLanguage(language, {
        english: `Our studio hours are ${facts.hoursSummary || 'currently being confirmed'}. For holiday closures, please check before visiting.`,
        tagalog: `Ang studio hours namin ay ${facts.hoursSummary || 'kino-confirm pa ngayon'}. For holiday closures, mag-check muna bago pumunta.`,
        taglish: `Our studio hours are ${facts.hoursSummary || 'currently being confirmed'}. For holiday closures, check muna before visiting.`,
      }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'contact') {
    return {
      reply: byLanguage(language, {
        english: `You can contact AutoSPF+ at ${facts.phone} or ${facts.email}.`,
        tagalog: `Pwede mong i-contact ang AutoSPF+ sa ${facts.phone} o ${facts.email}.`,
        taglish: `You can contact AutoSPF+ at ${facts.phone} or ${facts.email}.`,
      }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'services') {
    return {
      reply: byLanguage(language, {
        english:
          'AutoSPF+ offers Sonax SPF 80, 89, 99, and 101 protection packages, plus PPF, ceramic coating, window tint, detailing, undercoating, repainting, and PDR. Tell me your vehicle type and goal so I can recommend the best fit.',
        tagalog:
          'May Sonax SPF 80, 89, 99, at 101 protection packages kami, plus PPF, ceramic coating, window tint, detailing, undercoating, repainting, at PDR. Sabihin mo lang vehicle type at goal mo para marecommend ko ang best fit.',
        taglish:
          'AutoSPF+ offers Sonax SPF 80, 89, 99, and 101 protection packages, plus PPF, ceramic coating, window tint, detailing, undercoating, repainting, and PDR. Tell me your vehicle type and goal para marecommend ko ang best fit.',
      }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'service_info') {
    return {
      reply: buildServiceInfoReply({ language, session }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'service_comparison') {
    return {
      reply: buildServiceComparisonReply({ language }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'maintenance') {
    return {
      reply: buildMaintenanceReply({ language }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'package_comparison') {
    return {
      reply: buildPackageComparisonReply({ language }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'package_recommendation') {
    return {
      reply: buildPackageRecommendationReply({ language, vehicleContextKey, session }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'vehicle_context' && vehicleProfile) {
    return {
      reply: buildVehicleContextReply({ language, vehicleProfile }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'payment_issue') {
    return {
      reply: byLanguage(language, {
        english:
          'I can help with AutoSPF+ payment concerns. Please share your booking reference, payment method, and what went wrong so we can trace it properly.',
        tagalog:
          'Tutulungan kita sa AutoSPF+ payment concern. Send mo booking reference, payment method, at kung ano ang naging issue para ma-trace natin nang maayos.',
        taglish:
          'I can help with AutoSPF+ payment concerns. Send your booking reference, payment method, and what went wrong para ma-trace natin properly.',
      }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'booking') {
    return {
      reply: byLanguage(language, {
        english:
          'You can book by choosing a service package, adding your vehicle details, picking an available schedule, then confirming the appointment. Tell me which service you want and I can guide the next step.',
        tagalog:
          'Pwede kang mag-book by choosing a service package, adding vehicle details, picking an available schedule, then confirming. Sabihin mo kung anong service ang gusto mo and I will guide you.',
        taglish:
          'You can book by choosing a service package, adding your vehicle details, picking an available schedule, then confirming. Tell me which service you want and I can guide the next step.',
      }),
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'tracker') {
    return {
      reply: TRACKER_REFERENCE_PROMPT,
      action: { type: 'tracker_prompt' },
      metadata: intentInfo,
    };
  }

  if (intentInfo.intent === 'pricing') {
    return {
      reply: await buildPricingDirectReply({ language, vehicleContextKey, wantsPriceList, session, vehicleProfile }),
      metadata: intentInfo,
    };
  }

  return null;
};

const resolveVehicleContext = async (sessionId, currentMessage, session = null) => {
  const fromProfile = detectVehicleProfileFromMessage(currentMessage);
  if (fromProfile?.vehicleType) return fromProfile.vehicleType;

  const fromCurrent = detectVehicleTypeFromMessage(currentMessage);
  if (fromCurrent) return fromCurrent.apiKey;
  if (session?.lastVehicleType) return session.lastVehicleType;

  const recentUserMessages = await getRecentUserMessagesFast(sessionId, 4);
  for (const message of recentUserMessages) {
    const profile = detectVehicleProfileFromMessage(message);
    if (profile?.vehicleType) return profile.vehicleType;
    const detected = detectVehicleTypeFromMessage(message);
    if (detected) return detected.apiKey;
  }

  return null;
};

const emitAdminChatNotification = (payload) => {
  try {
    const io = getIO();
    io.to('admin:chat').emit('admin:chat', payload);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Socket.io not available for admin chat notification.');
    }
  }
};

const getRecentMessages = async (sessionId, limit = CHAT_HISTORY_LIMIT) => {
  const messages = await getCachedRecentMessages(sessionId, limit);
  let remaining = CHAT_HISTORY_CHAR_LIMIT;
  return messages
    .slice(-limit)
    .reverse()
    .filter((entry) => {
      const len = entry.content.length;
      if (remaining - len < 0) return false;
      remaining -= len;
      return true;
    })
    .reverse()
    .map(({ role, content }) => ({ role, content }));
};

const findServiceMatch = (services = [], message = '') => {
  const normalized = message.toLowerCase();
  let match = services.find((s) => normalized.includes(s.name.toLowerCase()));
  if (match) return match;

  if (normalized.includes('wash')) {
    match = services.find((s) => s.name.toLowerCase().includes('wash'));
  }
  if (!match && normalized.includes('detail')) {
    match = services.find((s) => s.name.toLowerCase().includes('detail'));
  }
  if (!match && normalized.includes('coating')) {
    match = services.find((s) => s.name.toLowerCase().includes('coating'));
  }
  if (!match && normalized.includes('ppf')) {
    match = services.find((s) => s.name.toLowerCase().includes('ppf'));
  }

  return match;
};

const buildAvailabilityHints = (message = '', products = []) => {
  const normalized = message.toLowerCase();
  const hints = [];

  AVAILABILITY_MAP.forEach((entry) => {
    if (!entry.keywords.some((keyword) => normalized.includes(keyword))) return;
    entry.productNames.forEach((productName) => {
      const product = products.find((p) => p.name?.toLowerCase() === productName.toLowerCase())
        || products.find((p) => p.name?.toLowerCase().includes(productName.toLowerCase()));
      if (!product) return;
      hints.push(`${product.name}: ${product.inventory ?? 0} units`);
    });
  });

  if (!hints.length) return '';
  return `Availability check (inventory): ${hints.join(' | ')}`;
};

const callGroq = async (messages, { onToken } = {}) => {
  const client = getGroqClient();
  if (!client) {
    return 'The AI assistant is not configured yet. Please set GROQ_API_KEY on the server.';
  }

  const request = {
    model: GROQ_MODEL,
    messages,
    temperature: 0.15,
    max_completion_tokens: GROQ_MAX_COMPLETION_TOKENS,
  };

  if (!onToken) {
    const response = await client.chat.completions.create(request);
    const raw = response.choices?.[0]?.message?.content?.trim();
    return sanitizeChatReply(raw || 'I can help with services, pricing, and bookings. What would you like to know?');
  }

  const stream = await client.chat.completions.create({
    ...request,
    stream: true,
  });

  let full = '';
  for await (const chunk of stream) {
    const token = chunk.choices?.[0]?.delta?.content || '';
    if (!token) continue;
    full += token;
    onToken(token);
  }

  return sanitizeChatReply(full || 'I can help with services, pricing, and bookings. What would you like to know?');
};

const buildCompactSystemPrompt = ({
  session,
  context,
  serviceSummary,
  inventorySummary,
  availabilityHints,
  faqSummary,
  vehicleContextKey,
}) => {
  const vehicleDirective = vehicleContextKey
    ? `Customer vehicle context: ${getVehicleLabel(vehicleContextKey)}. Quote only that vehicle type.`
    : 'If pricing is requested without a vehicle type, ask for vehicle type before quoting SPF package prices.';

  const appContext = compactJson(context);
  const memory = [
    session?.lastIntent ? `lastIntent=${session.lastIntent}` : '',
    session?.lastVehicleType ? `lastVehicle=${getVehicleLabel(session.lastVehicleType)}` : '',
    session?.lastVehicleLabel ? `vehicleLabel=${session.lastVehicleLabel}` : '',
    session?.lastServiceInterest ? `lastService=${session.lastServiceInterest}` : '',
    session?.lastPackageInterest ? `lastPackage=${session.lastPackageInterest}` : '',
    session?.lastProtectionGoal ? `lastProtectionGoal=${session.lastProtectionGoal}` : '',
    session?.lastTopic ? `lastTopic=${session.lastTopic}` : '',
    session?.lastAnsweredIntent ? `lastAnswered=${session.lastAnsweredIntent}` : '',
    session?.consecutiveFallbackCount ? `fallbackCount=${session.consecutiveFallbackCount}` : '',
    Number.isFinite(Number(session?.conversationContinuityScore))
      ? `continuity=${Number(session.conversationContinuityScore) || 0}`
      : '',
  ].filter(Boolean).join(', ') || 'none';

  return [
    'You are AutoSPF+ Concierge, a premium automotive business assistant. Stay strictly inside the AutoSPF+ ecosystem.',
    'Allowed topics: AutoSPF+ services, SPF/PPF, ceramic coating, detailing, tint, vehicle protection, maintenance, pricing, packages, package comparison, booking, account creation, tracker, location, payments, warranty, and shop support.',
    'For unrelated topics, do not answer deeply. Redirect naturally back to AutoSPF+ services, bookings, packages, pricing, vehicle protection, or shop assistance.',
    'Never say "Let me connect you with a specialist" unless the customer explicitly asks to speak with a human, agent, or live person.',
    'During onboarding, respect corrections, side questions, and then continue the account setup step. Mobile number is required for account creation.',
    'Treat short replies (okay, yes, hmm, wait, thinking, location kasi) as normal conversation — stay helpful and confident.',
    'Style: plain text only, no markdown, no emojis, calm premium SaaS tone, automotive-focused, max 70 words unless listing prices. Use • for lists. End with one clear next step.',
    `Language: respond in ${session?.preferredLanguage || session?.lastDetectedLanguage || 'english'} until the customer explicitly switches language. English, Tagalog, and Taglish are supported.`,
    vehicleDirective,
    'Never invent prices. Use PHP format like ₱15,000.',
    `Memory: ${memory}`,
    appContext ? `App context: ${appContext}` : '',
    `Pricing/services:\n${truncateText(serviceSummary || 'Pricing is updating. Ask the user to open Services.', 2200)}`,
    inventorySummary ? `Inventory if relevant:\n${truncateText(inventorySummary, 700)}` : '',
    availabilityHints || '',
    `FAQ:\n${truncateText(faqSummary, 600)}`,
  ].filter(Boolean).join('\n');
};

const processMessage = async ({
  sessionId,
  message,
  user,
  context = null,
  allowQuote = false,
  skipUserSave = false,
  onToken = null,
}) => {

  const trimmed = (message || '').trim();
  if (!sessionId || !trimmed) {
    return { reply: 'Please share a message so I can help.', leadRequired: false };
  }

  const session = await getCachedSession(sessionId, user);
  const languageSwitch = detectLanguageSwitch(trimmed);
  const detectedLanguage = detectMessageLanguage(trimmed);
  const activeLanguage = resolveConversationLanguage(session, trimmed);
  const currentIntent = inferIntent(trimmed);
  const vehicleProfile = detectVehicleProfileFromMessage(trimmed);
  const serviceSignal = detectServiceInterestFromMessage(trimmed);
  const packageSignal = detectPackageInterestFromMessage(trimmed);
  const protectionGoal = detectProtectionGoalFromMessage(trimmed);
  const wantsPriceList = isPriceListRequest(trimmed);
  const isGuest = !user?.id;
  const hasLead = !!session.leadName && !!session.leadPhone;
  updateSessionMemory(session, {
    intent: currentIntent,
    vehicleProfile,
    serviceInterest: serviceSignal?.service,
    packageInterest: packageSignal?.label,
    protectionGoal,
    bookingIntentAt: currentIntent === 'booking' ? new Date() : undefined,
    topic: serviceSignal?.topic || packageSignal?.label,
    preferredLanguage: languageSwitch?.language || session.preferredLanguage || activeLanguage,
    detectedLanguage,
  });

  if (!skipUserSave) {
    rememberChatMessage(sessionId, 'user', trimmed);
    saveChatMessageLater({
      sessionId,
      userId: user?.id,
      sender: 'user',
      message: trimmed,
    });
  }

  runChatSideEffect('create chat notification', async () => {
    const displayName = session.leadName || user?.email || 'Guest';
    const createdNotification = await Notification.create({
      title: 'Chat Message',
      message: `${displayName}: ${trimmed}`.slice(0, 240),
      type: 'chat',
      recipientRole: 'admin_family',
      metadata: { sessionId },
    });
    const shouldVoiceNotify = !user?.role || user?.role === 'customer';
    if (createdNotification && shouldVoiceNotify) {
      emitAdminChatNotification({
        id: createdNotification._id,
        title: createdNotification.title,
        message: createdNotification.message,
        type: createdNotification.type,
        isRead: createdNotification.isRead,
        createdAt: createdNotification.createdAt,
        metadata: createdNotification.metadata,
      });
    }
  });

  const recordAssistantReply = (reply, metadata = undefined) => {
    rememberChatMessage(sessionId, 'assistant', reply);
    saveChatMessageLater({
      sessionId,
      sender: 'assistant',
      message: reply,
      ...(metadata ? { metadata } : {}),
    });
  };

  const completeAssistantReply = (rawReply, metadata = {}, extra = {}) => {
    let reply = sanitizeChatReply(rawReply);
    const finalMetadata = {
      ...metadata,
      language: activeLanguage,
      detectedLanguage,
    };
    const dedupeResult = applyReplyDeduplication({
      reply,
      session,
      language: activeLanguage,
      dedupe: Boolean(finalMetadata.dedupable),
    });

    reply = sanitizeChatReply(dedupeResult.reply);
    if (dedupeResult.deduped) {
      finalMetadata.deduped = true;
    }

    updateConversationMemoryForReply(session, {
      reply,
      signature: dedupeResult.signature,
      metadata: finalMetadata,
      language: activeLanguage,
    });
    persistSessionLater(session, 'persist chat intelligence memory');
    recordAssistantReply(reply, finalMetadata);

    return { reply, metadata: finalMetadata, ...extra };
  };

  if (languageSwitch) {
    return completeAssistantReply(
      buildLanguageSwitchReply(languageSwitch.language),
      {
        type: 'language_switch',
        intent: 'language_switch',
        topic: 'language',
        confidence: 1,
      },
      { leadRequired: false }
    );
  }

  const unsupportedLanguage = detectUnsupportedLanguageRequest(trimmed);
  if (unsupportedLanguage) {
    return completeAssistantReply(
      buildUnsupportedLanguageReply(activeLanguage),
      {
        type: 'language_capability',
        intent: 'unsupported_language',
        topic: 'language',
        requestedLanguage: unsupportedLanguage.language,
        confidence: 0.96,
      },
      { leadRequired: false }
    );
  }

  if (isExplicitHumanHandoffRequest(trimmed)) {
    markSpecialistEscalationOffered(session);
    persistSessionLater(session, 'record explicit handoff prompt');

    runChatSideEffect('create handoff notification', async () => {
      const handoffNotification = await Notification.create({
        title: 'Chatbot Handoff Requested',
        message: SPECIALIST_ESCALATION_REPLY,
        type: 'chat',
        recipientRole: 'admin_family',
        metadata: { sessionId },
      });
      emitAdminChatNotification({
        id: handoffNotification._id,
        title: handoffNotification.title,
        message: handoffNotification.message,
        type: handoffNotification.type,
        isRead: handoffNotification.isRead,
        createdAt: handoffNotification.createdAt,
        metadata: handoffNotification.metadata,
      });
    });

    return completeAssistantReply(
      SPECIALIST_ESCALATION_REPLY,
      {
        type: 'handoff',
        intent: 'handoff',
        topic: 'support',
        reason: 'explicit_human_request',
      },
      {
        action: { type: 'handoff' },
        leadRequired: isGuest && !hasLead,
      }
    );
  }

  if (isOnboardingContext(session)) {
    const recentMessages = await getRecentMessages(sessionId, 6);
    const onboardingResult = await handleAccountOnboardingInput(session, trimmed, {
      sessionId,
      language: activeLanguage,
      wantsPriceList,
      recentMessages,
    });
    return completeAssistantReply(
      onboardingResult.reply,
      onboardingResult.metadata || { type: 'account_onboarding', topic: 'account' },
      { action: onboardingResult.action || null, leadRequired: false }
    );
  }

  const correction = detectSessionCorrection(trimmed);
  if (correction) {
    session[correction.field] = correction.value;
    if (correction.field === 'leadPhone') {
      session.leadCapturedAt = session.leadCapturedAt || new Date();
    }
    await session.save();
    cacheSession(session);

    return completeAssistantReply(
      buildCorrectionReply(correction, session),
      { type: 'correction', field: correction.field, topic: 'account' },
      { leadRequired: false }
    );
  }

  const isQuoteRequest = QUOTE_INTENT_REGEX.test(trimmed);
  const recentUserMessages = await getRecentUserMessagesFast(sessionId, 4);

  if (wantsPriceList) {
    return completeAssistantReply(
      await buildCachedCompletePriceListReply(),
      { type: 'direct_answer', intent: 'pricing', topic: 'pricing', confidence: 0.95 },
      { leadRequired: false }
    );
  }

  if (TRACKER_INTENT_REGEX.test(trimmed)) {
    return completeAssistantReply(
      TRACKER_REFERENCE_PROMPT,
      { type: 'direct_answer', intent: 'tracker', topic: 'tracker', confidence: 0.92 },
      { action: { type: 'tracker_prompt' }, leadRequired: false }
    );
  }

  const isCustomQuoteRequest =
    isQuoteRequest &&
    /\b(custom|personalized|send|share|prepare|quotation|formal|for\s+my\s+(car|vehicle)|pa[\s-]*quote|quote\s+for)\b/i.test(trimmed);

  if (isGuest && !hasLead && isCustomQuoteRequest && !allowQuote) {
    const leadPrompt = 'To send a custom quote, please share your name and mobile number.';
    session.pendingMessage = trimmed;
    session.pendingAt = new Date();
    await session.save();
    cacheSession(session);

    return completeAssistantReply(
      leadPrompt,
      { type: 'lead_required', intent: 'quote', topic: 'pricing' },
      { leadRequired: true }
    );
  }

  const accountIntent = await analyzeAccountCreateIntent(session, trimmed, {
    language: activeLanguage,
    recentMessages: await getRecentMessages(sessionId, 6),
  });
  if (accountIntent.matched) {
    const onboardingResult = user?.id
      ? {
          reply: 'You are already signed in to an AutoSPF+ account. I can help you book a service, check your tracker, or manage your vehicle garage from here.',
          metadata: { type: 'account_onboarding_authenticated' },
        }
      : await beginAccountOnboarding(session, {
          intentSource: accountIntent.source,
          analysis: accountIntent.analysis,
        });

    return completeAssistantReply(
      onboardingResult.reply,
      onboardingResult.metadata || { type: 'account_onboarding_started', topic: 'account' },
      { leadRequired: false }
    );
  }

  const escalationDecision = shouldEscalateToSpecialist({
    message: trimmed,
    session,
    recentUserMessages,
  });

  if (!escalationDecision.escalate && isStrongComplaintOrPaymentDispute(trimmed)) {
    return completeAssistantReply(
      buildComplaintSoftReply(),
      { type: 'complaint_soft', intent: 'complaint', topic: 'support' },
      { leadRequired: false }
    );
  }

  if (escalationDecision.escalate) {
    markSpecialistEscalationOffered(session);
    persistSessionLater(session, 'record handoff prompt');

    if (escalationDecision.reason === 'explicit_human_request') {
      runChatSideEffect('create handoff notification', async () => {
        const handoffNotification = await Notification.create({
          title: 'Chatbot Handoff Requested',
          message: SPECIALIST_ESCALATION_REPLY,
          type: 'chat',
          recipientRole: 'admin_family',
          metadata: { sessionId },
        });
        emitAdminChatNotification({
          id: handoffNotification._id,
          title: handoffNotification.title,
          message: handoffNotification.message,
          type: handoffNotification.type,
          isRead: handoffNotification.isRead,
          createdAt: handoffNotification.createdAt,
          metadata: handoffNotification.metadata,
        });
      });
    }

    return completeAssistantReply(
      SPECIALIST_ESCALATION_REPLY,
      {
        type: 'handoff',
        intent: 'handoff',
        topic: 'support',
        reason: escalationDecision.reason,
      },
      {
        action: { type: 'handoff' },
        leadRequired: escalationDecision.reason === 'explicit_human_request' && isGuest && !hasLead,
      }
    );
  }

  const includeInventory = shouldIncludeInventoryData(trimmed);
  const vehicleContextKey = await resolveVehicleContext(sessionId, trimmed, session);
  if (vehicleContextKey) {
    updateSessionMemory(session, { vehicleType: vehicleContextKey });
  }
  const { services, products, serviceSummary, inventorySummary, faqSummary } = await buildKnowledgeBase(
    vehicleContextKey,
    { includeInventory }
  );
  const availabilityHints = buildAvailabilityHints(trimmed, products);
  const matchedServiceInterest = findServiceMatch(services, trimmed);
  if (matchedServiceInterest?.name) {
    updateSessionMemory(session, { serviceInterest: matchedServiceInterest.name });
  }

  const history = await getRecentMessages(sessionId);
  const greetingIntent = isGreetingMessage(trimmed);
  const businessContext = await buildOnboardingBusinessContext(session).catch(() => ({}));
  const conversationalState = buildConversationalState({
    session,
    message: trimmed,
    recentMessages: history,
    user,
    language: activeLanguage,
    knowledge: { serviceSummary, faqSummary, businessContext },
    context,
  });

  if (greetingIntent) {
    const greetingState = buildGreetingConversationalState(conversationalState, {
      recentMessages: history,
    });

    let greetingReply = '';
    let greetingSource = 'groq_greeting';

    try {
      if (onToken) {
        const greetingMessages = buildGreetingGroqMessages(greetingState);
        greetingReply = await callGroq(greetingMessages, { onToken });
        greetingSource = 'groq_greeting_stream';
      } else {
        const greetingAi = await generateGroqGreetingReply(greetingState);
        if (greetingAi.success && greetingAi.reply) {
          greetingReply = greetingAi.reply;
          greetingSource = greetingAi.source;
        }
      }
    } catch (error) {
      console.error('Chatbot greeting Groq error:', error?.message || error);
      greetingReply = '';
      greetingSource = 'groq_greeting_error';
    }

    if (
      greetingReply
      && greetingState.welcome_already_sent
      && looksLikeFullWelcomeMessage(greetingReply)
    ) {
      greetingReply = buildMinimalGreetingFallback(greetingState);
      greetingSource = 'greeting_cooldown_guard';
    }

    if (!greetingReply) {
      greetingReply = buildMinimalGreetingFallback(greetingState);
      greetingSource = 'greeting_safe_fallback';
    }

    const { reply: cleanedGreeting, actionChips: greetingChips } = extractActionChipsFromReply(greetingReply);

    return completeAssistantReply(
      cleanedGreeting,
      {
        type: 'ai_greeting',
        intent: 'greeting',
        topic: 'general',
        confidence: 0.9,
        source: greetingSource,
        welcomeAlreadySent: Boolean(greetingState.welcome_already_sent),
        conversationMode: greetingState.conversation_mode,
      },
      { actionChips: greetingChips, leadRequired: false }
    );
  }

  const systemPrompt = [
    buildCompactSystemPrompt({
      session,
      context,
      serviceSummary,
      inventorySummary,
      availabilityHints,
      faqSummary,
      vehicleContextKey,
    }),
    `Structured conversation state (authoritative):\n${compactJson(conversationalState, PROMPT_CONTEXT_CHAR_LIMIT)}`,
    'Use the structured state for contextual reasoning before generic templates. Reply in natural plain text only.',
  ].join('\n\n');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  if (skipUserSave && (!history.length || history[history.length - 1]?.content !== trimmed)) {
    messages.push({ role: 'user', content: trimmed });
  }

  let reply = '';
  let replySource = 'groq_primary';

  try {
    if (onToken) {
      reply = await callGroq(messages, { onToken });
    } else {
      const primaryAi = await generatePrimaryConciergeReply(conversationalState);
      if (primaryAi.success && primaryAi.reply) {
        reply = primaryAi.reply;
        replySource = primaryAi.source;
      } else {
        reply = await callGroq(messages);
        replySource = primaryAi.source === 'not_configured' ? 'groq_legacy' : 'groq_legacy_retry';
      }
    }
  } catch (error) {
    const status = error?.status || error?.response?.status;
    replySource = 'groq_error';
    if (status === 429) {
      reply = 'Hello! This is a demo mode. I will be fully active once credits are added.';
    } else {
      console.error('Chatbot Groq error:', error?.message || error);
      reply = '';
    }
  }

  if (!reply) {
    const directIntent = detectDirectAnswerIntent(trimmed);
    const directVehicleContextKey = directIntent && ['pricing', 'package_recommendation', 'vehicle_context'].includes(directIntent.intent)
      ? await resolveVehicleContext(sessionId, trimmed, session)
      : null;
    const directAnswer = await buildDirectAnswerReply({
      intentInfo: directIntent,
      language: activeLanguage,
      vehicleContextKey: directVehicleContextKey,
      wantsPriceList,
      session,
      vehicleProfile,
    });

    if (directVehicleContextKey || vehicleProfile) {
      updateSessionMemory(session, { vehicleType: directVehicleContextKey, vehicleProfile });
    }

    if (directAnswer?.reply) {
      return completeAssistantReply(
        directAnswer.reply,
        {
          type: 'direct_answer',
          intent: directAnswer.metadata.intent,
          topic: directAnswer.metadata.topic,
          confidence: directAnswer.metadata.confidence,
          source: 'deterministic_fallback',
          vehicleType: directVehicleContextKey || undefined,
          vehicleLabel: vehicleProfile?.label || session.lastVehicleLabel || undefined,
          serviceInterest: session.lastServiceInterest || undefined,
          packageInterest: session.lastPackageInterest || undefined,
        },
        {
          action: directAnswer.action || null,
          leadRequired: false,
        }
      );
    }

    const casualReply = buildCasualConciergeReply(trimmed, { session, recentUserMessages });
    if (casualReply) {
      return completeAssistantReply(
        casualReply,
        { type: 'casual_conversation', topic: session.lastTopic || currentIntent, source: 'deterministic_fallback', dedupable: true },
        { leadRequired: false }
      );
    }

    if (!isAutoSpfScopeMessage(trimmed, recentUserMessages)) {
      const fallbackRecentlyUsed = isFallbackRecentlyUsed(session);
      return completeAssistantReply(
        buildBusinessScopeRedirectReply({
          language: activeLanguage,
          lastTopic: session.lastTopic,
          fallbackRecentlyUsed,
        }),
        {
          type: fallbackRecentlyUsed ? 'low_confidence' : 'fallback',
          intent: 'off_topic',
          topic: session.lastTopic || 'general',
          confidence: 0.2,
          source: 'deterministic_fallback',
          fallbackSuppressed: fallbackRecentlyUsed,
          dedupable: true,
        },
        { leadRequired: false }
      );
    }

    reply = buildChatAiFallbackReply();
    replySource = 'safe_fallback';
  }

  const { reply: cleanedReply, actionChips } = extractActionChipsFromReply(reply);
  reply = cleanedReply;

  if (session.pendingMessage) {
    session.pendingMessage = undefined;
    session.pendingAt = undefined;
    persistSessionLater(session, 'clear pending chat message');
  }

  const bookingIntent = BOOKING_INTENT_REGEX.test(trimmed);
  const matchedService = bookingIntent ? findServiceMatch(services, trimmed) : null;

  const action = bookingIntent
    ? {
        type: user?.id ? 'open_booking' : 'login_required',
        name: user?.name || session.leadName || undefined,
        serviceName: matchedService?.name,
      }
    : null;

  return completeAssistantReply(
    reply,
    {
      type: 'ai_conversation',
      intent: currentIntent,
      topic: matchedService?.name || session.lastServiceInterest || session.lastTopic || currentIntent,
      vehicleType: vehicleContextKey || session.lastVehicleType || undefined,
      vehicleLabel: session.lastVehicleLabel || undefined,
      serviceInterest: session.lastServiceInterest || undefined,
      packageInterest: session.lastPackageInterest || undefined,
      confidence: replySource === 'groq_primary' ? 0.88 : 0.65,
      source: replySource,
      conversationMode: conversationalState.conversation_mode,
    },
    { action, actionChips, leadRequired: false }
  );
};

const buildSessionPayload = (session) => ({
  sessionId: session.sessionId,
  conversationId: session.sessionId,
  leadName: session.leadName,
  leadEmail: session.leadEmail,
  leadPhone: session.leadPhone,
  preferredLanguage: session.preferredLanguage,
  lastDetectedLanguage: session.lastDetectedLanguage,
  lastIntent: session.lastIntent,
  lastTopic: session.lastTopic,
  lastAnsweredIntent: session.lastAnsweredIntent,
  lastVehicleType: session.lastVehicleType,
  lastVehicleMake: session.lastVehicleMake,
  lastVehicleModel: session.lastVehicleModel,
  lastVehicleLabel: session.lastVehicleLabel,
  lastServiceInterest: session.lastServiceInterest,
  lastPackageInterest: session.lastPackageInterest,
  lastProtectionGoal: session.lastProtectionGoal,
  lastBookingIntentAt: session.lastBookingIntentAt,
  conversationContinuityScore: session.conversationContinuityScore,
  onboarding: session.onboarding?.status ? {
    status: session.onboarding.status,
    step: session.onboarding.step,
    draft: {
      firstName: session.onboarding.draft?.firstName || '',
      lastName: session.onboarding.draft?.lastName || '',
      email: session.onboarding.draft?.email || '',
      phone: session.onboarding.draft?.phone || '',
    },
    missingRequiredFields: getOnboardingMissingFields(getOnboardingDraft(session)),
    nextRequiredField: session.onboarding.step
      ? STEP_TO_SEMANTIC_FIELD[session.onboarding.step]
      : getOnboardingMissingFields(getOnboardingDraft(session))[0] || undefined,
    correction: session.onboarding.correction || null,
    startedAt: session.onboarding.startedAt,
    completedAt: session.onboarding.completedAt,
    lastError: session.onboarding.lastError || '',
    lastSuccessfulStep: session.onboarding.lastSuccessfulStep || '',
    lastSubmittedField: session.onboarding.lastSubmittedField || '',
    lastSubmittedValue: session.onboarding.lastSubmittedValue || '',
    lastSubmittedAt: session.onboarding.lastSubmittedAt,
  } : null,
});

export const listConversations = async (req, res, next) => {
  try {
    const guestKey = String(req.query.guestKey || '').trim();
    const legacySessionId = String(req.query.legacySessionId || '').trim();
    const userId = req.user?.id;

    if (!userId && !guestKey) {
      return res.status(400).json({ success: false, message: 'Missing guestKey' });
    }

    let conversations = await listConversationsForCustomer({ userId, guestKey });

    if (!conversations.length && legacySessionId) {
      const adopted = await adoptLegacySessionAsConversation({
        legacySessionId,
        userId,
        guestKey,
        source: 'web',
      });
      if (adopted) {
        conversations = [adopted];
      }
    }

    res.json({
      success: true,
      conversations: conversations.map(serializeConversation),
    });
  } catch (error) {
    next(error);
  }
};

export const createConversation = async (req, res, next) => {
  try {
    const guestKey = String(req.body?.guestKey || '').trim();
    const source = String(req.body?.source || 'web').trim();
    const language = String(req.body?.language || 'english').trim().toLowerCase();
    const userId = req.user?.id;

    if (!userId && !guestKey) {
      return res.status(400).json({ success: false, message: 'Missing guestKey' });
    }

    const { conversation, welcomeMessage } = await createFreshConversation({
      userId,
      guestKey,
      source,
      language,
    });

    const session = await getCachedSession(conversation.conversationId, req.user, source);

    res.status(201).json({
      success: true,
      conversation: serializeConversation(conversation),
      session: buildSessionPayload(session),
      messages: serializeChatMessages([welcomeMessage]),
    });
  } catch (error) {
    next(error);
  }
};

export const getConversation = async (req, res, next) => {
  try {
    const conversationId = String(req.params.conversationId || '').trim();
    const guestKey = String(req.query.guestKey || '').trim();
    const userId = req.user?.id;

    if (!conversationId) {
      return res.status(400).json({ success: false, message: 'Missing conversationId' });
    }

    const conversation = await findConversationForAccess({ conversationId, userId, guestKey });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const session = await getCachedSession(conversationId, req.user, conversation.source);

    const messages = await ChatMessage.find({
      $or: [{ conversationId }, { sessionId: conversationId }],
    })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    chatHistoryCache.set(conversationId, {
      messages: messages.slice(-8).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: truncateText(m.message, 600),
        createdAt: m.createdAt,
      })),
      expiresAt: Date.now() + CHAT_SESSION_CACHE_TTL_MS,
    });

    res.json({
      success: true,
      conversation: serializeConversation(conversation),
      session: buildSessionPayload(session),
      messages: serializeChatMessages(messages),
    });
  } catch (error) {
    next(error);
  }
};

export const startSession = async (req, res, next) => {
  try {
    const sessionId = resolveThreadId(req.body || {});
    const { source } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Missing sessionId or conversationId' });
    }

    const session = await getCachedSession(sessionId, req.user, source);

    const messages = await ChatMessage.find({
      $or: [{ conversationId: sessionId }, { sessionId }],
    })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();
    chatHistoryCache.set(sessionId, {
      messages: messages.slice(-8).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: truncateText(m.message, 600),
        createdAt: m.createdAt,
      })),
      expiresAt: Date.now() + CHAT_SESSION_CACHE_TTL_MS,
    });

    res.json({
      success: true,
      session: buildSessionPayload(session),
      messages: serializeChatMessages(messages),
    });
  } catch (error) {
    next(error);
  }
};

export const saveLead = async (req, res, next) => {
  try {
    const sessionId = resolveThreadId(req.body || {});
    const { name, phone } = req.body || {};
    if (!sessionId || !name || !phone) {
      return res.status(400).json({ success: false, message: 'Missing conversationId, name, or phone' });
    }

    const session = await ChatSession.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          leadName: name,
          leadPhone: phone,
          leadCapturedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ success: false, message: 'Chat session not found' });
    }
    cacheSession(session);

    runChatSideEffect('create lead notification', async () => {
      const leadNotification = await Notification.create({
        title: 'New Lead Captured',
        message: `${name} (${phone}) requested a quote.`,
        type: 'chat',
        recipientRole: 'admin_family',
        metadata: { sessionId },
      });
      emitAdminChatNotification({
        id: leadNotification._id,
        title: leadNotification.title,
        message: leadNotification.message,
        type: leadNotification.type,
        isRead: leadNotification.isRead,
        createdAt: leadNotification.createdAt,
        metadata: leadNotification.metadata,
      });
    });

    let followUp = null;
    if (session.pendingMessage) {
      followUp = await processMessage({
        sessionId,
        message: session.pendingMessage,
        user: req.user,
        allowQuote: true,
        skipUserSave: true,
      });
    }

    res.json({
      success: true,
      message: 'Lead saved',
      reply: followUp?.reply,
      action: followUp?.action || null,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyPublicTracker = async (req, res, next) => {
  try {
    const { sessionId, bookingReference, phone } = req.body || {};
    const reference = normalizeTrackerReference(bookingReference);
    const providedPhone = String(phone || '').trim();

    if (!reference || !providedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please enter your booking reference and registered phone number.',
      });
    }

    const order = await loadPublicTrackerOrderByReference(reference);
    const verified = order && trackerPhoneMatches(providedPhone, order);

    if (!verified) {
      const safeReply = "We couldn't verify that booking. Please check the reference and registered phone number, or use Talk to a protection specialist below.";
      if (sessionId) {
        await ChatMessage.create({
          sessionId,
          sender: 'assistant',
          message: safeReply,
          metadata: { type: 'tracker_verification_failed' },
        }).catch(() => null);
      }

      return res.status(404).json({
        success: false,
        message: safeReply,
      });
    }

    const token = signPublicTrackerToken(order);
    const tracker = buildPublicTrackerSummary(order);
    const trackerUrl = `/track/${encodeURIComponent(token)}`;

    if (sessionId) {
      await ChatMessage.create({
        sessionId,
        sender: 'assistant',
        message: `Verified. Your AutoSPF+ tracker is currently at ${tracker.currentStageLabel}.`,
        metadata: { type: 'tracker_result' },
      }).catch(() => null);
    }

    return res.json({
      success: true,
      data: {
        token,
        trackerUrl,
        tracker,
        expiresInSeconds: 60 * 60,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicTracker = async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token) {
      return res.status(400).json({ success: false, message: 'Tracker token is required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'This tracker link is invalid or has expired. Please verify your booking again in chat.',
      });
    }

    if (decoded?.purpose !== TRACKER_TOKEN_PURPOSE || !decoded?.orderId) {
      return res.status(401).json({
        success: false,
        message: 'This tracker link is invalid or has expired. Please verify your booking again in chat.',
      });
    }

    const order = await loadPublicTrackerOrderById(decoded.orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Tracker not found. Please verify your booking again in chat.',
      });
    }

    return res.json({
      success: true,
      data: {
        tracker: buildPublicTrackerSummary(order),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const sessionId = resolveThreadId(req.body || {});
    const { message, context } = req.body || {};
    const result = await processMessage({ sessionId, message, user: req.user, context });
    const session = await ChatSession.findOne({ sessionId }).lean();
    res.json({
      success: true,
      ...result,
      ...(session ? { session: buildSessionPayload(session) } : {}),
    });
  } catch (error) {
    next(error);
  }
};

const createStreamMessageId = () =>
  `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const writeSse = (res, event, payload = {}) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  res.flush?.();
};

export const sendMessageStream = async (req, res, next) => {
  const messageId = createStreamMessageId();
  let started = false;
  let sentDelta = false;

  try {
    const sessionId = resolveThreadId(req.body || {});
    const { message, context } = req.body || {};

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    started = true;
    writeSse(res, 'start', { sessionId, conversationId: sessionId, messageId });

    const result = await processMessage({
      sessionId,
      message,
      user: req.user,
      context,
      onToken: (text) => {
        sentDelta = true;
        writeSse(res, 'delta', { text });
      },
    });

    if (!sentDelta && result.reply) {
      writeSse(res, 'delta', { text: result.reply });
    }

    const session = await ChatSession.findOne({ sessionId }).lean();
    writeSse(res, 'done', {
      reply: result.reply,
      action: result.action || null,
      actionChips: result.actionChips || [],
      leadRequired: Boolean(result.leadRequired),
      metadata: result.metadata || null,
      ...(session ? { session: buildSessionPayload(session) } : {}),
    });
    res.end();
  } catch (error) {
    if (!started) {
      next(error);
      return;
    }
    console.error('Chatbot stream error:', error?.message || error);
    writeSse(res, 'error', { message: 'Failed to process message' });
    res.end();
  }
};

export const requestHandoff = async (req, res, next) => {
  try {
    const sessionId = resolveThreadId(req.body || {});
    const { lastMessage } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Missing conversationId' });
    }

    const session = await ChatSession.findOne({ sessionId });
    const leadName = session?.leadName || 'Guest';
    const leadPhone = session?.leadPhone || 'N/A';

    const message = `${leadName} (${leadPhone}) requested a human handoff.${lastMessage ? ` Last message: "${lastMessage}"` : ''}`;

    const handoffNotification = await Notification.create({
      title: 'Chatbot Handoff Requested',
      message,
      type: 'chat',
      recipientRole: 'admin_family',
      metadata: { sessionId },
    });
    emitAdminChatNotification({
      id: handoffNotification._id,
      title: handoffNotification.title,
      message: handoffNotification.message,
      type: handoffNotification.type,
      isRead: handoffNotification.isRead,
      createdAt: handoffNotification.createdAt,
      metadata: handoffNotification.metadata,
    });

    await ChatMessage.create({
      sessionId,
      sender: 'system',
      message: 'Human handoff requested.',
      metadata: { type: 'handoff' },
    });

    res.json({ success: true, message: 'Handoff request sent' });
  } catch (error) {
    next(error);
  }
};

export const handleSocketMessage = async (io, socket, payload = {}) => {
  try {
    const { sessionId, message, context } = payload;
    const result = await processMessage({ sessionId, message, user: socket.user, context });
    const room = sessionId ? `chat:${sessionId}` : socket.id;

    io.to(room).emit('chat:response', {
      message: result.reply,
      action: result.action || null,
      leadRequired: result.leadRequired || false,
      metadata: result.metadata || null,
    });
  } catch (error) {
    console.error('Socket chat error:', error.message);
    socket.emit('chat:error', { message: 'Failed to process message' });
  }
};

export const handleSocketStreamingMessage = async (io, socket, payload = {}) => {
  const { sessionId, message, context, clientMessageId } = payload;
  const room = sessionId ? `chat:${sessionId}` : socket.id;
  const messageId = createStreamMessageId();
  let sentDelta = false;

  const basePayload = { clientMessageId, messageId, sessionId };

  try {
    socket.join(room);
    io.to(room).emit('chat:stream:start', basePayload);

    const result = await processMessage({
      sessionId,
      message,
      user: socket.user,
      context,
      onToken: (text) => {
        sentDelta = true;
        io.to(room).emit('chat:stream:delta', { ...basePayload, text });
      },
    });

    if (!sentDelta && result.reply) {
      io.to(room).emit('chat:stream:delta', { ...basePayload, text: result.reply });
    }

    io.to(room).emit('chat:stream:done', {
      ...basePayload,
      reply: result.reply,
      action: result.action || null,
      actionChips: result.actionChips || [],
      leadRequired: Boolean(result.leadRequired),
      metadata: result.metadata || null,
    });
  } catch (error) {
    console.error('Socket stream chat error:', error?.message || error);
    io.to(room).emit('chat:stream:error', {
      ...basePayload,
      message: 'Failed to process message',
    });
  }
};
