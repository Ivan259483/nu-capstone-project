import { extractEmailCandidate, extractPhoneCandidate } from './chatOnboardingCorrection.utils.js';

const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

const QUESTION_START_REGEX =
  /^(?:so\s+)?(?:what|which|how|can|could|would|will|did|do|does|have|has|is|are|am|may|please|tell\s+me|remind\s+me|ano|saan|paki|pwede|puwede)\b/i;

const QUESTION_MARKERS_REGEX =
  /\?|(?:^|\s)(?:what|which|how|can\s+you|could\s+you|did\s+you|do\s+you|have\s+i|have\s+you|is\s+my|are\s+my|ano|nasaan|nandiyan)\b/i;

const RECALL_INTENT_REGEX =
  /\b(full\s*name|complete\s*name|my\s+name|first\s*name|last\s*name|surname|given\s*name|e-?mail|phone|mobile|number|contact|info(?:rmation)?|details?|entered|gave|provided|shared|saved|updated|current|so\s+far|collected|on\s+record|you\s+have|i\s+(?:gave|entered|provided|shared|said|told))\b/i;

const STEP_STATUS_REGEX =
  /\b(what\s+step|which\s+step|where\s+are\s+we|what\s+am\s+i\s+on|what\s+stage|progress|what\s+is\s+next|what'?s\s+next|next\s+step)\b/i;

const REPEAT_INTENT_REGEX =
  /\b(repeat|say\s+again|ask\s+again|last\s+question|that\s+again|ulitin|paulit)\b/i;

const UPDATE_CHECK_REGEX =
  /\b(did\s+you\s+(?:update|change|save|get|record)|have\s+you\s+(?:updated|changed|saved|got))\b/i;

const FIELD_LABELS = {
  firstName: 'first name',
  lastName: 'last name',
  email: 'email address',
  phone: 'mobile number',
};

const STEP_LABELS = {
  firstName: 'your first name',
  lastName: 'your last name',
  email: 'your email address',
  phone: 'your mobile number',
};

const formatFullName = (draft = {}) => {
  const parts = [draft.firstName, draft.lastName].map((v) => String(v || '').trim()).filter(Boolean);
  return parts.length ? parts.join(' ') : '';
};

const hasCollectedValue = (value = '') => Boolean(String(value || '').trim());

const looksLikeBareName = (text = '') => {
  const value = String(text || '').trim();
  if (!value || value.length > 40) return false;
  if (extractEmailCandidate(value) || extractPhoneCandidate(value)) return false;
  if (QUESTION_MARKERS_REGEX.test(value)) return false;
  return NAME_PART_REGEX.test(value);
};

/**
 * True when the message is likely an answer for the active step, not a conversational question.
 */
export const looksLikeOnboardingFieldInput = (message = '', step = '') => {
  const text = String(message || '').trim();
  if (!text) return false;

  if (step === 'email' && extractEmailCandidate(text) && !QUESTION_MARKERS_REGEX.test(text)) {
    return true;
  }

  if (step === 'phone' && extractPhoneCandidate(text) && !QUESTION_MARKERS_REGEX.test(text)) {
    return true;
  }

  if ((step === 'firstName' || step === 'lastName') && looksLikeBareName(text)) {
    return true;
  }

  return false;
};

export const isOnboardingContextualQuestion = (message = '', { step = '' } = {}) => {
  const text = String(message || '').trim();
  if (!text) return false;

  if (looksLikeOnboardingFieldInput(text, step)) {
    return false;
  }

  if (STEP_STATUS_REGEX.test(text) || REPEAT_INTENT_REGEX.test(text) || UPDATE_CHECK_REGEX.test(text)) {
    return true;
  }

  const hasQuestionCue = QUESTION_START_REGEX.test(text) || QUESTION_MARKERS_REGEX.test(text);
  const hasRecallCue = RECALL_INTENT_REGEX.test(text);

  return hasQuestionCue && (hasRecallCue || STEP_STATUS_REGEX.test(text) || REPEAT_INTENT_REGEX.test(text));
};

const buildDraftSummary = (draft = {}) => {
  const lines = [];
  if (hasCollectedValue(draft.firstName)) {
    lines.push(`First name: ${draft.firstName}`);
  }
  if (hasCollectedValue(draft.lastName)) {
    lines.push(`Last name: ${draft.lastName}`);
  }
  if (hasCollectedValue(draft.email)) {
    lines.push(`Email: ${draft.email}`);
  }
  if (hasCollectedValue(draft.phone)) {
    lines.push(`Mobile: ${draft.phone}`);
  }

  if (!lines.length) {
    return 'I have not saved any account details yet — we are just getting started.';
  }

  return `Here is what I have so far:\n${lines.join('\n')}`;
};

const describeFieldValue = (field, draft = {}) => {
  const value = String(draft[field] || '').trim();
  const label = FIELD_LABELS[field] || 'detail';

  if (!value) {
    return `I do not have your ${label} yet.`;
  }

  return `Your ${label} is ${value}.`;
};

const describeUpdateCheck = (message = '', draft = {}) => {
  const text = String(message || '').toLowerCase();

  if (/\bfirst\s*name\b|\bgiven\s*name\b|\bpangalan\b/.test(text)) {
    return hasCollectedValue(draft.firstName)
      ? `Yes — I have your first name as ${draft.firstName}.`
      : 'Not yet — I have not saved your first name.';
  }

  if (/\blast\s*name\b|\bsurname\b|\bapelyido\b/.test(text)) {
    return hasCollectedValue(draft.lastName)
      ? `Yes — I have your last name as ${draft.lastName}.`
      : 'Not yet — I have not saved your last name.';
  }

  if (/\be-?mail\b/.test(text)) {
    return hasCollectedValue(draft.email)
      ? `Yes — your email is saved as ${draft.email}.`
      : 'Not yet — I have not saved your email address.';
  }

  if (/\b(phone|mobile|number|contact)\b/.test(text)) {
    return hasCollectedValue(draft.phone)
      ? `Yes — your mobile number is saved as ${draft.phone}.`
      : 'Not yet — I have not saved your mobile number.';
  }

  return null;
};

/**
 * @returns {string | null}
 */
export const buildOnboardingContextualAnswer = (message = '', { step = '', draft = {} } = {}) => {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();

  if (REPEAT_INTENT_REGEX.test(text)) {
    return null;
  }

  if (STEP_STATUS_REGEX.test(text)) {
    const stepLabel = STEP_LABELS[step] || 'the next account detail';
    return `We are on ${stepLabel} right now.`;
  }

  const updateCheck = describeUpdateCheck(text, draft);
  if (updateCheck) {
    return updateCheck;
  }

  if (/\b(full\s*name|complete\s*name)\b/i.test(text) || (/\bmy\s+name\b/i.test(text) && /\bwhat\b/i.test(text))) {
    const fullName = formatFullName(draft);
    if (fullName) return `Your full name is ${fullName}.`;
    if (hasCollectedValue(draft.firstName)) {
      return `So far I only have your first name as ${draft.firstName}.`;
    }
    return 'I do not have your name yet.';
  }

  if (/\bfirst\s*name\b|\bgiven\s*name\b|\bpangalan\b/i.test(text) && RECALL_INTENT_REGEX.test(text)) {
    return describeFieldValue('firstName', draft);
  }

  if (/\blast\s*name\b|\bsurname\b|\bapelyido\b/i.test(text) && RECALL_INTENT_REGEX.test(text)) {
    return describeFieldValue('lastName', draft);
  }

  if (/\be-?mail\b/i.test(text) && RECALL_INTENT_REGEX.test(text)) {
    return describeFieldValue('email', draft);
  }

  if (/\b(phone|mobile|number|contact)\b/i.test(text) && RECALL_INTENT_REGEX.test(text)) {
    if (/\b(skip|optional|required|need)\b/i.test(text) && step === 'phone') {
      return 'Yes — mobile number is optional. You can share one now, or say skip, none, or no number to continue without it.';
    }
    return describeFieldValue('phone', draft);
  }

  if (
    /\b(what\s+info|what\s+details?|what\s+did\s+i|what\s+have\s+i|current\s+info|so\s+far|summary|recap|everything\s+you\s+have)\b/i.test(
      lower
    )
  ) {
    return buildDraftSummary(draft);
  }

  if (RECALL_INTENT_REGEX.test(text) && QUESTION_MARKERS_REGEX.test(text)) {
    return buildDraftSummary(draft);
  }

  return null;
};

export const isOnboardingRepeatRequest = (message = '') =>
  REPEAT_INTENT_REGEX.test(String(message || '').trim());

export const buildOnboardingInterruptionReply = ({
  message = '',
  step = '',
  draft = {},
  resumePrompt = '',
} = {}) => {
  const resume = String(resumePrompt || '').trim();

  if (isOnboardingRepeatRequest(message)) {
    return resume;
  }

  const body =
    buildOnboardingContextualAnswer(message, { step, draft }) ||
    'Happy to help — here is what I have on your account setup so far.';

  if (!body) return resume;
  if (!resume) return body;

  return `${body}\n\n${resume}`;
};
