const CORRECTION_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const CORRECTION_PHONE_REGEX = /(?:\+?63|0)?9\d{9}\b/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

export const CORRECTION_INTENT_REGEX =
  /\b(wrong|incorrect|not\s+correct|mistake|correction|correct\s+(?:is|to)|should\s+be|change\s+(?:it\s+)?to|update\s+(?:that|it)(?:\s+to)?|replace\s+it|palitan|mali|hindi\s+(?:yan|iyon|yun)|di\s+(?:yan|iyon|yun)|wait|not\s+that|iba\s+pala|ay\s+mali)\b/i;

const FIRST_NAME_HINT_REGEX = /\b(first\s*name|given\s*name|pangalan|unang\s*pangalan|fname)\b/i;
const LAST_NAME_HINT_REGEX = /\b(last\s*name|surname|apelyido|family\s*name|lname)\b/i;
const EMAIL_HINT_REGEX = /\b(e-?mail|mail)\b/i;
const PHONE_HINT_REGEX = /\b(phone|mobile|number|contact|cell|cellphone|cp)\b/i;
const TAGALISH_PARTICLE_REGEX = /\b(pala|po|lang|na|nga|eh)\b/gi;

const ONBOARDING_FIELD_ORDER = ['firstName', 'lastName', 'email', 'phone'];

export const hasCorrectionIntent = (message = '') =>
  CORRECTION_INTENT_REGEX.test(String(message || '').trim());

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
  text = text.replace(/^(?:ay\s+)?mali(?:\s+po)?\s*[,!]?\s*/i, '');
  text = text.replace(
    /\b(wrong|incorrect|not\s+correct|mistake|correction|not\s+that|wait)\b\s*[,!]?\s*/gi,
    ''
  );
  text = text.replace(/\b(hindi\s+(?:yan|iyon|yun)|di\s+(?:yan|iyon|yun))\b\s*[,!]?\s*/gi, '');
  text = text.replace(
    /\b(correct\s+(?:is|to)|should\s+be|change\s+(?:it\s+)?to|update\s+(?:that|it)\s*to?|replace\s+(?:it\s+)?(?:with\s+)?|palitan(?:\s+ng)?|iba\s+pala)\s*/gi,
    ''
  );
  text = text.replace(/\b(it'?s|its|actually|i\s+meant|sabi\s+ko)\s*/gi, '');
  text = text.replace(TAGALISH_PARTICLE_REGEX, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/^[,.\-!]+\s*|\s*[,.\-!]+$/g, '');
  return text.trim();
};

const looksLikeBareName = (text = '') => {
  const value = String(text || '').trim();
  if (!value || value.length > 40) return false;
  if (extractEmailCandidate(value) || extractPhoneCandidate(value)) return false;
  return NAME_PART_REGEX.test(value);
};

const extractNameValue = (message = '', field = 'firstName') => {
  let text = stripCorrectionNoise(message);
  if (!text) return '';

  text = text
    .replace(FIRST_NAME_HINT_REGEX, '')
    .replace(LAST_NAME_HINT_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();

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

export const inferCorrectionField = ({ message = '', step = '', draft = {} } = {}) => {
  const text = String(message || '').trim();

  if (FIRST_NAME_HINT_REGEX.test(text)) return 'firstName';
  if (LAST_NAME_HINT_REGEX.test(text)) return 'lastName';
  if (EMAIL_HINT_REGEX.test(text)) return 'email';
  if (PHONE_HINT_REGEX.test(text)) return 'phone';

  const stripped = stripCorrectionNoise(text);
  const bareName = looksLikeBareName(stripped);

  if (step === 'lastName' && draft.firstName && bareName) {
    return 'firstName';
  }

  if (step === 'email' && draft.firstName && draft.lastName && bareName) {
    return 'lastName';
  }

  if (step === 'phone') {
    if (extractEmailCandidate(text)) return 'email';
    if (extractPhoneCandidate(text)) return 'phone';
    if (bareName) {
      if (LAST_NAME_HINT_REGEX.test(text) || (draft.lastName && stripped.split(/\s+/).length > 1)) {
        return 'lastName';
      }
      if (draft.lastName) return 'lastName';
      if (draft.firstName) return 'firstName';
    }
  }

  return null;
};

export const clearOnboardingFieldsAfter = (draft = {}, field = '') => {
  const next = { ...draft };
  const index = ONBOARDING_FIELD_ORDER.indexOf(field);
  if (index < 0) return next;

  for (let i = index + 1; i < ONBOARDING_FIELD_ORDER.length; i += 1) {
    next[ONBOARDING_FIELD_ORDER[i]] = '';
  }

  const phoneIndex = ONBOARDING_FIELD_ORDER.indexOf('phone');
  if (phoneIndex >= 0 && index <= phoneIndex) {
    next.phoneSkipped = false;
  }

  return next;
};

const FIELD_LABELS = {
  firstName: 'first name',
  lastName: 'last name',
  email: 'email',
  phone: 'mobile number',
};

export const buildCorrectionNeedsValueReply = (field = '') => {
  if (field === 'email') {
    return 'No problem. Please provide your correct email address.';
  }
  if (field === 'phone') {
    return 'No problem. Please provide your correct mobile number.';
  }
  if (field === 'firstName') {
    return 'No problem. What should your first name be?';
  }
  if (field === 'lastName') {
    return 'No problem. What should your last name be?';
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

  const field = inferCorrectionField({ message: text, step, draft });
  if (!field || field === 'email' || field === 'phone') {
    return null;
  }

  const value = extractNameValue(text, field);
  if (!value) {
    return { field, label: FIELD_LABELS[field], needsValue: true };
  }

  return { field, label: FIELD_LABELS[field], value };
};
