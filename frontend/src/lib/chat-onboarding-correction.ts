export const CORRECTION_INTENT_REGEX =
    /\b(wrong|incorrect|not\s+correct|mistake|correction|correct\s+(?:is|to)|should\s+be|change\s+(?:it\s+)?to|update\s+(?:that|it)(?:\s+to)?|replace\s+it|palitan|mali|hindi\s+(?:yan|iyon|yun)|di\s+(?:yan|iyon|yun)|wait|not\s+that|iba\s+pala|ay\s+mali)\b/i;

const CORRECTION_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const CORRECTION_PHONE_REGEX = /(?:\+?63|0)?9\d{9}\b/;
const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;

const FIRST_NAME_HINT_REGEX = /\b(first\s*name|given\s*name|pangalan|unang\s*pangalan|fname)\b/i;
const LAST_NAME_HINT_REGEX = /\b(last\s*name|surname|apelyido|family\s*name|lname)\b/i;
const EMAIL_HINT_REGEX = /\b(e-?mail|mail)\b/i;
const PHONE_HINT_REGEX = /\b(phone|mobile|number|contact|cell|cellphone|cp)\b/i;
const TAGALISH_PARTICLE_REGEX = /\b(pala|po|lang|na|nga|eh)\b/gi;

const ONBOARDING_FIELD_ORDER = ['firstName', 'lastName', 'email', 'phone'] as const;

export type OnboardingField = (typeof ONBOARDING_FIELD_ORDER)[number];

export interface RegistrationDraftShape {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    phoneSkipped?: boolean;
}

export interface ParsedRegistrationCorrection {
    field: OnboardingField;
    label: string;
    value?: string;
    needsValue?: boolean;
}

export const hasCorrectionIntent = (message = '') =>
    CORRECTION_INTENT_REGEX.test(String(message || '').trim());

const extractEmailCandidate = (message = '') =>
    String(message || '').match(CORRECTION_EMAIL_REGEX)?.[0]?.toLowerCase() || '';

const extractPhoneCandidate = (message = '') => {
    const compact = String(message || '').replace(/[()\-\s.]/g, '');
    return compact.match(CORRECTION_PHONE_REGEX)?.[0] || '';
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

const extractNameValue = (message = '', field: 'firstName' | 'lastName') => {
    let text = stripCorrectionNoise(message);
    if (!text) return '';

    text = text
        .replace(FIRST_NAME_HINT_REGEX, '')
        .replace(LAST_NAME_HINT_REGEX, '')
        .replace(/\s+/g, ' ')
        .trim();

    const commaTail = text.split(',').map(part => part.trim()).filter(Boolean);
    if (commaTail.length > 1) {
        text = commaTail[commaTail.length - 1];
    }

    const parts = text.split(/\s+/).filter(Boolean);
    if (!parts.length) return '';

    return field === 'firstName' ? parts[0] : parts.join(' ');
};

const inferCorrectionField = ({
    message = '',
    step = '',
    draft = { firstName: '', lastName: '', email: '', phone: '' },
}: {
    message?: string;
    step?: string;
    draft?: RegistrationDraftShape;
}): OnboardingField | null => {
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
            if (draft.lastName) return 'lastName';
            if (draft.firstName) return 'firstName';
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

    const phoneIndex = ONBOARDING_FIELD_ORDER.indexOf('phone');
    if (phoneIndex >= 0 && index <= phoneIndex) {
        next.phoneSkipped = false;
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
    if (field === 'firstName') return 'No problem. What should your first name be?';
    if (field === 'lastName') return 'No problem. What should your last name be?';
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
