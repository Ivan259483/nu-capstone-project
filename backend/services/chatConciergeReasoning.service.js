import { sanitizeChatReply } from '../utils/chatReplyFormat.utils.js';
import {
  callGroqChatCompletions,
  formatGroqApiError,
  GROQ_CHAT_MODEL,
  isGroqConfigured,
} from '../utils/groqChat.utils.js';

export const GROQ_REASONING_CONFIDENCE_FLOOR = Number(
  process.env.GROQ_REASONING_CONFIDENCE_FLOOR || 0.45
);

export const mapOnboardingStateLabel = (session = {}) => {
  const status = session?.onboarding?.status;
  const step = session?.onboarding?.step;

  if (status === 'sent') return 'ACCOUNT_PENDING_EMAIL_SETUP';
  if (status === 'submitting') return 'ACCOUNT_SUBMITTING';
  if (status === 'failed') return 'ACCOUNT_SETUP_FAILED';
  if (status === 'collecting' && step) return `COLLECTING_${String(step).toUpperCase()}`;
  if (status === 'collecting') return 'COLLECTING_DETAILS';

  const draft = session?.onboarding?.draft || {};
  if (draft.email || draft.phone || draft.firstName) return 'ACCOUNT_IN_PROGRESS';

  return 'NONE';
};

export const resolveConversationMode = (session = {}) => {
  const status = session?.onboarding?.status;
  if (['collecting', 'submitting', 'sent', 'failed'].includes(status)) {
    return 'ACTIVE_ONBOARDING';
  }

  const draft = session?.onboarding?.draft || {};
  if (draft.firstName || draft.lastName || draft.email || draft.phone) {
    return 'ACTIVE_ONBOARDING';
  }

  return 'GENERAL_CONCIERGE';
};

export const isOnboardingContext = (session = {}) =>
  resolveConversationMode(session) === 'ACTIVE_ONBOARDING';

export const extractRecentAssistantMessages = (recentMessages = []) =>
  (recentMessages || [])
    .filter((entry) => entry?.role === 'assistant')
    .slice(-4)
    .map((entry) => ({
      content: String(entry?.content || '').slice(0, 320),
    }));

export const looksLikeFullWelcomeMessage = (text = '') => {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    /welcome to autospf/i.test(normalized)
    || (/welcome/i.test(normalized) && /how can i assist you today/i.test(normalized))
    || (/welcome/i.test(normalized) && normalized.length > 80)
  );
};

export const hasRecentFullWelcome = (recentMessages = []) =>
  extractRecentAssistantMessages(recentMessages).some((entry) =>
    looksLikeFullWelcomeMessage(entry.content)
  );

export const buildGreetingConversationalState = (baseState = {}, { recentMessages = [] } = {}) => {
  const recentAssistantMessages = extractRecentAssistantMessages(recentMessages);
  const welcomeAlreadySent = hasRecentFullWelcome(recentMessages);

  return {
    ...baseState,
    conversation_mode: welcomeAlreadySent ? 'IDLE_CONCIERGE_RETURNING' : 'IDLE_CONCIERGE_GREETING',
    greeting_intent: true,
    welcome_already_sent: welcomeAlreadySent,
    greeting_cooldown_active: welcomeAlreadySent,
    recent_assistant_messages: recentAssistantMessages,
    greeting_instruction: welcomeAlreadySent
      ? 'Use a short varied follow-up greeting. Do not repeat the full AutoSPF+ welcome or capability list.'
      : 'First greeting in this thread may be warm and concise. One short welcome is enough.',
  };
};

export const buildConversationalState = ({
  session = {},
  message = '',
  recentMessages = [],
  user = null,
  language = 'english',
  knowledge = {},
  context = null,
} = {}) => {
  const draft = session?.onboarding?.draft || {};

  return {
    conversation_mode: resolveConversationMode(session),
    onboarding_state: mapOnboardingStateLabel(session),
    customer_data: {
      first_name: draft.firstName || null,
      last_name: draft.lastName || null,
      email: draft.email || session.leadEmail || user?.email || null,
      phone: draft.phone || session.leadPhone || null,
    },
    onboarding: {
      status: session?.onboarding?.status || null,
      step: session?.onboarding?.step || null,
      last_error: session?.onboarding?.lastError || null,
      last_successful_step: session?.onboarding?.lastSuccessfulStep || null,
      last_submitted_field: session?.onboarding?.lastSubmittedField || null,
      last_submitted_value: session?.onboarding?.lastSubmittedValue || null,
      secure_setup_email_sent: session?.onboarding?.status === 'sent',
    },
    session_memory: {
      last_intent: session?.lastIntent || null,
      last_topic: session?.lastTopic || null,
      last_vehicle_label: session?.lastVehicleLabel || null,
      last_service_interest: session?.lastServiceInterest || null,
      preferred_language: language,
    },
    business_context: knowledge?.businessContext || {},
    pricing_summary: knowledge?.serviceSummary || null,
    faq_summary: knowledge?.faqSummary || null,
    app_context: context || null,
    recent_conversation: (recentMessages || []).slice(-8).map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      content: String(entry.content || '').slice(0, 500),
    })),
    user_message: String(message || '').trim(),
  };
};

const buildReasoningSystemPrompt = () => [
  'You are the primary conversational reasoning engine for AutoSPF+ Concierge.',
  'Respond with natural, premium, calm plain text only. No markdown. No JSON in the customer-visible reply.',
  'Use the structured conversation state to understand context, especially onboarding progress.',
  'If onboarding_state is ACCOUNT_PENDING_EMAIL_SETUP, explain clearly that the account is created but password setup via secure email is still required.',
  'If the customer asks whether their account is already created, confirm what is done and what remains (secure email link, password setup).',
  'Never invent prices. Never collect passwords in chat. Never claim a specialist unless the customer explicitly asked for a human.',
  'Support English, Tagalog, and Taglish naturally based on preferred_language.',
  'Stay inside AutoSPF+ automotive services, bookings, pricing, packages, tracker, and account setup.',
  'Max 90 words unless listing verified prices from pricing_summary.',
].join('\n');

const buildReasoningUserPrompt = (state) =>
  JSON.stringify(state, null, 0);

export const shouldPreferGroqReply = (analysis = {}) => {
  const reply = String(analysis?.reply || analysis?.replySuggestion || '').trim();
  if (!reply) return false;
  if (analysis.source === 'groq') return true;
  return Number(analysis.confidence) >= GROQ_REASONING_CONFIDENCE_FLOOR;
};

export const buildPostSentOnboardingReply = (draft = {}) => {
  const email = String(draft.email || '').trim();
  if (!email) {
    return 'Your account is almost ready. Check your email for the secure setup link to create your password and activate your AutoSPF+ account.';
  }

  return [
    'Your account is almost ready.',
    '',
    "We've already sent your secure setup email to:",
    email,
    '',
    'Once you create your password from the secure link, your AutoSPF+ account will become active.',
  ].join('\n');
};

/**
 * Primary Groq concierge generation (general mode).
 * @returns {Promise<{ success: boolean, reply: string, source: string, error?: string }>}
 */
const buildGreetingReasoningSystemPrompt = () => [
  'You are AutoSPF+ Concierge writing the customer-visible greeting reply.',
  'Return plain text only. No markdown. Premium, calm, automotive concierge tone.',
  'Read greeting_intent, welcome_already_sent, recent_assistant_messages, and user_message from the JSON state.',
  'If welcome_already_sent or greeting_cooldown_active is true:',
  '- Do NOT repeat "Welcome to AutoSPF+" or resend the full services bullet list.',
  '- Use a short, natural follow-up (max 30 words), e.g. "Hey 👋 What can I help you with today?" or "Hi there 👋 Need help with bookings, coatings, or pricing?"',
  '- Vary wording from recent_assistant_messages; never copy the previous assistant line verbatim.',
  'If welcome_already_sent is false, one concise welcome is fine; still avoid long repetitive templates.',
  'Support English, Tagalog, and Taglish based on session_memory.preferred_language.',
].join('\n');

export const buildMinimalGreetingFallback = (state = {}) => {
  const language = state?.session_memory?.preferred_language || 'english';
  if (state?.welcome_already_sent) {
    const short = {
      english: 'Hey 👋 What can I help you with today?',
      tagalog: 'Hey 👋 Paano kita matutulungan ngayon?',
      taglish: 'Hey 👋 What can I help you with today?',
    };
    return short[language] || short.english;
  }

  const first = {
    english: 'Welcome to AutoSPF+ 👋 How can I assist you today?',
    tagalog: 'Welcome sa AutoSPF+ 👋 Paano kita matutulungan ngayon?',
    taglish: 'Welcome to AutoSPF+ 👋 How can I assist you today?',
  };
  return first[language] || first.english;
};

/**
 * Groq-first greeting generation with repetition awareness.
 * @returns {Promise<{ success: boolean, reply: string, source: string, error?: string }>}
 */
export const generateGroqGreetingReply = async (
  state,
  { groqCaller = callGroqChatCompletions } = {}
) => {
  if (!isGroqConfigured()) {
    return { success: false, reply: '', source: 'not_configured' };
  }

  try {
    const { content } = await groqCaller(
      {
        model: GROQ_CHAT_MODEL,
        temperature: 0.45,
        max_completion_tokens: 90,
        messages: [
          { role: 'system', content: buildGreetingReasoningSystemPrompt() },
          {
            role: 'user',
            content: [
              'Generate the greeting reply from this state. Customer-facing text only.',
              buildReasoningUserPrompt(state),
            ].join('\n\n'),
          },
        ],
      },
      { context: 'chat_greeting_groq' }
    );

    let reply = sanitizeChatReply(content);
    if (
      state?.welcome_already_sent
      && looksLikeFullWelcomeMessage(reply)
    ) {
      reply = sanitizeChatReply(buildMinimalGreetingFallback(state));
    }

    if (!reply) {
      return { success: false, reply: '', source: 'empty_response' };
    }

    return { success: true, reply, source: 'groq_greeting' };
  } catch (error) {
    return {
      success: false,
      reply: '',
      source: 'groq_error',
      error: formatGroqApiError(error).message,
    };
  }
};

export const buildGreetingGroqMessages = (state, { compactSystemAppend = '' } = {}) => {
  const system = [
    buildGreetingReasoningSystemPrompt(),
    compactSystemAppend,
  ].filter(Boolean).join('\n\n');

  const history = (state?.recent_conversation || []).map((entry) => ({
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    content: entry.content,
  }));

  return [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: state?.user_message || '' },
  ];
};

export const generatePrimaryConciergeReply = async (
  state,
  { groqCaller = callGroqChatCompletions } = {}
) => {
  if (!isGroqConfigured()) {
    return { success: false, reply: '', source: 'not_configured' };
  }

  try {
    const { content } = await groqCaller(
      {
        model: GROQ_CHAT_MODEL,
        temperature: 0.2,
        max_completion_tokens: 220,
        messages: [
          { role: 'system', content: buildReasoningSystemPrompt() },
          {
            role: 'user',
            content: [
              'Use this conversation state to answer the customer. Reply with customer-facing text only.',
              buildReasoningUserPrompt(state),
            ].join('\n\n'),
          },
        ],
      },
      { context: 'chat_concierge_primary' }
    );

    const reply = sanitizeChatReply(content);
    if (!reply) {
      return { success: false, reply: '', source: 'empty_response' };
    }

    return { success: true, reply, source: 'groq_primary' };
  } catch (error) {
    return {
      success: false,
      reply: '',
      source: 'groq_error',
      error: formatGroqApiError(error).message,
    };
  }
};
