const CORRECTION_PHONE_REGEX = /(?:\+?63|0)?9\d{9}\b/;

export const OPTIONAL_REGISTRATION_FIELDS = ['phone'] as const;

export type OptionalRegistrationField = (typeof OPTIONAL_REGISTRATION_FIELDS)[number];

export type RegistrationDraftWithSkip = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    phoneSkipped?: boolean;
};

const SKIP_GENERAL_REGEX =
    /\b(skip|none|no\s+thanks?|not\s+now|later|prefer\s+not(?:\s+to)?|pass|ayoko|wag\s+na|walang|wala|huwag|hindi\s+na|di\s+na|without|don'?t\s+(?:want|need|have)|do\s+not\s+(?:want|need|have))\b/i;

const PHONE_SKIP_REGEX =
    /\b(no\s+(?:number|phone|mobile|contact)|without\s+(?:a\s+)?(?:number|phone|mobile)|skip\s+(?:the\s+)?(?:number|phone|mobile)|(?:number|phone|mobile)\s*(?:optional|not\s+(?:needed|required)|later))\b/i;

const extractPhoneCandidate = (message = '') => {
    const compact = String(message || '').replace(/[()\-\s.]/g, '');
    return compact.match(CORRECTION_PHONE_REGEX)?.[0] || '';
};

export const isOptionalRegistrationField = (field: string) =>
    OPTIONAL_REGISTRATION_FIELDS.includes(field as OptionalRegistrationField);

export const isSkipOptionalRegistrationFieldIntent = (message = '', field: string) => {
    if (!isOptionalRegistrationField(field)) return false;

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

export const markRegistrationFieldSkipped = (
    draft: RegistrationDraftWithSkip,
    field: OptionalRegistrationField
): RegistrationDraftWithSkip => {
    if (field === 'phone') {
        return { ...draft, phone: '', phoneSkipped: true };
    }
    return draft;
};

const formatDraftBullets = (draft: RegistrationDraftWithSkip) => {
    const bullets: string[] = [];
    const fullName = [draft.firstName, draft.lastName].map(v => v.trim()).filter(Boolean).join(' ');
    if (fullName) bullets.push(fullName);
    if (draft.email.trim()) bullets.push(draft.email.trim());
    if (draft.phone.trim()) bullets.push(draft.phone.trim());
    return bullets;
};

export const buildSkipOptionalRegistrationAck = (field: OptionalRegistrationField) => {
    if (field === 'phone') return 'No problem — mobile number is optional.';
    return 'No problem — that detail is optional.';
};

export const buildRegistrationSkipCompletionReply = (
    draft: RegistrationDraftWithSkip,
    { skippedField = 'phone' as OptionalRegistrationField } = {}
) => {
    const ack = buildSkipOptionalRegistrationAck(skippedField);
    const bullets = formatDraftBullets(draft);
    const summary = bullets.length
        ? `I now have:\n${bullets.map(line => `• ${line}`).join('\n')}`
        : '';
    const outro = 'Your AutoSPF+ setup link is being prepared now.';

    if (summary) return `${ack}\n\n${summary}\n\n${outro}`;
    return `${ack}\n\n${outro}`;
};
