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
  detectVehicleTypeFromMessage,
  getVehicleLabel,
  isAutoSpfScopeMessage,
  isPriceListRequest,
} from '../services/chatbotKnowledge.service.js';
import {
  applyReplyDeduplication,
  buildContextualFallbackReply,
  buildLanguageSwitchReply,
  buildUnsupportedLanguageReply,
  detectDirectAnswerIntent,
  detectLanguageSwitch,
  detectMessageLanguage,
  detectUnsupportedLanguageRequest,
  isFallbackRecentlyUsed,
  resolveConversationLanguage,
  updateConversationMemoryForReply,
} from '../services/chatbotIntelligence.service.js';
import {
  normalizeChatRegistrationEmail,
  normalizeNamePart,
  startChatRegistrationForCustomer,
  validateChatRegistrationEmail,
  validateChatRegistrationPhone,
  validateNamePart,
} from '../services/chatRegistration.service.js';
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
  buildCorrectionConfirmedReply,
  buildCorrectionNeedsValueReply,
  buildUnresolvedCorrectionReply,
  clearOnboardingFieldsAfter,
  CORRECTION_INTENT_REGEX,
  extractEmailCandidate,
  extractPhoneCandidate,
  hasCorrectionIntent,
  normalizeLeadPhone,
  parseOnboardingCorrection,
} from '../utils/chatOnboardingCorrection.utils.js';
import {
  buildOnboardingInterruptionReply,
  isOnboardingContextualQuestion,
} from '../utils/chatOnboardingInterruption.utils.js';
import {
  buildOnboardingSkipCompletionReply,
  isSkipOptionalFieldIntent,
  markOnboardingFieldSkipped,
} from '../utils/chatOnboardingSkip.utils.js';

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
const ACCOUNT_CREATE_INTENT_REGEX = /\b(create|make|open|start|set\s*up|setup|register|sign\s*up|signup)\b[\s\S]{0,60}\b(account|acct|acc|profile)\b|\b(register\s+me|sign\s+me\s+up|signup\s+ako|pa\s*register)\b|\b(gawan|gawa|gumawa|igawa|iregister|i-register)\b[\s\S]{0,60}\b(ako|mo|account|acct|acc|profile)\b|\b(gawa|create)\s+(acc|acct|account)\b/i;
const TRACKER_INTENT_REGEX = /\b(track|tracker|tracking|status|where\s+is\s+my\s+(car|vehicle)|live\s+tracker|order\s+status|repair\s+status)\b/i;
const CORRECTION_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const CORRECTION_PHONE_REGEX = /(?:\+?63|0)?9\d{9}\b/;
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

const saveChatMessageLater = (payload) => {
  runChatSideEffect('save chat message', () => ChatMessage.create(payload));
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
      'lastServiceInterest',
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
  if (TRACKER_INTENT_REGEX.test(message)) return 'tracker';
  if (BOOKING_INTENT_REGEX.test(message)) return 'booking';
  if (QUOTE_INTENT_REGEX.test(message)) return 'quote';
  if (ACCOUNT_CREATE_INTENT_REGEX.test(message)) return 'account';
  if (isExplicitHumanHandoffRequest(message)) return 'handoff';
  return 'general';
};

const updateSessionMemory = (
  session,
  { intent, vehicleType, serviceInterest, preferredLanguage, detectedLanguage, topic, answeredIntent } = {}
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
  if (serviceInterest && session.lastServiceInterest !== serviceInterest) {
    session.lastServiceInterest = serviceInterest;
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
  session?.onboarding?.status === 'collecting' && !!session?.onboarding?.step;

const getOnboardingDraft = (session) => ({
  firstName: session?.onboarding?.draft?.firstName || '',
  lastName: session?.onboarding?.draft?.lastName || '',
  email: session?.onboarding?.draft?.email || '',
  phone: session?.onboarding?.draft?.phone || '',
  phoneSkipped: Boolean(session?.onboarding?.draft?.phoneSkipped),
});

const getNextOnboardingStep = (draft = {}) => {
  if (!draft.firstName) return 'firstName';
  if (!draft.lastName) return 'lastName';
  if (!draft.email) return 'email';
  if (!draft.phone && !draft.phoneSkipped) return 'phone';
  return null;
};

const extractNameCandidate = (message = '') =>
  normalizeNamePart(
    String(message || '')
      .replace(/^(my\s+name\s+is|name\s+is|i'?m|im|ako\s+si|si)\s+/i, '')
  );

const ONBOARDING_PROMPTS = {
  firstName: "To get started, what's your first name?",
  lastName: "Thanks. What's your last name?",
  email: 'What email address should we use for your secure setup link?',
  phone: 'Optional: what mobile number should we place on your account? You can say skip if you prefer.',
};

const beginAccountOnboarding = async (session, { intentSource = 'deterministic' } = {}) => {
  const draft = getOnboardingDraft(session);
  const step = getNextOnboardingStep(draft) || 'firstName';

  session.onboarding = {
    status: 'collecting',
    step,
    intent: 'CREATE_ACCOUNT',
    draft,
    startedAt: session.onboarding?.startedAt || new Date(),
    lastError: undefined,
  };
  await session.save();

  return {
    reply: sanitizeChatReply(
      `Absolutely — I'll help you create your AutoSPF+ account.\n\n${ONBOARDING_PROMPTS[step]}`
    ),
    metadata: { type: 'account_onboarding_started', intentSource },
  };
};

const completeAccountOnboarding = async (session, draft, { skippedField } = {}) => {
  session.onboarding = {
    ...session.onboarding,
    status: 'submitting',
    step: undefined,
    draft,
    lastError: undefined,
  };
  await session.save();

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
    };
    await session.save();

    return {
      reply: error?.emailError
        ? 'I saved the account details, but the secure setup email could not be sent right now. Please send your email again in a moment and I will retry it here.'
        : 'I could not complete the account setup yet. Please check the details and try again.',
      metadata: { type: 'account_onboarding_failed' },
    };
  }

  if (!result.ok) {
    session.onboarding = {
      ...session.onboarding,
      status: 'failed',
      step: 'email',
      lastError: result.message,
      draft,
    };
    await session.save();

    return {
      reply: result.message || 'I could not complete the account setup yet. Please check the details and try again.',
      metadata: { type: 'account_onboarding_failed' },
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
  };
  await session.save();

  const usedSkipReply = skippedField === 'phone' || draft.phoneSkipped;
  const reply = usedSkipReply
    ? buildOnboardingSkipCompletionReply(
        { ...draft, email: result.data?.email || draft.email },
        { skippedField: 'phone' }
      )
    : "We've sent a secure setup link to your email address. Please check your inbox to continue creating your password and activate your AutoSPF+ account.";

  return {
    reply: sanitizeChatReply(reply),
    metadata: {
      type: 'account_onboarding_complete',
      email: result.data?.email || draft.email,
      skippedField: usedSkipReply ? 'phone' : undefined,
    },
  };
};

const applyOnboardingCorrection = async (session, message, { draft, step }) => {
  const correction = parseOnboardingCorrection(message, { step, draft });
  if (!correction) {
    if (hasCorrectionIntent(message)) {
      return {
        reply: buildUnresolvedCorrectionReply(),
        metadata: { type: 'account_onboarding_correction_unresolved' },
      };
    }
    return null;
  }

  if (correction.needsValue) {
    session.onboarding = {
      status: 'collecting',
      step: correction.field,
      intent: 'CREATE_ACCOUNT',
      draft,
      startedAt: session.onboarding?.startedAt || new Date(),
      lastError: undefined,
    };
    await session.save();

    return {
      reply: buildCorrectionNeedsValueReply(correction.field),
      metadata: { type: 'account_onboarding_correction_prompt', field: correction.field },
    };
  }

  let nextDraft = clearOnboardingFieldsAfter(draft, correction.field);

  if (correction.field === 'firstName' || correction.field === 'lastName') {
    const result = validateNamePart(
      correction.value,
      correction.field === 'firstName' ? 'first name' : 'last name'
    );
    if (!result.ok) {
      return {
        reply: result.message,
        metadata: { type: 'account_onboarding_correction', field: correction.field },
      };
    }
    nextDraft[correction.field] = result.value;
  }

  if (correction.field === 'email') {
    const result = validateChatRegistrationEmail(correction.value);
    if (!result.ok) {
      return {
        reply: 'Got it, but that email does not look quite right. Please send the correct email address again.',
        metadata: { type: 'account_onboarding_correction', field: 'email' },
      };
    }
    nextDraft.email = result.value;
  }

  if (correction.field === 'phone') {
    const result = validateChatRegistrationPhone(correction.value);
    if (!result.ok) {
      return {
        reply: 'Got it, but that mobile number does not look quite right. Please send it like 09171234567 or +639171234567.',
        metadata: { type: 'account_onboarding_correction', field: 'phone' },
      };
    }
    nextDraft.phone = result.value;
  }

  const nextStep = getNextOnboardingStep(nextDraft);
  if (!nextStep) {
    const completion = await completeAccountOnboarding(session, nextDraft);
    const confirmedValue = nextDraft[correction.field];
    return {
      ...completion,
      reply: buildCorrectionConfirmedReply({
        field: correction.field,
        value: confirmedValue,
        nextPrompt: completion.reply,
      }),
    };
  }

  const nextPrompt =
    nextStep === 'lastName' && nextDraft.firstName
      ? `Thanks, ${nextDraft.firstName}. ${ONBOARDING_PROMPTS.lastName}`
      : ONBOARDING_PROMPTS[nextStep];

  session.onboarding = {
    status: 'collecting',
    step: nextStep,
    intent: 'CREATE_ACCOUNT',
    draft: nextDraft,
    startedAt: session.onboarding?.startedAt || new Date(),
    lastError: undefined,
  };
  await session.save();

  return {
    reply: buildCorrectionConfirmedReply({
      field: correction.field,
      value: nextDraft[correction.field],
      nextPrompt,
    }),
    metadata: { type: 'account_onboarding_correction', field: correction.field, step: nextStep },
  };
};

const ONBOARDING_RESUME_PROMPTS = {
  firstName: "what's your first name?",
  lastName: "what's your last name?",
  email: 'what email address should we use for your secure setup link?',
  phone: 'what mobile number should we place on your account? (Optional — say skip if you prefer.)',
};

const buildOnboardingResumePrompt = (step, draft = {}) => {
  const text = ONBOARDING_RESUME_PROMPTS[step];
  if (!text) return 'Now, let us continue with your account setup.';
  if (step === 'lastName' && draft.firstName) {
    return `Now, thanks ${draft.firstName} — ${ONBOARDING_RESUME_PROMPTS.lastName}`;
  }
  return `Now, ${text}`;
};

const handleOnboardingInterruption = (message, { draft, step }) => {
  if (!isOnboardingContextualQuestion(message, { step })) {
    return null;
  }

  const reply = buildOnboardingInterruptionReply({
    message,
    step,
    draft,
    resumePrompt: buildOnboardingResumePrompt(step, draft),
  });

  return {
    reply: sanitizeChatReply(reply),
    metadata: { type: 'account_onboarding_interruption', step },
  };
};

const handleAccountOnboardingInput = async (session, message) => {
  const draft = getOnboardingDraft(session);
  const step = session.onboarding?.step || getNextOnboardingStep(draft) || 'firstName';
  let nextDraft = { ...draft };

  const correctionResult = await applyOnboardingCorrection(session, message, { draft, step });
  if (correctionResult) {
    return correctionResult;
  }

  const interruptionResult = handleOnboardingInterruption(message, { draft, step });
  if (interruptionResult) {
    return interruptionResult;
  }

  if (isSkipOptionalFieldIntent(message, step)) {
    nextDraft = markOnboardingFieldSkipped(nextDraft, step);
    return completeAccountOnboarding(session, nextDraft, { skippedField: step });
  }

  if (step === 'firstName') {
    const firstName = extractNameCandidate(message);
    const result = validateNamePart(firstName, 'first name');
    if (!result.ok) {
      return {
        reply: 'Please send just your first name so I can set up your AutoSPF+ profile.',
        metadata: { type: 'account_onboarding_validation', field: 'firstName' },
      };
    }
    nextDraft.firstName = result.value;
  }

  if (step === 'lastName') {
    const lastName = extractNameCandidate(message);
    const result = validateNamePart(lastName, 'last name');
    if (!result.ok) {
      return {
        reply: 'Please send just your last name.',
        metadata: { type: 'account_onboarding_validation', field: 'lastName' },
      };
    }
    nextDraft.lastName = result.value;
  }

  if (step === 'email') {
    const email = extractEmailCandidate(message) || normalizeChatRegistrationEmail(message);
    const result = validateChatRegistrationEmail(email);
    if (!result.ok) {
      return {
        reply: 'That email does not look quite right. Please send the email address for your secure setup link.',
        metadata: { type: 'account_onboarding_validation', field: 'email' },
      };
    }
    nextDraft.email = result.value;
  }

  if (step === 'phone') {
    const phone = extractPhoneCandidate(message) || message;
    const result = validateChatRegistrationPhone(phone);
    if (!result.ok) {
      return {
        reply:
          'That does not look like a mobile number. Send a valid number like 09171234567 or +639171234567, or say skip if you prefer not to add one.',
        metadata: { type: 'account_onboarding_validation', field: 'phone' },
      };
    }
    nextDraft.phone = result.value;
  }

  const nextStep = getNextOnboardingStep(nextDraft);
  if (!nextStep) {
    return completeAccountOnboarding(session, nextDraft);
  }

  session.onboarding = {
    status: 'collecting',
    step: nextStep,
    intent: 'CREATE_ACCOUNT',
    draft: nextDraft,
    startedAt: session.onboarding?.startedAt || new Date(),
    lastError: undefined,
  };
  await session.save();

  const reply = step === 'firstName'
    ? `Thank you, ${nextDraft.firstName}. ${ONBOARDING_PROMPTS[nextStep]}`
    : ONBOARDING_PROMPTS[nextStep];

  return {
    reply: sanitizeChatReply(reply),
    metadata: { type: 'account_onboarding_step', step: nextStep },
  };
};

const detectAccountCreateIntent = (message = '') => {
  if (ACCOUNT_CREATE_INTENT_REGEX.test(message)) {
    return { matched: true, source: 'deterministic' };
  }
  return { matched: false, source: 'none' };
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
    a: 'Las Piñas City, Metro Manila — Marcos Alvarez Ave. See the Contact page for map and details.',
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

const buildPricingDirectReply = async ({ language, vehicleContextKey, wantsPriceList }) => {
  if (wantsPriceList) {
    return buildCachedCompletePriceListReply();
  }

  if (vehicleContextKey) {
    const pricing = await buildSpfPricingKnowledge(vehicleContextKey);
    return [
      byLanguage(language, {
        english: `Here are the current SPF package prices for ${getVehicleLabel(vehicleContextKey)}:`,
        tagalog: `Ito ang current SPF package prices for ${getVehicleLabel(vehicleContextKey)}:`,
        taglish: `Here are the current SPF package prices for ${getVehicleLabel(vehicleContextKey)}:`,
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

const buildDirectAnswerReply = async ({
  intentInfo,
  language,
  vehicleContextKey,
  wantsPriceList,
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
      reply: await buildPricingDirectReply({ language, vehicleContextKey, wantsPriceList }),
      metadata: intentInfo,
    };
  }

  return null;
};

const resolveVehicleContext = async (sessionId, currentMessage, session = null) => {
  const fromCurrent = detectVehicleTypeFromMessage(currentMessage);
  if (fromCurrent) return fromCurrent.apiKey;
  if (session?.lastVehicleType) return session.lastVehicleType;

  const recentUserMessages = await getRecentUserMessagesFast(sessionId, 4);
  for (const message of recentUserMessages) {
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
    session?.lastServiceInterest ? `lastService=${session.lastServiceInterest}` : '',
    session?.lastTopic ? `lastTopic=${session.lastTopic}` : '',
    session?.lastAnsweredIntent ? `lastAnswered=${session.lastAnsweredIntent}` : '',
    session?.consecutiveFallbackCount ? `fallbackCount=${session.consecutiveFallbackCount}` : '',
    Number.isFinite(Number(session?.conversationContinuityScore))
      ? `continuity=${Number(session.conversationContinuityScore) || 0}`
      : '',
  ].filter(Boolean).join(', ') || 'none';

  return [
    'You are AutoSPF+ Concierge. Answer only AutoSPF+ services, SPF/PPF, ceramic coating, detailing, tint, booking, account, tracker, location, payments, warranty, and shop support.',
    'For unrelated topics, do not repeat canned fallback lines. Ask one concise clarifying question that points back to AutoSPF+ pricing, booking, tracker, location, hours, or services.',
    'Never say "Let me connect you with a specialist" unless the customer explicitly asks to speak with a human, agent, or live person.',
    'Treat short replies (okay, yes, hmm, wait, thinking, location kasi) as normal conversation — stay helpful and confident.',
    'Style: plain text only, no markdown, no emojis, short premium SaaS tone, max 70 words unless listing prices. Use • for lists. End with one clear next step.',
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
  updateSessionMemory(session, {
    intent: currentIntent,
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

  if (isActiveOnboardingSession(session)) {
    const onboardingResult = await handleAccountOnboardingInput(session, trimmed);
    return completeAssistantReply(
      onboardingResult.reply,
      onboardingResult.metadata || { type: 'account_onboarding', topic: 'account' },
      { leadRequired: false }
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

  const isGuest = !user?.id;
  const hasLead = !!session.leadName && !!session.leadPhone;
  const isQuoteRequest = QUOTE_INTENT_REGEX.test(trimmed);
  const wantsPriceList = isPriceListRequest(trimmed);
  const recentUserMessages = await getRecentUserMessagesFast(sessionId, 4);
  const directIntent = detectDirectAnswerIntent(trimmed);
  const directVehicleContextKey = directIntent?.intent === 'pricing'
    ? await resolveVehicleContext(sessionId, trimmed, session)
    : null;
  const directAnswer = await buildDirectAnswerReply({
    intentInfo: directIntent,
    language: activeLanguage,
    vehicleContextKey: directVehicleContextKey,
    wantsPriceList,
  });

  if (directVehicleContextKey) {
    updateSessionMemory(session, { vehicleType: directVehicleContextKey });
  }

  if (directAnswer) {
    return completeAssistantReply(
      directAnswer.reply,
      {
        type: 'direct_answer',
        intent: directAnswer.metadata.intent,
        topic: directAnswer.metadata.topic,
        confidence: directAnswer.metadata.confidence,
      },
      {
        action: directAnswer.action || null,
        leadRequired: false,
      }
    );
  }

  const accountIntent = detectAccountCreateIntent(trimmed);
  if (accountIntent.matched) {
    const onboardingResult = user?.id
      ? {
          reply: 'You are already signed in to an AutoSPF+ account. I can help you book a service, check your tracker, or manage your vehicle garage from here.',
          metadata: { type: 'account_onboarding_authenticated' },
        }
      : await beginAccountOnboarding(session, { intentSource: accountIntent.source });

    return completeAssistantReply(
      onboardingResult.reply,
      onboardingResult.metadata || { type: 'account_onboarding_started', topic: 'account' },
      { leadRequired: false }
    );
  }

  const casualReply = buildCasualConciergeReply(trimmed, { session, recentUserMessages });
  if (casualReply) {
    return completeAssistantReply(
      casualReply,
      { type: 'casual_conversation', topic: session.lastTopic || currentIntent, dedupable: true },
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

  if (!isAutoSpfScopeMessage(trimmed, recentUserMessages)) {
    const fallbackRecentlyUsed = isFallbackRecentlyUsed(session);
    return completeAssistantReply(
      buildContextualFallbackReply({
        language: activeLanguage,
        lastTopic: session.lastTopic,
        fallbackRecentlyUsed,
        recentUserMessages,
      }),
      {
        type: fallbackRecentlyUsed ? 'low_confidence' : 'fallback',
        intent: 'off_topic',
        topic: session.lastTopic || 'general',
        confidence: 0.2,
        fallbackSuppressed: fallbackRecentlyUsed,
        dedupable: true,
      },
      { leadRequired: false }
    );
  }

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

  const systemPrompt = buildCompactSystemPrompt({
    session,
    context,
    serviceSummary,
    inventorySummary,
    availabilityHints,
    faqSummary,
    vehicleContextKey,
  });

  const history = await getRecentMessages(sessionId);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];

  if (skipUserSave && (!history.length || history[history.length - 1]?.content !== trimmed)) {
    messages.push({ role: 'user', content: trimmed });
  }

  let reply;
  try {
    reply = await callGroq(messages, { onToken });
  } catch (error) {
    const status = error?.status || error?.response?.status;
    if (status === 429) {
      reply = 'Hello! This is a demo mode. I will be fully active once credits are added.';
    } else {
      console.error('Chatbot Groq error:', error?.message || error);
      reply = buildChatAiFallbackReply(error);
    }
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
      confidence: 0.65,
    },
    { action, actionChips, leadRequired: false }
  );
};

export const startSession = async (req, res, next) => {
  try {
    const { sessionId, source } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Missing sessionId' });
    }

    const session = await getCachedSession(sessionId, req.user, source);

    const messages = await ChatMessage.find({ sessionId })
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
      session: {
        sessionId: session.sessionId,
        leadName: session.leadName,
        leadEmail: session.leadEmail,
        leadPhone: session.leadPhone,
        preferredLanguage: session.preferredLanguage,
        lastDetectedLanguage: session.lastDetectedLanguage,
        lastIntent: session.lastIntent,
        lastTopic: session.lastTopic,
        lastAnsweredIntent: session.lastAnsweredIntent,
        conversationContinuityScore: session.conversationContinuityScore,
      },
      messages: messages.map((m) => ({
        id: m._id,
        sender: m.sender,
        message: m.message,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const saveLead = async (req, res, next) => {
  try {
    const { sessionId, name, phone } = req.body || {};
    if (!sessionId || !name || !phone) {
      return res.status(400).json({ success: false, message: 'Missing sessionId, name, or phone' });
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
    const { sessionId, message, context } = req.body || {};
    const result = await processMessage({ sessionId, message, user: req.user, context });
    res.json({ success: true, ...result });
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
    const { sessionId, message, context } = req.body || {};

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    started = true;
    writeSse(res, 'start', { sessionId, messageId });

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

    writeSse(res, 'done', {
      reply: result.reply,
      action: result.action || null,
      actionChips: result.actionChips || [],
      leadRequired: Boolean(result.leadRequired),
      metadata: result.metadata || null,
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
    const { sessionId, lastMessage } = req.body || {};
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Missing sessionId' });
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
