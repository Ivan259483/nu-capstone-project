import { extractPhoneCandidate } from './chatOnboardingCorrection.utils.js';

/** Onboarding fields the user may decline without blocking registration. */
export const OPTIONAL_ONBOARDING_FIELDS = ['phone'];

const SKIP_GENERAL_REGEX =
  /\b(skip|none|no\s+thanks?|not\s+now|later|prefer\s+not(?:\s+to)?|pass|ayoko|wag\s+na|walang|wala|huwag|hindi\s+na|di\s+na|without|don'?t\s+(?:want|need|have)|do\s+not\s+(?:want|need|have))\b/i;

const PHONE_SKIP_REGEX =
  /\b(no\s+(?:number|phone|mobile|contact)|without\s+(?:a\s+)?(?:number|phone|mobile)|skip\s+(?:the\s+)?(?:number|phone|mobile)|(?:number|phone|mobile)\s*(?:optional|not\s+(?:needed|required)|later))\b/i;

const FIELD_LABELS = {
  phone: 'mobile number',
};

const formatDraftBullets = (draft = {}) => {
  const bullets = [];
  const fullName = [draft.firstName, draft.lastName]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .join(' ');

  if (fullName) bullets.push(fullName);
  if (String(draft.email || '').trim()) bullets.push(String(draft.email).trim());
  if (String(draft.phone || '').trim()) bullets.push(String(draft.phone).trim());

  return bullets;
};

export const isOptionalOnboardingField = (field = '') =>
  OPTIONAL_ONBOARDING_FIELDS.includes(String(field || '').trim());

/**
 * Detects skip / refusal intent for optional onboarding fields (e.g. phone).
 */
export const isSkipOptionalFieldIntent = (message = '', field = '') => {
  if (!isOptionalOnboardingField(field)) return false;

  const text = String(message || '').trim();
  if (!text) return false;

  if (field === 'phone' && extractPhoneCandidate(text)) {
    return false;
  }

  if (SKIP_GENERAL_REGEX.test(text) || PHONE_SKIP_REGEX.test(text)) {
    return true;
  }

  if (field === 'phone' && /^(no|nope|nah)$/i.test(text)) {
    return true;
  }

  return false;
};

export const markOnboardingFieldSkipped = (draft = {}, field = '') => {
  const next = { ...draft };

  if (field === 'phone') {
    next.phone = '';
    next.phoneSkipped = true;
  }

  return next;
};

export const buildSkipOptionalFieldAck = (field = '') => {
  if (field === 'phone') {
    return 'No problem — mobile number is optional.';
  }

  const label = FIELD_LABELS[field] || 'that detail';
  return `No problem — ${label} is optional.`;
};

export const buildOnboardingDraftSummaryBlock = (draft = {}) => {
  const bullets = formatDraftBullets(draft);
  if (!bullets.length) return '';
  return `I now have:\n${bullets.map((line) => `• ${line}`).join('\n')}`;
};

export const buildOnboardingSkipCompletionReply = (draft = {}, { skippedField = 'phone' } = {}) => {
  const ack = buildSkipOptionalFieldAck(skippedField);
  const summary = buildOnboardingDraftSummaryBlock(draft);
  const outro =
    'Your AutoSPF+ setup link is on its way — please check your inbox to finish creating your password.';

  if (summary) {
    return `${ack}\n\n${summary}\n\n${outro}`;
  }

  return `${ack}\n\n${outro}`;
};
