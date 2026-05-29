const CORRECTION_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const CORRECTION_PHONE_REGEX = /(?:\+?63|0)?9\d{9}\b/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

export const CORRECTION_INTENT_REGEX =
  /\b(wrong|incorrect|not\s+correct|mistake|correction|correct\s+(?:is|to)|correct\s+(?:my\s+)?(?:first\s+name|last\s+name|fname|lname|name)\s+to|should\s+be|change\s+(?:my\s+)?(?:it\s+)?(?:name)?(?:\s+to)?|change\s+(?:my\s+)?(?:first\s+name|last\s+name|fname|lname)\s+to|update\s+(?:my\s+)?(?:that|it|name)(?:\s+to)?|update\s+(?:my\s+)?(?:first\s+name|last\s+name|fname|lname)\s+to|replace\s+it|palitan|mali|hindi\s+(?:yan|iyon|yun)|di\s+(?:yan|iyon|yun)|wait|not\s+that|not\s+[a-zA-ZÀ-ÿ.'-]+|iba\s+pala|ay\s+mali|actually|i\s+meant|my\s+name\s+is|name\s+is)\b/i;

const EXPLICIT_FIELD_CORRECT_TO_REGEX = /\b(?:correct|change|update|fix)\s+(?:my\s+)?(first\s+name|last\s+name|fname|lname)\s+to\s+(.+)$/i;
const CORRECTION_NOISE_WORDS_REGEX = /\b(correct|change|update|fix|first|last|name|fname|lname|to|my|the|is|it)\b/i;

const FIRST_NAME_HINT_REGEX = /\b(first\s*name|given\s*name|pangalan|unang\s*pangalan|fname)\b/i;
const LAST_NAME_HINT_REGEX = /\b(last\s*name|surname|apelyido|family\s*name|lname)\b/i;
const GENERIC_NAME_HINT_REGEX = /\b(name|pangalan)\b/i;
const EMAIL_HINT_REGEX = /\b(e-?mail|mail)\b/i;
const PHONE_HINT_REGEX = /\b(phone|mobile|number|contact|cell|cellphone|cp)\b/i;
const TAGALISH_PARTICLE_REGEX = /\b(pala|po|lang|na|nga|eh)\b/gi;
const NAME_INTRO_REGEX = /\b(my\s+name\s+is|name\s+is|i'?m|im|ako\s+si|si)\s+(.+)$/i;
const TAGLISH_CORRECTION_VALUE_REGEX = /^([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s.\-']{0,39})\s+pala\b/i;
const EMPTY_CORRECTION_WORDS = new Set([
  'yung',
  'iyong',
  'yang',
  'yan',
  'yun',
  'iyon',
  'ito',
  'ang',
  'name',
  'pangalan',
  'first',
  'last',
  'my',
  'ko',
  'mo',
  'is',
  'to',
  'not',
  'hindi',
  'di',
  'mali',
  'wrong',
  'change',
  'update',
  'actually',
  'skip',
]);

const ONBOARDING_FIELD_ORDER = ['firstName', 'lastName', 'email', 'phone'];

const FIELD_LABELS = {
  firstName: 'first name',
  lastName: 'last name',
  email: 'email',
  phone: 'mobile number',
};

export const hasCorrectionIntent = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return false;
  if (CORRECTION_INTENT_REGEX.test(text)) return true;
  const taglishValue = text.match(TAGLISH_CORRECTION_VALUE_REGEX)?.[1] || '';
  return Boolean(taglishValue && !isEmptyCorrectionValue(taglishValue));
};

export const extractEmailCandidate = (message = '') =>
  String(message || '').match(CORRECTION_EMAIL_REGEX)?.[0]?.toLowerCase() || '';

export const extractPhoneCandidate = (message = '') => {
  const compact = String(message || '').replace(/[()\-\s.]/g, '');
  return compact.match(CORRECTION_PHONE_REGEX)?.[0] || '';
};

export const normalizeLeadPhone = (value = '') => {
  const trimmed = String(value || '').trim().replace(/[()\-\s.]/g, '');
  if (!trimmed) return '';
  if (/^9\d{9}$/.test(trimmed)) return `0${trimmed}`;
  return trimmed;
};

const stripCorrectionNoise = (message = '') => {
  let text = String(message || '').trim();
  text = text.replace(NAME_INTRO_REGEX, '$2');
  text = text.replace(/^(?:actually|i\s+meant)\s+/i, '');
  text = text.replace(/^(?:not|hindi|di)\s+[a-zA-ZÀ-ÿ.'-]+\s*[,;:-]+\s*/i, '');
  text = text.replace(/^(?:ay\s+)?mali(?:\s+po)?\s*[,!]?\s*/i, '');
  text = text.replace(
    /\b(wrong|incorrect|not\s+correct|mistake|correction|not\s+that|wait)\b\s*[,!]?\s*/gi,
    ''
  );
  text = text.replace(/\b(hindi\s+(?:yan|iyon|yun)|di\s+(?:yan|iyon|yun))\b\s*[,!]?\s*/gi, '');
  text = text.replace(
    /\b(correct\s+(?:is|to)|should\s+be|change\s+(?:my\s+)?(?:it\s+)?(?:name)?(?:\s+to)?|update\s+(?:my\s+)?(?:that|it|name)\s*to?|replace\s+(?:it\s+)?(?:with\s+)?|palitan(?:\s+ng)?|iba\s+pala)\s*/gi,
    ''
  );
  text = text.replace(/\b(it'?s|its|actually|i\s+meant|sabi\s+ko)\s*/gi, '');
  text = text.replace(/\b(yung|iyong|yang|ang|my|name|pangalan)\b/gi, ' ');
  text = text.replace(TAGALISH_PARTICLE_REGEX, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/^[,.\-!]+\s*|\s*[,.\-!]+$/g, '');
  return text.trim();
};

const isEmptyCorrectionValue = (value = '') => {
  const words = String(value || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  return words.every((word) => EMPTY_CORRECTION_WORDS.has(word));
};

const looksLikeBareName = (text = '') => {
  const value = String(text || '').trim();
  if (!value || value.length > 40) return false;
  if (extractEmailCandidate(value) || extractPhoneCandidate(value)) return false;
  if (isEmptyCorrectionValue(value)) return false;
  if (CORRECTION_NOISE_WORDS_REGEX.test(value)) return false;
  return NAME_PART_REGEX.test(value);
};

const normalizeCorrectionNameValue = (value = '') => {
  const parts = String(value || '')
    .trim()
    .replace(/[.!,]+$/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !EMPTY_CORRECTION_WORDS.has(part.toLowerCase()));
  if (!parts.length) return '';
  const normalized = parts.join(' ');
  if (!looksLikeBareName(normalized)) return '';
  return parts
    .map((part) => `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
};

/**
 * Parses phrases like "correct first name to kevin" into a target field and value.
 */
export const parseExplicitFieldCorrection = (message = '') => {
  const text = String(message || '').trim();
  const match = text.match(EXPLICIT_FIELD_CORRECT_TO_REGEX);
  if (!match) return null;

  const fieldLabel = String(match[1] || '').toLowerCase();
  const field = /^(last\s+name|lname|surname|apelyido)$/.test(fieldLabel) ? 'lastName' : 'firstName';
  const value = normalizeCorrectionNameValue(match[2]);
  if (!value) {
    return { field, label: FIELD_LABELS[field], needsValue: true };
  }

  return { field, label: FIELD_LABELS[field], value };
};

const isExplicitFieldCorrectionMessage = (message = '') =>
  Boolean(parseExplicitFieldCorrection(message))
  || (/\b(?:correct|change|update|fix)\b/i.test(message)
    && (FIRST_NAME_HINT_REGEX.test(message) || LAST_NAME_HINT_REGEX.test(message)));

const isNegatingExistingNameOnly = (message = '', draft = {}) => {
  const text = String(message || '').trim().toLowerCase();
  const names = [draft.firstName, draft.lastName].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  return names.some((name) => new RegExp(`^(?:not|hindi|di)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.!\\s]*$`, 'i').test(text));
};

const extractNameValue = (message = '', field = 'firstName', draft = {}) => {
  if (isNegatingExistingNameOnly(message, draft)) return '';

  const intro = String(message || '').trim().match(NAME_INTRO_REGEX);
  if (intro?.[2]) {
    const value = stripCorrectionNoise(intro[2]);
    return looksLikeBareName(value) ? (field === 'firstName' ? value.split(/\s+/)[0] : value) : '';
  }

  const taglishValue = String(message || '').trim().match(TAGLISH_CORRECTION_VALUE_REGEX)?.[1];
  if (taglishValue && looksLikeBareName(taglishValue)) {
    return field === 'firstName' ? taglishValue.trim().split(/\s+/)[0] : taglishValue.trim();
  }

  let text = stripCorrectionNoise(message);
  if (!text) return '';

  text = text
    .replace(FIRST_NAME_HINT_REGEX, '')
    .replace(LAST_NAME_HINT_REGEX, '')
    .replace(GENERIC_NAME_HINT_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (isEmptyCorrectionValue(text)) return '';

  const commaTail = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (commaTail.length > 1) {
    text = commaTail[commaTail.length - 1];
  }

  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) return '';

  if (field === 'firstName') {
    return parts[0];
  }

  return parts.join(' ');
};

export const inferCorrectionTarget = ({ message = '', step = '', draft = {} } = {}) => {
  const text = String(message || '').trim();

  if (FIRST_NAME_HINT_REGEX.test(text)) return { field: 'firstName', confidence: 0.98, reason: 'explicit_first_name' };
  if (LAST_NAME_HINT_REGEX.test(text)) return { field: 'lastName', confidence: 0.98, reason: 'explicit_last_name' };
  if (EMAIL_HINT_REGEX.test(text)) return { field: 'email', confidence: 0.98, reason: 'explicit_email' };
  if (PHONE_HINT_REGEX.test(text)) return { field: 'phone', confidence: 0.98, reason: 'explicit_phone' };

  const stripped = stripCorrectionNoise(text);
  const bareName = looksLikeBareName(stripped);
  const mentionsGenericName = GENERIC_NAME_HINT_REGEX.test(text) || NAME_INTRO_REGEX.test(text);

  if (isNegatingExistingNameOnly(text, draft)) {
    return { field: 'firstName', confidence: 0.88, reason: 'negated_existing_name' };
  }

  if (mentionsGenericName) {
    if (step === 'lastName' && draft.firstName) {
      return { field: 'firstName', confidence: 0.9, reason: 'generic_name_previous_step' };
    }
    if (draft.firstName) {
      return { field: 'firstName', confidence: 0.86, reason: 'generic_name_existing_first_name' };
    }
    return { field: 'firstName', confidence: 0.82, reason: 'generic_name_default' };
  }

  if (step === 'firstName' && bareName) {
    return { field: 'firstName', confidence: 0.84, reason: 'current_first_name_correction_value' };
  }

  if (step === 'lastName' && bareName) {
    if (!String(draft.lastName || '').trim()) {
      return { field: 'lastName', confidence: 0.9, reason: 'current_step_last_name' };
    }
    if (draft.firstName) {
      return { field: 'firstName', confidence: 0.82, reason: 'bare_name_after_first_name' };
    }
  }

  if (step === 'email' && draft.firstName && bareName) {
    return { field: 'firstName', confidence: 0.78, reason: 'bare_name_after_name_steps' };
  }

  if (step === 'phone') {
    if (extractEmailCandidate(text)) return { field: 'email', confidence: 0.9, reason: 'email_value' };
    if (extractPhoneCandidate(text)) return { field: 'phone', confidence: 0.9, reason: 'phone_value' };
    if (bareName) {
      if (LAST_NAME_HINT_REGEX.test(text) || (draft.lastName && stripped.split(/\s+/).length > 1)) {
        return { field: 'lastName', confidence: 0.76, reason: 'name_value_after_last_name' };
      }
      if (draft.firstName) return { field: 'firstName', confidence: 0.72, reason: 'name_value_after_first_name' };
    }
  }

  return null;
};

export const inferCorrectionField = (options = {}) => inferCorrectionTarget(options)?.field || null;

const STEP_TO_SEMANTIC_FIELD = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  phone: 'phone',
};

const SEMANTIC_FIELD_TO_UPDATE_INTENT = {
  first_name: 'UPDATE_FIRST_NAME',
  last_name: 'UPDATE_LAST_NAME',
  email: 'UPDATE_EMAIL',
  phone: 'UPDATE_PHONE',
};

const NEXT_SEMANTIC_FIELD_AFTER = {
  first_name: 'last_name',
  last_name: 'phone',
  phone: 'email',
  email: null,
};

/**
 * When Groq mis-targets a bare answer for the active collecting step, align field/value
 * so onboarding advances (e.g. "tadena" at lastName step should update last_name, not first_name).
 */
const getNextRequiredSemanticField = (draft = {}) => {
  const missing = ONBOARDING_FIELD_ORDER.filter((key) => !String(draft[key] || '').trim());
  return STEP_TO_SEMANTIC_FIELD[missing[0]] || null;
};

/**
 * Overrides Groq/step-alignment when the user names the field explicitly ("correct first name to kevin").
 */
export const applyExplicitFieldCorrectionToAnalysis = (analysis = {}, { message = '', draft = {} } = {}) => {
  const parsed = parseExplicitFieldCorrection(message);
  if (!parsed || parsed.needsValue) return analysis;

  const semanticField = parsed.field === 'lastName' ? 'last_name' : 'first_name';
  const nextDraft = { ...draft, [parsed.field]: parsed.value };
  const nextRequiredField = getNextRequiredSemanticField(nextDraft);

  return {
    ...analysis,
    intent: SEMANTIC_FIELD_TO_UPDATE_INTENT[semanticField] || analysis.intent,
    field: semanticField,
    value: parsed.value,
    nextRequiredField,
    reply: '',
    replySuggestion: '',
    source: 'explicit_field_correction',
  };
};

export const alignOnboardingAnalysisToCollectingStep = (analysis = {}, { message = '', step = '', draft = {} } = {}) => {
  const messageText = String(message || '').trim();
  const stepSemanticField = STEP_TO_SEMANTIC_FIELD[step];
  if (!messageText || !stepSemanticField || hasCorrectionIntent(messageText) || isExplicitFieldCorrectionMessage(messageText)) {
    return analysis;
  }

  const draftKey = step;
  const allNameFieldsCollected = ['firstName', 'lastName', 'email', 'phone']
    .every((key) => String(draft[key] || '').trim());
  if (allNameFieldsCollected) return analysis;

  if (String(draft[draftKey] || '').trim()) return analysis;

  const extracted = extractNameValue(messageText, draftKey, draft);
  if (!extracted || !looksLikeBareName(extracted)) return analysis;

  if (stepSemanticField !== 'first_name' && stepSemanticField !== 'last_name') return analysis;
  if (analysis.field === stepSemanticField && analysis.value) return analysis;

  const nextRequiredField = NEXT_SEMANTIC_FIELD_AFTER[stepSemanticField] ?? analysis.nextRequiredField;

  return {
    ...analysis,
    intent: SEMANTIC_FIELD_TO_UPDATE_INTENT[stepSemanticField] || analysis.intent,
    field: stepSemanticField,
    value: extracted,
    nextRequiredField,
    reply: '',
    replySuggestion: '',
    source: analysis.source === 'groq' ? 'groq_step_aligned' : analysis.source,
  };
};

export const clearOnboardingFieldsAfter = (draft = {}, field = '') => {
  const next = { ...draft };
  const index = ONBOARDING_FIELD_ORDER.indexOf(field);
  if (index < 0) return next;

  for (let i = index + 1; i < ONBOARDING_FIELD_ORDER.length; i += 1) {
    next[ONBOARDING_FIELD_ORDER[i]] = '';
  }

  return next;
};

export const buildCorrectionNeedsValueReply = (field = '') => {
  if (field === 'email') {
    return 'No problem. Please provide your correct email address.';
  }
  if (field === 'phone') {
    return 'No problem. Please provide your correct mobile number.';
  }
  if (field === 'firstName') {
    return 'No worries — what should I update your first name to?';
  }
  if (field === 'lastName') {
    return 'No worries — what should I update your last name to?';
  }
  return 'No problem. Which detail should I update — first name, last name, email, or mobile number?';
};

export const buildCorrectionConfirmedReply = ({ field, value, nextPrompt = '' }) => {
  const label = FIELD_LABELS[field] || 'detail';
  const intro = `No worries — I've updated your ${label} to ${value}.`;
  return nextPrompt ? `${intro}\n\n${nextPrompt}` : intro;
};

export const buildUnresolvedCorrectionReply = () =>
  'No problem. Which detail should I update — first name, last name, email, or mobile number?';

/**
 * @returns {null | { field: string, label: string, value?: string, needsValue?: boolean }}
 */
export const parseOnboardingCorrection = (message = '', { step = '', draft = {} } = {}) => {
  const text = String(message || '').trim();
  if (!hasCorrectionIntent(text)) return null;

  const email = extractEmailCandidate(text);
  const phone = extractPhoneCandidate(text);
  const mentionsEmail = EMAIL_HINT_REGEX.test(text);
  const mentionsPhone = PHONE_HINT_REGEX.test(text);

  if (mentionsEmail && !email) {
    return { field: 'email', label: FIELD_LABELS.email, needsValue: true };
  }

  if (mentionsPhone && !phone) {
    return { field: 'phone', label: FIELD_LABELS.phone, needsValue: true };
  }

  if (email && (mentionsEmail || !mentionsPhone)) {
    return { field: 'email', label: FIELD_LABELS.email, value: email };
  }

  if (phone && (mentionsPhone || !mentionsEmail)) {
    return {
      field: 'phone',
      label: FIELD_LABELS.phone,
      value: normalizeLeadPhone(phone),
    };
  }

  const target = inferCorrectionTarget({ message: text, step, draft });
  const field = target?.field;
  if (!field || field === 'email' || field === 'phone') {
    return null;
  }

  const value = extractNameValue(text, field, draft);
  if (!value) {
    return {
      field,
      label: FIELD_LABELS[field],
      needsValue: true,
      confidence: target.confidence,
      reason: target.reason,
    };
  }

  if (!looksLikeBareName(value)) {
    return {
      field,
      label: FIELD_LABELS[field],
      needsValue: true,
      confidence: Math.min(target.confidence, 0.7),
      reason: 'low_confidence_value',
    };
  }

  return {
    field,
    label: FIELD_LABELS[field],
    value,
    confidence: target.confidence,
    reason: target.reason,
  };
};
