export const CORRECTION_INTENT_REGEX =
    /\b(wrong|incorrect|not\s+correct|mistake|correction|correct\s+(?:is|to)|should\s+be|change\s+(?:my\s+)?(?:it\s+)?(?:name)?(?:\s+to)?|update\s+(?:my\s+)?(?:that|it|name)(?:\s+to)?|replace\s+it|palitan|mali|hindi\s+(?:yan|iyon|yun)|di\s+(?:yan|iyon|yun)|wait|not\s+that|not\s+[a-zA-ZÀ-ÿ.'-]+|iba\s+pala|ay\s+mali|actually|i\s+meant|my\s+name\s+is|name\s+is)\b/i;

const CORRECTION_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const CORRECTION_PHONE_REGEX = /(?:\+?63|0)?9\d{9}\b/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

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

const ONBOARDING_FIELD_ORDER = ['firstName', 'lastName', 'email', 'phone'] as const;

export type OnboardingField = (typeof ONBOARDING_FIELD_ORDER)[number];

export interface RegistrationDraftShape {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
}

export interface ParsedRegistrationCorrection {
    field: OnboardingField;
    label: string;
    value?: string;
    needsValue?: boolean;
    confidence?: number;
    reason?: string;
}

export const hasCorrectionIntent = (message = '') => {
    const text = String(message || '').trim();
    if (!text) return false;
    if (CORRECTION_INTENT_REGEX.test(text)) return true;
    const taglishValue = text.match(TAGLISH_CORRECTION_VALUE_REGEX)?.[1] || '';
    return Boolean(taglishValue && !isEmptyCorrectionValue(taglishValue));
};

const extractEmailCandidate = (message = '') =>
    String(message || '').match(CORRECTION_EMAIL_REGEX)?.[0]?.toLowerCase() || '';

const extractPhoneCandidate = (message = '') => {
    const compact = String(message || '').replace(/[()\-\s.]/g, '');
    return compact.match(CORRECTION_PHONE_REGEX)?.[0] || '';
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
    return words.every(word => EMPTY_CORRECTION_WORDS.has(word));
};

const looksLikeBareName = (text = '') => {
    const value = String(text || '').trim();
    if (!value || value.length > 40) return false;
    if (extractEmailCandidate(value) || extractPhoneCandidate(value)) return false;
    if (isEmptyCorrectionValue(value)) return false;
    return NAME_PART_REGEX.test(value);
};

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isNegatingExistingNameOnly = (message = '', draft: RegistrationDraftShape) => {
    const text = String(message || '').trim().toLowerCase();
    const names = [draft.firstName, draft.lastName].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
    return names.some(name => new RegExp(`^(?:not|hindi|di)\\s+${escapeRegex(name)}[.!\\s]*$`, 'i').test(text));
};

const extractNameValue = (message = '', field: 'firstName' | 'lastName', draft: RegistrationDraftShape) => {
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

    const commaTail = text.split(',').map(part => part.trim()).filter(Boolean);
    if (commaTail.length > 1) {
        text = commaTail[commaTail.length - 1];
    }

    const parts = text.split(/\s+/).filter(Boolean);
    if (!parts.length) return '';

    return field === 'firstName' ? parts[0] : parts.join(' ');
};

const inferCorrectionTarget = ({
    message = '',
    step = '',
    draft = { firstName: '', lastName: '', email: '', phone: '' },
}: {
    message?: string;
    step?: string;
    draft?: RegistrationDraftShape;
}): { field: OnboardingField; confidence: number; reason: string } | null => {
    const text = String(message || '').trim();

    if (FIRST_NAME_HINT_REGEX.test(text)) return { field: 'firstName', confidence: 0.98, reason: 'explicit_first_name' };
    if (LAST_NAME_HINT_REGEX.test(text)) return { field: 'lastName', confidence: 0.98, reason: 'explicit_last_name' };
    if (EMAIL_HINT_REGEX.test(text)) return { field: 'email', confidence: 0.98, reason: 'explicit_email' };
    if (PHONE_HINT_REGEX.test(text)) return { field: 'phone', confidence: 0.98, reason: 'explicit_phone' };

    const stripped = stripCorrectionNoise(text);
    const bareName = looksLikeBareName(stripped);
    const mentionsGenericName = GENERIC_NAME_HINT_REGEX.test(text) || NAME_INTRO_REGEX.test(text);

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
            if (draft.lastName && stripped.split(/\s+/).length > 1) {
                return { field: 'lastName', confidence: 0.76, reason: 'name_value_after_last_name' };
            }
            if (draft.firstName) return { field: 'firstName', confidence: 0.72, reason: 'name_value_after_first_name' };
        }
    }

    return null;
};

export const clearRegistrationFieldsAfter = (
    draft: RegistrationDraftShape,
    field: OnboardingField
): RegistrationDraftShape => {
    const next = { ...draft };
    const index = ONBOARDING_FIELD_ORDER.indexOf(field);
    if (index < 0) return next;

    for (let i = index + 1; i < ONBOARDING_FIELD_ORDER.length; i += 1) {
        next[ONBOARDING_FIELD_ORDER[i]] = '';
    }

    return next;
};

const FIELD_LABELS: Record<OnboardingField, string> = {
    firstName: 'first name',
    lastName: 'last name',
    email: 'email',
    phone: 'mobile number',
};

export const buildCorrectionNeedsValueReply = (field: OnboardingField) => {
    if (field === 'email') return 'No problem. Please provide your correct email address.';
    if (field === 'phone') return 'No problem. Please provide your correct mobile number.';
    if (field === 'firstName') return 'No worries — what should I update your first name to?';
    if (field === 'lastName') return 'No worries — what should I update your last name to?';
    return 'No problem. Which detail should I update — first name, last name, email, or mobile number?';
};

export const buildCorrectionConfirmedReply = ({
    field,
    value,
    nextPrompt,
}: {
    field: OnboardingField;
    value: string;
    nextPrompt: string;
}) => {
    const label = FIELD_LABELS[field];
    return `No worries — I've updated your ${label} to ${value}.\n\n${nextPrompt}`;
};

export const buildUnresolvedCorrectionReply = () =>
    'No problem. Which detail should I update — first name, last name, email, or mobile number?';

export const parseRegistrationCorrection = (
    content: string,
    {
        step = '',
        draft = { firstName: '', lastName: '', email: '', phone: '' },
    }: {
        step?: string;
        draft?: RegistrationDraftShape;
    } = {}
): ParsedRegistrationCorrection | null => {
    const text = String(content || '').trim();
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
        return { field: 'phone', label: FIELD_LABELS.phone, value: phone };
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
