const NAME_PART_REGEX = /^[a-zA-ZÀ-ÿ\s.\-']+$/;
const CORRECTION_EMAIL_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const CORRECTION_PHONE_REGEX = /(?:\+?63|0)?9\d{9}\b/;

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

export type RegistrationDraftShape = {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
};

export type RegistrationStep = 'idle' | 'firstName' | 'lastName' | 'email' | 'phone' | 'submitting' | 'sent';

const extractEmailCandidate = (message = '') =>
    String(message || '').match(CORRECTION_EMAIL_REGEX)?.[0]?.toLowerCase() || '';

const extractPhoneCandidate = (message = '') => {
    const compact = String(message || '').replace(/[()\-\s.]/g, '');
    return compact.match(CORRECTION_PHONE_REGEX)?.[0] || '';
};

const formatFullName = (draft: RegistrationDraftShape) => {
    const parts = [draft.firstName, draft.lastName].map(v => v.trim()).filter(Boolean);
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

export const looksLikeRegistrationFieldInput = (message = '', step: RegistrationStep) => {
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

export const isRegistrationContextualQuestion = (message = '', step: RegistrationStep) => {
    const text = String(message || '').trim();
    if (!text) return false;

    if (looksLikeRegistrationFieldInput(text, step)) {
        return false;
    }

    if (STEP_STATUS_REGEX.test(text) || REPEAT_INTENT_REGEX.test(text) || UPDATE_CHECK_REGEX.test(text)) {
        return true;
    }

    const hasQuestionCue = QUESTION_START_REGEX.test(text) || QUESTION_MARKERS_REGEX.test(text);
    const hasRecallCue = RECALL_INTENT_REGEX.test(text);

    return hasQuestionCue && (hasRecallCue || STEP_STATUS_REGEX.test(text) || REPEAT_INTENT_REGEX.test(text));
};

const buildDraftSummary = (draft: RegistrationDraftShape) => {
    const lines: string[] = [];
    if (hasCollectedValue(draft.firstName)) lines.push(`First name: ${draft.firstName}`);
    if (hasCollectedValue(draft.lastName)) lines.push(`Last name: ${draft.lastName}`);
    if (hasCollectedValue(draft.email)) lines.push(`Email: ${draft.email}`);
    if (hasCollectedValue(draft.phone)) lines.push(`Mobile: ${draft.phone}`);

    if (!lines.length) {
        return 'I have not saved any account details yet — we are just getting started.';
    }

    return `Here is what I have so far:\n${lines.join('\n')}`;
};

const describeFieldValue = (field: keyof RegistrationDraftShape, draft: RegistrationDraftShape) => {
    const value = String(draft[field] || '').trim();
    const labels: Record<keyof RegistrationDraftShape, string> = {
        firstName: 'first name',
        lastName: 'last name',
        email: 'email address',
        phone: 'mobile number',
    };

    if (!value) {
        return `I do not have your ${labels[field]} yet.`;
    }

    return `Your ${labels[field]} is ${value}.`;
};

const describeUpdateCheck = (message: string, draft: RegistrationDraftShape) => {
    const text = message.toLowerCase();

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

export const buildRegistrationContextualAnswer = (
    message: string,
    { step, draft }: { step: RegistrationStep; draft: RegistrationDraftShape }
) => {
    const text = String(message || '').trim();
    const lower = text.toLowerCase();

    if (STEP_STATUS_REGEX.test(text)) {
        const stepLabels: Partial<Record<RegistrationStep, string>> = {
            firstName: 'your first name',
            lastName: 'your last name',
            email: 'your email address',
            phone: 'your mobile number',
        };
        const stepLabel = stepLabels[step] || 'the next account detail';
        return `We are on ${stepLabel} right now.`;
    }

    const updateCheck = describeUpdateCheck(text, draft);
    if (updateCheck) return updateCheck;

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

export const buildRegistrationInterruptionReply = ({
    message,
    step,
    draft,
    resumePrompt,
}: {
    message: string;
    step: RegistrationStep;
    draft: RegistrationDraftShape;
    resumePrompt: string;
}) => {
    if (REPEAT_INTENT_REGEX.test(message)) {
        return resumePrompt;
    }

    const answer =
        buildRegistrationContextualAnswer(message, { step, draft }) ||
        'Happy to help — here is what I have on your account setup so far.';

    const contextualAnswer = answer || buildDraftSummary(draft);
    const resume = resumePrompt.trim();

    if (!contextualAnswer) return resume;
    if (!resume) return contextualAnswer;

    return `${contextualAnswer}\n\n${resume}`;
};
