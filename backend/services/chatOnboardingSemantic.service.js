import {
  callGroqChatCompletions,
  formatGroqApiError,
} from '../utils/groqChat.utils.js';
import {
  normalizeLeadPhone,
} from '../utils/chatOnboardingCorrection.utils.js';

export const ONBOARDING_SEMANTIC_CONFIDENCE_THRESHOLD = 0.85;
export const GROQ_ONBOARDING_MODEL = (process.env.GROQ_ONBOARDING_MODEL || 'llama-3.1-8b-instant').trim();
export const GROQ_ONBOARDING_TIMEOUT_MS = Number(process.env.GROQ_ONBOARDING_TIMEOUT_MS || 4500);

export const ONBOARDING_SEMANTIC_INTENTS = Object.freeze([
  'CREATE_ACCOUNT',
  'UPDATE_FIRST_NAME',
  'UPDATE_LAST_NAME',
  'UPDATE_EMAIL',
  'UPDATE_PHONE',
  'PASSWORD_IN_CHAT',
  'ASK_LOCATION',
  'ASK_PRICING',
  'ASK_SERVICES',
  'ASK_HOURS',
  'ASK_ONBOARDING_STATUS',
  'INTERRUPTION',
  'CLARIFICATION',
  'SMALL_TALK',
  'LANGUAGE_SWITCH',
  'CONFIRM_PREVIOUS_FIRST_NAME',
  'CONFIRM_PREVIOUS_LAST_NAME',
  'CONFIRM_PREVIOUS_EMAIL',
  'CONFIRM_PREVIOUS_PHONE',
  'RETRY_ONBOARDING_SUBMISSION',
  'USER_FRUSTRATION',
]);

const INTENT_SET = new Set(ONBOARDING_SEMANTIC_INTENTS);
const FIELD_SET = new Set(['first_name', 'last_name', 'email', 'phone']);
const LANGUAGE_SET = new Set(['english', 'tagalog', 'taglish']);
const RECOMMENDED_ACTION_SET = new Set([
  'UPDATE_FIELD',
  'RETRY_BACKEND_PROCESS',
  'ASK_CLARIFICATION',
  'ANSWER_BUSINESS_QUESTION',
  'RESUME_ONBOARDING',
  'SWITCH_LANGUAGE',
  'ACKNOWLEDGE',
  'REJECT_PASSWORD_IN_CHAT',
]);

const FIELD_TO_UPDATE_INTENT = {
  first_name: 'UPDATE_FIRST_NAME',
  last_name: 'UPDATE_LAST_NAME',
  email: 'UPDATE_EMAIL',
  phone: 'UPDATE_PHONE',
};

const UPDATE_INTENT_TO_FIELD = {
  UPDATE_FIRST_NAME: 'first_name',
  UPDATE_LAST_NAME: 'last_name',
  UPDATE_EMAIL: 'email',
  UPDATE_PHONE: 'phone',
  CONFIRM_PREVIOUS_FIRST_NAME: 'first_name',
  CONFIRM_PREVIOUS_LAST_NAME: 'last_name',
  CONFIRM_PREVIOUS_EMAIL: 'email',
  CONFIRM_PREVIOUS_PHONE: 'phone',
};

const STEP_TO_FIELD = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  phone: 'phone',
};

const FIELD_TO_DRAFT_KEY = {
  first_name: 'firstName',
  last_name: 'lastName',
  email: 'email',
  phone: 'phone',
};

export const REQUIRED_ONBOARDING_FIELDS = Object.freeze(['first_name', 'last_name', 'phone', 'email']);
const REQUIRED_ONBOARDING_FIELD_SET = new Set(REQUIRED_ONBOARDING_FIELDS);

const stripJsonFence = (value = '') =>
  String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

const clampConfidence = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
};

const normalizeField = (field) => {
  const normalized = String(field || '').trim().toLowerCase().replace(/[ -]/g, '_');
  if (normalized === 'firstname' || normalized === 'first') return 'first_name';
  if (normalized === 'lastname' || normalized === 'surname' || normalized === 'last') return 'last_name';
  if (normalized === 'mail' || normalized === 'e_mail') return 'email';
  if (normalized === 'mobile' || normalized === 'number' || normalized === 'contact') return 'phone';
  return FIELD_SET.has(normalized) ? normalized : null;
};

const normalizeLanguage = (language, fallback = 'english') => {
  const normalized = String(language || '').trim().toLowerCase();
  return LANGUAGE_SET.has(normalized) ? normalized : fallback;
};

const normalizeRecommendedAction = (action = '') => {
  const normalized = String(action || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return RECOMMENDED_ACTION_SET.has(normalized) ? normalized : '';
};

const normalizeRequiredFieldList = (fields = []) => {
  if (!Array.isArray(fields)) return [];
  return fields
    .map(normalizeField)
    .filter((field, index, all) =>
      field && REQUIRED_ONBOARDING_FIELD_SET.has(field) && all.indexOf(field) === index
    );
};

export const buildCollectedOnboardingFields = (draft = {}) =>
  Object.fromEntries(
    REQUIRED_ONBOARDING_FIELDS.map((field) => {
      const draftKey = FIELD_TO_DRAFT_KEY[field];
      const value = String(draft?.[draftKey] || '').trim();
      return [field, value || null];
    })
  );

export const getMissingRequiredOnboardingFields = (draft = {}) =>
  REQUIRED_ONBOARDING_FIELDS.filter((field) => {
    const draftKey = FIELD_TO_DRAFT_KEY[field];
    return !String(draft?.[draftKey] || '').trim();
  });

const normalizeNameValue = (value = '') => {
  let normalized = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!normalized) return null;

  if (/^(not|hindi|di|wag|wrong|mali)\b/i.test(normalized)) return null;

  normalized = normalized
    .replace(/\b(please|pls|kindly|nga|po|opo|lang|hahaha+|haha+|kasi|naman|eh|pala)\b/gi, ' ')
    .replace(/^\s*(?:can\s+you|could\s+you|pa|paki)\s+/i, ' ')
    .replace(/^\s*(?:actually|really|sorry|wait)\s+/i, ' ')
    .replace(/^\s*(?:my\s+)?(?:correct\s+)?name\s+(?:is|should\s+be)\s+/i, ' ')
    .replace(/^\s*(?:first\s+name|last\s+name|fname|lname)\s+(?:is|should\s+be)?\s*/i, ' ')
    .replace(/^\s*(?:change|update|correct|fix|set|replace)\s+(?:the\s+)?(?:my\s+)?(?:first\s+name|last\s+name|name|fname|lname)\s+(?:to|as|is)?\s*/i, ' ')
    .replace(/^\s*(?:change|update|correct|fix|set|replace)\s+(?:to|as)?\s*/i, ' ')
    .replace(/\b(?:first\s+name|last\s+name|fname|lname)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || /^(not|hindi|di|wag|wrong|mali)\b/i.test(normalized)) return null;

  return normalized
    .split(/\s+/)
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '')
    .join(' ')
    .trim();
};

const normalizeValue = (value, field) => {
  if (value == null) return null;
  let normalized = String(value).trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  if (field === 'email') return normalized.toLowerCase();
  if (field === 'phone') return normalizeLeadPhone(normalized);
  if (field === 'first_name' || field === 'last_name') {
    return normalizeNameValue(normalized);
  }

  return normalized;
};

const parseGroqJson = (content = '') => {
  const clean = stripJsonFence(content);
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Groq onboarding analysis returned non-JSON content.');
    return JSON.parse(match[0]);
  }
};

export const normalizeSemanticAnalysis = (raw = {}, {
  fallbackLanguage = 'english',
  step = '',
  source = 'groq',
} = {}) => {
  const rawIntent = String(raw.intent || '').trim().toUpperCase();
  let intent = INTENT_SET.has(rawIntent) ? rawIntent : 'CLARIFICATION';
  let field = normalizeField(raw.field);

  if (!field && UPDATE_INTENT_TO_FIELD[intent]) {
    field = UPDATE_INTENT_TO_FIELD[intent];
  }

  if (!INTENT_SET.has(intent)) {
    intent = 'CLARIFICATION';
  }

  if (
    field
    && FIELD_TO_UPDATE_INTENT[field]
    && /^UPDATE_/.test(intent) === false
    && /^CONFIRM_PREVIOUS_/.test(intent) === false
    && intent !== 'CREATE_ACCOUNT'
    && intent !== 'PASSWORD_IN_CHAT'
    && intent !== 'RETRY_ONBOARDING_SUBMISSION'
  ) {
    intent = FIELD_TO_UPDATE_INTENT[field];
  }

  const value = normalizeValue(raw.value, field);
  const language = normalizeLanguage(raw.language, fallbackLanguage);
  const confidence = clampConfidence(raw.confidence);
  const recommendedAction = normalizeRecommendedAction(raw.recommended_action || raw.recommendedAction);
  const nextRequiredField = normalizeField(raw.next_required_field || raw.nextRequiredField);
  const reply = typeof raw.reply === 'string'
    ? raw.reply.trim()
    : typeof raw.replySuggestion === 'string'
      ? raw.replySuggestion.trim()
      : '';

  return {
    intent,
    field,
    value,
    nextRequiredField,
    language,
    confidence,
    duplicate: Boolean(raw.duplicate),
    recommendedAction,
    clarificationQuestion: typeof raw.clarificationQuestion === 'string' ? raw.clarificationQuestion.trim() : '',
    reply,
    replySuggestion: reply,
    source,
    currentStepField: STEP_TO_FIELD[step] || null,
  };
};

const buildFallbackClarification = ({
  step = '',
  fallbackLanguage = 'english',
} = {}) => {
  return normalizeSemanticAnalysis({
    intent: 'CLARIFICATION',
    language: fallbackLanguage,
    confidence: 0.1,
    recommended_action: 'ASK_CLARIFICATION',
    reply: 'I am having trouble reading that securely right now. Please send your last onboarding detail again in a moment.',
  }, { fallbackLanguage, step, source: 'fallback' });
};

const buildSystemPrompt = () => [
  'You are the primary conversational reasoning engine for AutoSPF+ account onboarding.',
  'Return ONLY one strict JSON object. No markdown, no prose.',
  'Interpret English, Tagalog, and Taglish conversationally.',
  'You decide what onboarding field should be collected next from conversational context and memory.',
  'Required fields are first_name, last_name, phone, and email. Mobile phone is required and cannot be skipped.',
  'Passwords must never be collected in chat. If the user sends or offers a password, use PASSWORD_IN_CHAT and recommended_action "REJECT_PASSWORD_IN_CHAT".',
  'Do not write to a database. Do not invent values. Only extract values the user actually supplied.',
  'Use onboarding state, collectedFields, missingRequiredFields, recent conversation, last backend error, last successful step, last submitted value, and businessContext to understand continuity.',
  'Do not follow a fixed question order blindly. Pick next_required_field from the missing required fields based on what feels most natural after this user turn.',
  'If all required fields are collected, set next_required_field to null and reply with a short confirmation that the secure setup email is being prepared.',
  'Normalize names by removing filler words like please, nga, po, lang, hahaha, kasi, naman, eh, pala, but preserve real names.',
  'If a user says "my name is Kevin" while the current step is email, classify it as UPDATE_FIRST_NAME with value "Kevin".',
  'If a user provides only a bare Philippine mobile number and phone is missing, classify it as UPDATE_PHONE.',
  'If the user repeats the same value after a backend failure, classify it as CONFIRM_PREVIOUS_* with duplicate true and recommended_action "RETRY_BACKEND_PROCESS".',
  'If the user asks to try again after a backend failure and the draft is complete, use RETRY_ONBOARDING_SUBMISSION with recommended_action "RETRY_BACKEND_PROCESS".',
  'If the user is frustrated but still trying to finish onboarding, use USER_FRUSTRATION with a helpful replySuggestion and recommended_action "RESUME_ONBOARDING" or "RETRY_BACKEND_PROCESS" when appropriate.',
  'If the user only says "mali" or an unclear correction, use CLARIFICATION with confidence below 0.85.',
  `Allowed intents: ${ONBOARDING_SEMANTIC_INTENTS.join(', ')}.`,
  'Allowed fields: first_name, last_name, email, phone, null.',
  'Allowed next_required_field values: first_name, last_name, phone, email, null.',
  `Allowed recommended_action values: ${Array.from(RECOMMENDED_ACTION_SET).join(', ')}.`,
  'JSON shape: {"intent":"UPDATE_PHONE","field":"phone","value":"09199453262","next_required_field":"email","language":"taglish","confidence":0.98,"duplicate":false,"recommended_action":"UPDATE_FIELD","clarificationQuestion":"","reply":"Great — what email address should we use for your secure setup link?"}',
].join('\n');

const buildUserPrompt = ({
  message,
  step,
  draft,
  collectedFields,
  missingRequiredFields,
  businessContext,
  pendingCorrection,
  preferredLanguage,
  lastTopic,
  lastIntent,
  recentMessages,
  onboardingStatus,
  lastBackendError,
  lastSuccessfulStep,
  lastSubmittedField,
  lastSubmittedValue,
  lastSubmittedAt,
} = {}) => JSON.stringify({
  currentStepCompatibilityHint: step,
  onboardingStatus: onboardingStatus || 'collecting',
  requiredFields: REQUIRED_ONBOARDING_FIELDS,
  collectedFields: collectedFields || buildCollectedOnboardingFields(draft),
  missingRequiredFields: normalizeRequiredFieldList(missingRequiredFields).length
    ? normalizeRequiredFieldList(missingRequiredFields)
    : getMissingRequiredOnboardingFields(draft),
  draft: {
    firstName: draft?.firstName || '',
    lastName: draft?.lastName || '',
    email: draft?.email || '',
    phone: draft?.phone || '',
  },
  businessContext: businessContext || {},
  pendingCorrection: pendingCorrection || null,
  lastBackendError: lastBackendError || '',
  lastSuccessfulStep: lastSuccessfulStep || '',
  lastSubmitted: {
    field: lastSubmittedField || '',
    value: lastSubmittedValue || '',
    at: lastSubmittedAt || '',
  },
  recentMessages: Array.isArray(recentMessages)
    ? recentMessages.slice(-8).map((entry) => ({
        role: entry.role === 'assistant' ? 'assistant' : 'user',
        content: String(entry.content || '').slice(0, 500),
      }))
    : [],
  preferredLanguage: preferredLanguage || 'english',
  lastTopic: lastTopic || '',
  lastIntent: lastIntent || '',
  userMessage: message,
});

export const analyzeOnboardingMessage = async ({
  message = '',
  step = '',
  draft = {},
  collectedFields = null,
  missingRequiredFields = null,
  businessContext = null,
  pendingCorrection = null,
  preferredLanguage = 'english',
  lastTopic = '',
  lastIntent = '',
  recentMessages = [],
  onboardingStatus = 'collecting',
  lastBackendError = '',
  lastSuccessfulStep = '',
  lastSubmittedField = '',
  lastSubmittedValue = '',
  lastSubmittedAt = '',
} = {}, {
  groqCaller = callGroqChatCompletions,
  allowFallback = true,
} = {}) => {
  const fallbackLanguage = normalizeLanguage(preferredLanguage, 'english');
  const resolvedCollectedFields = collectedFields || buildCollectedOnboardingFields(draft);
  const resolvedMissingRequiredFields = normalizeRequiredFieldList(missingRequiredFields).length
    ? normalizeRequiredFieldList(missingRequiredFields)
    : getMissingRequiredOnboardingFields(draft);

  try {
    const { content } = await groqCaller(
      {
        model: GROQ_ONBOARDING_MODEL,
        temperature: 0,
        max_completion_tokens: 180,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          {
            role: 'user',
            content: buildUserPrompt({
              message,
              step,
              draft,
              collectedFields: resolvedCollectedFields,
              missingRequiredFields: resolvedMissingRequiredFields,
              businessContext,
              pendingCorrection,
              preferredLanguage: fallbackLanguage,
              lastTopic,
              lastIntent,
              recentMessages,
              onboardingStatus,
              lastBackendError,
              lastSuccessfulStep,
              lastSubmittedField,
              lastSubmittedValue,
              lastSubmittedAt,
            }),
          },
        ],
      },
      {
        context: 'chat_onboarding_semantic',
        timeout: GROQ_ONBOARDING_TIMEOUT_MS,
      }
    );

    return normalizeSemanticAnalysis(parseGroqJson(content), {
      fallbackLanguage,
      step,
      source: 'groq',
    });
  } catch (error) {
    if (!allowFallback) throw error;
    const fallback = buildFallbackClarification({
      message,
      step,
      draft,
      fallbackLanguage,
    });
    fallback.error = formatGroqApiError(error);
    return fallback;
  }
};
