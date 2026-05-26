import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import api, { BACKEND_API_URL, getStoredAuthToken } from '@/lib/api';
import {
    buildCorrectionConfirmedReply,
    buildCorrectionNeedsValueReply,
    buildUnresolvedCorrectionReply,
    clearRegistrationFieldsAfter,
    hasCorrectionIntent,
    parseRegistrationCorrection,
} from '@/lib/chat-onboarding-correction';
import {
    buildRegistrationInterruptionReply,
    isRegistrationContextualQuestion,
} from '@/lib/chat-onboarding-interruption';
import {
    buildRegistrationSkipCompletionReply,
    isSkipOptionalRegistrationFieldIntent,
    markRegistrationFieldSkipped,
} from '@/lib/chat-onboarding-skip';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { chatWindowClass } from '@/components/chat/chat-theme';
import {
    type ChatMessage,
    type ChatScreen,
    type PublicTrackerSummary,
    type RegistrationStep,
    formatRelativeTime,
    getConversationPreview,
    getHomeCardPreview,
    getLastActivityTime,
} from '@/components/chat/chat-utils';
import { LauncherBubbleIcon } from '@/components/chat/ChatIcons';
import ChatHomeScreen from '@/components/chat/ChatHomeScreen';
import ChatMessagesScreen from '@/components/chat/ChatMessagesScreen';
import ChatConversationScreen from '@/components/chat/ChatConversationScreen';

interface ChatWidgetProps {
    variant?: 'customer' | 'landing';
    onOpenBooking?: (payload: { name?: string; serviceName?: string }) => void;
    currentUserName?: string;
    isAuthenticated?: boolean;
    className?: string;
}

const QUOTE_INTENT_REGEX = /(quote|price|price\s*list|pricelist|cost|how much|pricing|rate|rates|estimate|presyo|magkano)/i;
const CUSTOM_QUOTE_LEAD_REGEX = /\b(custom|personalized|send|share|prepare|quotation|formal|for\s+my\s+(car|vehicle)|pa[\s-]*quote|quote\s+for)\b/i;
const PRICE_LIST_INTENT_REGEX =
    /\b(price\s*list|pricelist|rate\s*card|pricing\s*table|service\s*menu)\b|\b(send|show|give|provide|share)\b[\s\S]{0,80}\b(prices?|pricing|presyo|rates?)\b|\b(all|complete|full|lahat|buong)\b[\s\S]{0,80}\b(prices?|pricing|presyo|rates?)\b|\b(prices?|pricing|presyo|rates?)\b[\s\S]{0,80}\b(vehicle|vihicle|vechicle|sasakyan|kotse|car|services?)\b/i;
const TRACKER_INTENT_REGEX = /\b(track|tracker|tracking|status|where\s+is\s+my\s+(car|vehicle)|live\s+tracker|order\s+status|repair\s+status)\b/i;
const ASPF_REFERENCE_REGEX = /\bASPF-\d{6}-[A-Z0-9]{4}\b/i;
const REFERENCE_NOT_FOUND_REGEX = /\b(can'?t\s+find|cannot\s+find|cant\s+find|don'?t\s+have|do\s+not\s+have|lost|no\s+(ref|reference)|wala|di\s+ko\s+makita|hindi\s+ko\s+makita)\b/i;
const REFERENCE_CONFUSION_REGEX = /\b(what(\s+is|'?s)?\s+(that|this|it|ref|reference|appointment\s+reference)|explain|i\s+don'?t\s+know|idk|not\s+sure|where\s+(do|can)\s+i\s+find|how\s+(do|can)\s+i\s+find|ano\s+(yan|yun|iyon|ito)|di\s+ko\s+alam|hindi\s+ko\s+alam)\b/i;
const LOGIN_PROBLEM_REGEX = /\b(without\s+log[\s-]?in|no\s+log[\s-]?in|can'?t\s+log[\s-]?in|cannot\s+log[\s-]?in|cant\s+log[\s-]?in|unable\s+to\s+log[\s-]?in|di\s+makalogin|hindi\s+makalogin)\b/i;
const NO_LOGIN_TRACKER_REGEX = /\b(track|tracker|tracking|status)\b[\s\S]{0,80}\b(without\s+log[\s-]?in|no\s+log[\s-]?in|can'?t\s+log[\s-]?in|cannot\s+log[\s-]?in|cant\s+log[\s-]?in|unable\s+to\s+log[\s-]?in|di\s+makalogin|hindi\s+makalogin)\b|\b(without\s+log[\s-]?in|no\s+log[\s-]?in|can'?t\s+log[\s-]?in|cannot\s+log[\s-]?in|cant\s+log[\s-]?in|unable\s+to\s+log[\s-]?in|di\s+makalogin|hindi\s+makalogin)\b[\s\S]{0,80}\b(track|tracker|tracking|status)\b/i;
const PHONE_NUMBER_REGEX = /(?:\+?63|0)?9\d{9}\b/;
const EMAIL_CANDIDATE_REGEX = /[^\s@]+@[^\s@]+\.[^\s@]+/i;
const SIGNUP_INTENT_REGEX =
    /\b(create|make|open|start|set\s*up|setup|register|sign\s*up|signup)\b[\s\S]{0,60}\b(account|acct|acc|profile)\b|\b(register\s+me|sign\s+me\s+up|signup\s+ako|pa\s*register)\b|\b(gawan|gawa|gumawa|igawa|iregister|i-register)\b[\s\S]{0,60}\b(ako|mo|account|acct|acc|profile)\b|\b(gawa|create)\s+(acc|acct|account)\b/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRACKER_REFERENCE_PROMPT = 'Sure! Please enter your Appointment Reference Number to pull up your status.\nIt looks like this: ASPF-XXXXXX-XXXX\nYou can find it in your booking confirmation screen or email.';
const TRACKER_REFERENCE_EXPLANATION_REPLY = "Your Appointment Reference Number is a unique code we gave you\nwhen you completed your booking.\n\nYou can find it in:\n📧 Your confirmation email from AutoSPF+\n📱 Your booking confirmation screen in the app\n📋 Any SMS we sent after booking\n\nIt looks like: ASPF-260526-EC78\n\nCan't find it? No worries — just share your registered\nmobile number and our team will look it up for you! 🙌";
const TRACKER_LINK_REPLY = 'Got it! Tap below to view your live tracker 👇\nLog in with your registered account and it loads automatically.';
const TRACKER_PHONE_LOOKUP_PROMPT = 'No worries — just share your registered mobile number and our team will look it up for you! 🙌';
const TRACKER_PHONE_LOOKUP_REPLY = 'Thanks! Please log in to your dashboard or let our studio\nteam assist you directly via the option below. 🙌';
const TRACKER_INVALID_REFERENCE_REPLY = 'That does not look like an AutoSPF+ Appointment Reference Number yet. Please send it in this format: ASPF-XXXXXX-XXXX.';
const TRACKER_REPLY_DELAY_MS = 1200;

interface RegistrationDraft {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    phoneSkipped?: boolean;
}

type TrackerStep = 'idle' | 'reference' | 'phoneLookup' | 'fallbackReference' | 'fallbackPhone';

interface TrackerDraft {
    bookingReference: string;
}

const emptyRegistrationDraft = (): RegistrationDraft => ({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
});

const createMessageId = (prefix: string) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

interface StreamCallbacks {
    onStart: () => void;
    onDelta: (text: string) => void;
}

const parseSseBlock = (block: string): { event: string; data: any } | null => {
    let event = 'message';
    const dataLines: string[] = [];

    block.split('\n').forEach(line => {
        if (line.startsWith('event:')) {
            event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
        }
    });

    if (!dataLines.length) return null;
    try {
        return { event, data: JSON.parse(dataLines.join('\n')) };
    } catch {
        return null;
    }
};

const streamChatResponse = async (
    sessionId: string,
    message: string,
    callbacks: StreamCallbacks
) => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
    };
    const token = getStoredAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${BACKEND_API_URL}/chat/message/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sessionId, message }),
    });

    if (!response.ok || !response.body) {
        throw new Error(`Stream failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
            const block = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + 2);
            const parsed = parseSseBlock(block);
            if (parsed?.event === 'start') callbacks.onStart();
            if (parsed?.event === 'delta') callbacks.onDelta(parsed.data?.text || '');
            if (parsed?.event === 'done') return parsed.data;
            if (parsed?.event === 'error') throw new Error(parsed.data?.message || 'Stream failed');
            boundary = buffer.indexOf('\n\n');
        }
    }

    throw new Error('Stream ended before completion');
};

const normalizePhoneForRegistration = (value: string) =>
    value.trim().replace(/[()\-\s]/g, '');

const extractBookingReference = (value: string) => {
    const match = value.match(ASPF_REFERENCE_REGEX);
    return (match?.[0] || '').toUpperCase();
};

const normalizePhoneCandidate = (value: string) => value.replace(/[()\-\s.]/g, '');

const extractPhoneNumber = (value: string) => {
    const normalized = normalizePhoneCandidate(value);
    return normalized.match(PHONE_NUMBER_REGEX)?.[0] || '';
};

const extractEmailAddress = (value: string) => value.match(EMAIL_CANDIDATE_REGEX)?.[0]?.toLowerCase() || '';

const looksLikePhoneNumber = (value: string) => Boolean(extractPhoneNumber(value));

const looksLikeReferenceAttempt = (value: string) => {
    const text = value.trim();
    if (!text) return false;
    if (extractBookingReference(text) || /\bASPF\b/i.test(text)) return true;
    if (looksLikePhoneNumber(text) || REFERENCE_CONFUSION_REGEX.test(text) || REFERENCE_NOT_FOUND_REGEX.test(text)) return false;
    if (/\b(ref|reference|appointment\s+(number|code)|booking\s+(number|code))\b/i.test(text) && /\d/.test(text)) return true;
    return /^[A-Z0-9][A-Z0-9\s-]{7,}$/i.test(text) && /\d/.test(text);
};

const buildTrackerLoginUrl = (reference: string) =>
    `/login?redirect=/customer/dashboard?ref=${encodeURIComponent(reference)}`;

const isValidRegistrationPhone = (value: string) => {
    const phone = normalizePhoneForRegistration(value);
    return /^09\d{9}$/.test(phone) || /^\+639\d{9}$/.test(phone) || /^639\d{9}$/.test(phone) || /^\+[1-9]\d{7,14}$/.test(phone);
};

const getNextRegistrationStep = (draft: RegistrationDraft): RegistrationStep => {
    if (!draft.firstName.trim()) return 'firstName';
    if (!draft.lastName.trim()) return 'lastName';
    if (!draft.email.trim()) return 'email';
    if (!draft.phone.trim() && !draft.phoneSkipped) return 'phone';
    return 'submitting';
};

const getRegistrationPromptForStep = (step: RegistrationStep, draft: RegistrationDraft) => {
    if (step === 'firstName') return 'May I have your first name?';
    if (step === 'lastName') return draft.firstName
        ? `Thanks, ${draft.firstName}. What is your last name?`
        : 'What is your last name?';
    if (step === 'email') return 'What email address should we use for your secure setup link?';
    if (step === 'phone') {
        return 'Optional: what mobile number should we place on your account? You can say skip if you prefer.';
    }
    return '';
};

const parseTrackerCorrection = (content: string) => {
    if (!hasCorrectionIntent(content)) return null;

    const reference = extractBookingReference(content);
    if (reference) {
        return { field: 'bookingReference' as const, value: reference };
    }

    const phone = extractPhoneNumber(content);
    if (phone) {
        return { field: 'phone' as const, value: phone };
    }

    return null;
};

const getSessionId = () => {
    if (typeof window === 'undefined') return 'server-session';
    const existing = localStorage.getItem('autospf_chat_session');
    if (existing) return existing;
    const newId = (window.crypto && 'randomUUID' in window.crypto)
        ? window.crypto.randomUUID()
        : `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('autospf_chat_session', newId);
    return newId;
};

const windowVariants: Variants = {
    hidden: { opacity: 0, scale: 0.94, y: 16, originX: 1, originY: 1 },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 380, damping: 32 },
    },
    exit: { opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.16 } },
};

export default function ChatWidget({
    variant = 'landing',
    onOpenBooking,
    currentUserName,
    isAuthenticated,
    className,
}: ChatWidgetProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [screen, setScreen] = useState<ChatScreen>('home');
    const [chatReturnTo, setChatReturnTo] = useState<'home' | 'messages'>('home');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [leadName, setLeadName] = useState('');
    const [leadPhone, setLeadPhone] = useState('');
    const [leadRequired, setLeadRequired] = useState(false);
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [unread, setUnread] = useState(0);
    const [inputFocused, setInputFocused] = useState(false);
    const [registrationStep, setRegistrationStep] = useState<RegistrationStep>('idle');
    const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft>(() => emptyRegistrationDraft());
    const [registrationEmailSent, setRegistrationEmailSent] = useState('');
    const [isResendingSetupEmail, setIsResendingSetupEmail] = useState(false);
    const [trackerStep, setTrackerStep] = useState<TrackerStep>('idle');
    const [trackerDraft, setTrackerDraft] = useState<TrackerDraft>({ bookingReference: '' });

    const endRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const sessionHydratedRef = useRef(false);

    const sessionId = useMemo(() => getSessionId(), []);
    const authed = typeof isAuthenticated === 'boolean'
        ? isAuthenticated
        : typeof window !== 'undefined' && !!localStorage.getItem('autospf_token');

    const conversationPreview = useMemo(
        () => getConversationPreview(messages, registrationStep),
        [messages, registrationStep]
    );

    const homeCardPreview = useMemo(
        () => getHomeCardPreview(messages, registrationStep),
        [messages, registrationStep]
    );

    const relativeTime = useMemo(
        () => formatRelativeTime(getLastActivityTime(messages)),
        [messages]
    );

    const openChat = (returnTo: 'home' | 'messages' = 'home') => {
        setChatReturnTo(returnTo);
        setScreen('chat');
    };

    const handleOpenWidget = () => {
        setIsOpen(prev => {
            if (!prev) {
                setScreen('home');
            }
            return !prev;
        });
    };

    useEffect(() => {
        const stored = localStorage.getItem('autospf_chat_lead');
        if (stored) {
            try {
                const p = JSON.parse(stored);
                setLeadName(p.name || '');
                setLeadPhone(p.phone || '');
            } catch {
                localStorage.removeItem('autospf_chat_lead');
            }
        }
    }, []);

    useEffect(() => {
        if (!isOpen || sessionHydratedRef.current) return;
        sessionHydratedRef.current = true;
        let cancelled = false;

        api.post('/chat/session', { sessionId, source: 'web' })
            .then(res => {
                if (cancelled) return;
                const session = res.data?.session || {};
                if (session.leadName) setLeadName(session.leadName);
                if (session.leadPhone) setLeadPhone(session.leadPhone);

                const hydratedMessages = (res.data?.messages || []).map((m: any) => ({
                    id: m.id || m._id || createMessageId('history'),
                    sender: m.sender,
                    message: m.message,
                    createdAt: m.createdAt,
                    meta: m.metadata,
                }));

                if (hydratedMessages.length) {
                    setMessages(prev => (prev.length ? prev : hydratedMessages));
                }
            })
            .catch(error => {
                console.warn('[ChatWidget] Unable to hydrate chat session:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, sessionId]);

    useEffect(() => {
        if (!isOpen || screen !== 'chat' || (messages.length === 0 && !isSending)) return;
        window.requestAnimationFrame(() => {
            endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
    }, [messages, isOpen, isSending, screen]);

    useEffect(() => {
        if (isOpen) {
            setUnread(0);
            if (screen === 'chat') {
                setTimeout(() => inputRef.current?.focus(), 300);
            }
        }
    }, [isOpen, screen]);

    const appendMessage = (msg: ChatMessage) =>
        setMessages(prev => [...prev, { ...msg, createdAt: msg.createdAt ?? new Date().toISOString() }]);

    const appendAssistant = (message: string, meta?: ChatMessage['meta']) => {
        appendMessage({
            id: createMessageId('assistant'),
            sender: 'assistant',
            message,
            meta,
        });
        setUnread(prev => (isOpen && screen === 'chat' ? 0 : prev + 1));
    };

    const upsertAssistantMessage = (id: string, message: string) => {
        setMessages(prev => {
            const exists = prev.some(msg => msg.id === id);
            if (exists) {
                return prev.map(msg => msg.id === id ? { ...msg, message } : msg);
            }
            return [
                ...prev,
                {
                    id,
                    sender: 'assistant',
                    message,
                    createdAt: new Date().toISOString(),
                },
            ];
        });
    };

    const appendTrackerAssistant = async (message: string, meta?: ChatMessage['meta']) => {
        setIsSending(true);
        try {
            await wait(TRACKER_REPLY_DELAY_MS);
            appendAssistant(message, meta);
        } finally {
            setIsSending(false);
        }
    };

    const beginRegistration = (options?: { includeUserMessage?: boolean }) => {
        setIsOpen(true);
        openChat('home');
        setLeadRequired(false);
        setPendingMessage(null);
        setTrackerStep('idle');
        setTrackerDraft({ bookingReference: '' });
        setRegistrationDraft(emptyRegistrationDraft());
        setRegistrationEmailSent('');
        setRegistrationStep('firstName');
        if (options?.includeUserMessage) {
            appendMessage({ id: createMessageId('user'), sender: 'user', message: 'Create an account' });
        }
        appendAssistant("I'll help you create your AutoSPF+ account.", { type: 'registration' });
        appendAssistant('May I have your first name?', { type: 'registration' });
        window.setTimeout(() => inputRef.current?.focus(), 120);
    };

    useEffect(() => {
        const openRegistration = () => {
            setIsOpen(true);
            if (registrationStep === 'idle' || registrationStep === 'sent') {
                beginRegistration({ includeUserMessage: true });
            } else {
                openChat('home');
                window.setTimeout(() => inputRef.current?.focus(), 120);
            }
        };

        window.addEventListener('autospf:open-chat-registration', openRegistration);
        return () => window.removeEventListener('autospf:open-chat-registration', openRegistration);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registrationStep]);

    const submitChatRegistration = async (draft: RegistrationDraft) => {
        setRegistrationStep('submitting');
        setIsSending(true);
        try {
            const res = await api.post('/auth/chat-registration/start', draft, {
                meta: { suppressErrorToast: true },
            } as any);

            const email = res.data?.data?.email || draft.email;
            setRegistrationEmailSent(email);
            setRegistrationStep('sent');
            const successReply = draft.phoneSkipped
                ? `${buildRegistrationSkipCompletionReply(draft)}\n\nPlease check your inbox for the secure setup link.`
                : "We've sent a secure setup link to your email address. Please open your inbox and continue setting up your password.";
            appendAssistant(successReply, { type: 'registration' });
            toast.success('Verification email sent');
        } catch (error: any) {
            const message = error?.response?.data?.message || 'I could not send the setup email yet. Please try again.';
            appendAssistant(message, { type: 'registration' });
            if (error?.response?.status === 409) {
                setRegistrationStep('idle');
            } else {
                setRegistrationStep('phone');
            }
        } finally {
            setIsSending(false);
        }
    };

    const handleRegistrationInput = async (content: string) => {
        const correction = parseRegistrationCorrection(content, {
            step: registrationStep,
            draft: registrationDraft,
        });

        if (correction) {
            if (correction.needsValue) {
                setRegistrationStep(correction.field);
                appendAssistant(buildCorrectionNeedsValueReply(correction.field), { type: 'registration' });
                return;
            }

            const value = correction.value || '';
            let updatedDraft = clearRegistrationFieldsAfter(registrationDraft, correction.field);
            updatedDraft = { ...updatedDraft, [correction.field]: value };

            if (correction.field === 'email' && !EMAIL_REGEX.test(value)) {
                appendAssistant('Got it, but that email does not look quite right. Please send the correct email address again.', { type: 'registration' });
                return;
            }

            if (correction.field === 'phone' && !isValidRegistrationPhone(normalizePhoneForRegistration(value))) {
                appendAssistant('Got it, but that mobile number does not look quite right. Please send it like 09171234567 or +639171234567.', { type: 'registration' });
                return;
            }

            if ((correction.field === 'firstName' || correction.field === 'lastName') && (value.length < 1 || value.length > 40)) {
                appendAssistant(`Please send a valid ${correction.label}.`, { type: 'registration' });
                return;
            }

            if (correction.field === 'phone') {
                updatedDraft = { ...updatedDraft, phone: normalizePhoneForRegistration(value) };
            }

            setRegistrationDraft(updatedDraft);
            setRegistrationEmailSent('');

            const nextStep = getNextRegistrationStep(updatedDraft);

            if (nextStep === 'submitting') {
                appendAssistant(
                    buildCorrectionConfirmedReply({
                        field: correction.field,
                        value: updatedDraft[correction.field],
                        nextPrompt: 'Perfect. I am preparing your secure password setup link now.',
                    }),
                    { type: 'registration' }
                );
                await submitChatRegistration(updatedDraft);
                return;
            }

            setRegistrationStep(nextStep);
            appendAssistant(
                buildCorrectionConfirmedReply({
                    field: correction.field,
                    value: updatedDraft[correction.field],
                    nextPrompt: getRegistrationPromptForStep(nextStep, updatedDraft),
                }),
                { type: 'registration' }
            );
            return;
        }

        if (hasCorrectionIntent(content)) {
            appendAssistant(buildUnresolvedCorrectionReply(), { type: 'registration' });
            return;
        }

        if (
            registrationStep !== 'idle' &&
            registrationStep !== 'sent' &&
            registrationStep !== 'submitting' &&
            isRegistrationContextualQuestion(content, registrationStep)
        ) {
            const resumePrompt =
                registrationStep === 'lastName' && registrationDraft.firstName
                    ? `Now, thanks ${registrationDraft.firstName} — what is your last name?`
                    : `Now, ${getRegistrationPromptForStep(registrationStep, registrationDraft)}`;
            appendAssistant(
                buildRegistrationInterruptionReply({
                    message: content,
                    step: registrationStep,
                    draft: registrationDraft,
                    resumePrompt,
                }),
                { type: 'registration' }
            );
            return;
        }

        if (registrationStep === 'firstName') {
            const firstName = content.trim().replace(/\s+/g, ' ');
            if (firstName.length < 1 || firstName.length > 40) {
                appendAssistant('Please enter just your first name.', { type: 'registration' });
                return;
            }
            setRegistrationDraft(prev => ({ ...prev, firstName }));
            setRegistrationStep('lastName');
            appendAssistant(`Thanks, ${firstName}. What is your last name?`, { type: 'registration' });
            return;
        }

        if (registrationStep === 'lastName') {
            const lastName = content.trim().replace(/\s+/g, ' ');
            if (lastName.length < 1 || lastName.length > 40) {
                appendAssistant('Please enter just your last name.', { type: 'registration' });
                return;
            }
            setRegistrationDraft(prev => ({ ...prev, lastName }));
            setRegistrationStep('email');
            appendAssistant('What email address should we use for your secure setup link?', { type: 'registration' });
            return;
        }

        if (registrationStep === 'email') {
            const email = content.trim().toLowerCase();
            if (!EMAIL_REGEX.test(email)) {
                appendAssistant('That email does not look quite right. Please enter a valid email address.', { type: 'registration' });
                return;
            }
            setRegistrationDraft(prev => ({ ...prev, email }));
            setRegistrationStep('phone');
            appendAssistant(
                'Optional: what mobile number should we place on your account? You can say skip if you prefer.',
                { type: 'registration' }
            );
            return;
        }

        if (registrationStep === 'phone') {
            if (isSkipOptionalRegistrationFieldIntent(content, 'phone')) {
                const skippedDraft = markRegistrationFieldSkipped(registrationDraft, 'phone');
                setRegistrationDraft(skippedDraft);
                await submitChatRegistration(skippedDraft);
                return;
            }

            const phone = normalizePhoneForRegistration(content);
            if (!isValidRegistrationPhone(phone)) {
                appendAssistant(
                    'That does not look like a mobile number. Send a valid number like 09171234567, or say skip if you prefer not to add one.',
                    { type: 'registration' }
                );
                return;
            }
            const finalDraft = { ...registrationDraft, phone, phoneSkipped: false };
            setRegistrationDraft(finalDraft);
            appendAssistant('Perfect. I am preparing your secure password setup link now.', { type: 'registration' });
            await submitChatRegistration(finalDraft);
        }
    };

    const handleResendSetupEmail = async () => {
        if (!registrationEmailSent || isResendingSetupEmail) return;
        setIsResendingSetupEmail(true);
        try {
            await api.post('/auth/chat-registration/resend', { email: registrationEmailSent }, {
                meta: { suppressErrorToast: true },
            } as any);
            appendAssistant('A fresh secure setup link has been sent to your email.', { type: 'registration' });
            toast.success('Setup email resent');
        } catch (error: any) {
            const retryAfter = error?.response?.data?.data?.retryAfterSeconds;
            const message = retryAfter
                ? `Please wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} before resending.`
                : error?.response?.data?.message || 'Unable to resend the email right now.';
            appendAssistant(message, { type: 'registration' });
        } finally {
            setIsResendingSetupEmail(false);
        }
    };

    const handleChangeRegistrationEmail = () => {
        setRegistrationDraft(prev => ({ ...prev, email: '', phone: '' }));
        setRegistrationEmailSent('');
        setRegistrationStep('email');
        appendAssistant('No problem. What email address should I send the secure setup link to instead?', { type: 'registration' });
        inputRef.current?.focus();
    };

    const appendTrackerLink = async (reference: string) => {
        setTrackerStep('idle');
        setTrackerDraft({ bookingReference: '' });
        await appendTrackerAssistant(TRACKER_LINK_REPLY, {
            type: 'tracker_link',
            trackerUrl: buildTrackerLoginUrl(reference),
            trackerReference: reference,
        });
    };

    const beginNoLoginTrackerLookup = async (message: string) => {
        setLeadRequired(false);
        setPendingMessage(null);
        const reference = extractBookingReference(message);
        const phone = extractPhoneNumber(message);
        if (reference && phone) {
            setTrackerDraft({ bookingReference: reference });
            setTrackerStep('fallbackPhone');
            await verifyTrackerLookup(phone, reference);
            return;
        }
        if (reference) {
            setTrackerDraft({ bookingReference: reference });
            setTrackerStep('fallbackPhone');
            await appendTrackerAssistant(`No worries. I can verify it securely without login. Please enter the registered phone number for ${reference}.`);
            return;
        }
        setTrackerDraft({ bookingReference: '' });
        setTrackerStep('fallbackReference');
        await appendTrackerAssistant('No worries. I can verify it securely without login. Please enter your Appointment Reference Number first.\nIt looks like this: ASPF-XXXXXX-XXXX');
    };

    const beginTrackerLookup = async (message: string) => {
        setLeadRequired(false);
        setPendingMessage(null);
        const reference = extractBookingReference(message);
        if (reference) {
            await appendTrackerLink(reference);
            return;
        }
        setTrackerDraft({ bookingReference: '' });
        setTrackerStep('reference');
        await appendTrackerAssistant(TRACKER_REFERENCE_PROMPT);
    };

    const appendTrackerResult = (tracker: PublicTrackerSummary, trackerUrl: string) => {
        appendAssistant(
            `Verified. Your AutoSPF+ tracker is currently at ${tracker.currentStageLabel || 'Tracker active'}.`,
            { type: 'tracker_result', tracker, trackerUrl }
        );
    };

    const verifyTrackerLookup = async (phone: string, bookingReference = trackerDraft.bookingReference) => {
        if (!bookingReference) {
            setTrackerStep('fallbackReference');
            appendAssistant('Please enter your AutoSPF+ Appointment Reference Number first.');
            return;
        }

        setIsSending(true);
        try {
            const res = await api.post('/chat/tracker/verify', {
                sessionId,
                bookingReference,
                phone,
            }, {
                meta: { suppressErrorToast: true },
            } as any);

            const tracker = res.data?.data?.tracker as PublicTrackerSummary | undefined;
            const trackerUrl = res.data?.data?.trackerUrl || '';
            if (!tracker) {
                throw new Error('Missing tracker payload');
            }

            setTrackerStep('idle');
            setTrackerDraft({ bookingReference: '' });
            appendTrackerResult(tracker, trackerUrl);
        } catch (error: any) {
            const message = error?.response?.data?.message
                || "We couldn't verify that booking. Please check the reference and registered phone number, or use Talk to a protection specialist below.";
            setTrackerStep('fallbackReference');
            setTrackerDraft({ bookingReference: '' });
            appendAssistant(message);
        } finally {
            setIsSending(false);
        }
    };

    const handleTrackerInput = async (content: string) => {
        const correction = parseTrackerCorrection(content);
        if (correction) {
            if (correction.field === 'bookingReference') {
                if (trackerStep === 'fallbackReference' || trackerStep === 'fallbackPhone') {
                    setTrackerDraft({ bookingReference: correction.value });
                    setTrackerStep('fallbackPhone');
                    await appendTrackerAssistant(
                        `Got it! Updated your appointment reference to ${correction.value}.\nNow, what registered mobile number should we verify?`
                    );
                    return;
                }

                appendAssistant(`Got it! Updated your appointment reference to ${correction.value}.`);
                await appendTrackerLink(correction.value);
                return;
            }

            if (correction.field === 'phone') {
                if (trackerDraft.bookingReference) {
                    appendAssistant(`Got it! Updated your registered mobile number to ${correction.value}.`);
                    await verifyTrackerLookup(correction.value);
                    return;
                }

                setTrackerStep('fallbackReference');
                setTrackerDraft({ bookingReference: '' });
                await appendTrackerAssistant(
                    `Got it! Updated your registered mobile number to ${correction.value}.\nNow, please enter your Appointment Reference Number so I can verify it.`
                );
                return;
            }
        }

        if (trackerStep === 'reference') {
            if (NO_LOGIN_TRACKER_REGEX.test(content) || LOGIN_PROBLEM_REGEX.test(content)) {
                await beginNoLoginTrackerLookup(content);
                return;
            }

            if (REFERENCE_CONFUSION_REGEX.test(content)) {
                await appendTrackerAssistant(TRACKER_REFERENCE_EXPLANATION_REPLY);
                return;
            }

            if (REFERENCE_NOT_FOUND_REGEX.test(content)) {
                setTrackerStep('phoneLookup');
                await appendTrackerAssistant(TRACKER_PHONE_LOOKUP_PROMPT);
                return;
            }

            const reference = extractBookingReference(content);
            if (reference) {
                await appendTrackerLink(reference);
                return;
            }

            if (looksLikePhoneNumber(content)) {
                setTrackerStep('idle');
                setTrackerDraft({ bookingReference: '' });
                await appendTrackerAssistant(TRACKER_PHONE_LOOKUP_REPLY);
                return;
            }

            if (looksLikeReferenceAttempt(content)) {
                await appendTrackerAssistant(TRACKER_INVALID_REFERENCE_REPLY);
                return;
            }

            await appendTrackerAssistant(TRACKER_REFERENCE_EXPLANATION_REPLY);
            return;
        }

        if (trackerStep === 'phoneLookup') {
            setTrackerStep('idle');
            setTrackerDraft({ bookingReference: '' });
            await appendTrackerAssistant(TRACKER_PHONE_LOOKUP_REPLY);
            return;
        }

        if (trackerStep === 'fallbackReference') {
            const reference = extractBookingReference(content);
            if (!reference) {
                await appendTrackerAssistant('Please enter a valid AutoSPF+ Appointment Reference Number in this format: ASPF-XXXXXX-XXXX.');
                return;
            }
            setTrackerDraft({ bookingReference: reference });
            setTrackerStep('fallbackPhone');
            await appendTrackerAssistant(`Thanks. Now enter the registered phone number for ${reference}.`);
            return;
        }

        if (trackerStep === 'fallbackPhone') {
            await verifyTrackerLookup(content);
        }
    };

    const sendMessage = async (content: string) => {
        let data: any;
        let streamStarted = false;
        let streamedReply = '';
        const assistantId = createMessageId('assistant-stream');

        try {
            data = await streamChatResponse(sessionId, content, {
                onStart: () => {
                    if (!streamStarted) {
                        streamStarted = true;
                        setIsSending(false);
                        upsertAssistantMessage(assistantId, '');
                    }
                },
                onDelta: (text: string) => {
                    if (!text) return;
                    if (!streamStarted) {
                        streamStarted = true;
                        setIsSending(false);
                    }
                    streamedReply += text;
                    upsertAssistantMessage(assistantId, streamedReply);
                },
            });
        } catch (networkErr) {
            if (streamStarted) {
                console.error('[ChatWidget] Stream error:', networkErr);
                throw new Error('Network error');
            }

            try {
                const res = await api.post('/chat/message', {
                    sessionId,
                    message: content,
                });
                data = res.data;
            } catch (fallbackErr) {
                console.error('[ChatWidget] Network error:', fallbackErr);
                throw new Error('Network error');
            }
        }

        const reply = data?.reply || streamedReply || 'Sorry, I could not generate a response.';

        if (streamStarted) {
            upsertAssistantMessage(assistantId, reply);
        } else {
            appendMessage({ id: createMessageId('assistant'), sender: 'assistant', message: reply });
        }
        setUnread(prev => (isOpen && screen === 'chat' ? 0 : prev + 1));

        if (data?.action?.type === 'open_booking' && onOpenBooking) {
            onOpenBooking({ name: data.action.name, serviceName: data.action.serviceName });
        }
        if (data?.action?.type === 'tracker_prompt') {
            setTrackerStep('reference');
            setTrackerDraft({ bookingReference: '' });
        }
        if (data?.leadRequired) {
            setLeadRequired(true);
            setPendingMessage(content);
        }
    };

    const handleSend = async (overrideText?: string) => {
        const trimmed = (overrideText ?? input).trim();
        if (!trimmed) return;

        if (screen !== 'chat') {
            openChat(chatReturnTo);
        }

        appendMessage({ id: createMessageId('user'), sender: 'user', message: trimmed });
        setInput('');

        if (registrationStep === 'submitting') {
            appendAssistant('I am still securing your account setup. One moment please.', { type: 'registration' });
            return;
        }

        if (registrationStep === 'sent' && hasCorrectionIntent(trimmed)) {
            await handleRegistrationInput(trimmed);
            return;
        }

        if (registrationStep !== 'idle' && registrationStep !== 'sent') {
            await handleRegistrationInput(trimmed);
            return;
        }

        if (trackerStep !== 'idle') {
            await handleTrackerInput(trimmed);
            return;
        }

        if (NO_LOGIN_TRACKER_REGEX.test(trimmed)) {
            await beginNoLoginTrackerLookup(trimmed);
            return;
        }

        if (TRACKER_INTENT_REGEX.test(trimmed)) {
            await beginTrackerLookup(trimmed);
            return;
        }

        if (!authed && SIGNUP_INTENT_REGEX.test(trimmed)) {
            beginRegistration();
            return;
        }

        const needsLead =
            !authed &&
            !leadName &&
            !leadPhone &&
            QUOTE_INTENT_REGEX.test(trimmed) &&
            CUSTOM_QUOTE_LEAD_REGEX.test(trimmed) &&
            !PRICE_LIST_INTENT_REGEX.test(trimmed);
        if (needsLead) {
            setLeadRequired(true);
            setPendingMessage(trimmed);
            appendMessage({
                id: createMessageId('assistant'),
                sender: 'assistant',
                message: 'Before I can provide a quote, please share your name and phone number.',
            });
            return;
        }

        setIsSending(true);
        try {
            await sendMessage(trimmed);
        } catch {
            toast.error('Unable to send message.');
        } finally {
            setIsSending(false);
        }
    };

    const handleLeadSubmit = async () => {
        if (!leadName.trim() || !leadPhone.trim()) {
            toast.error('Please enter your name and phone number.');
            return;
        }
        try {
            const res = await api.post('/chat/lead', {
                sessionId,
                name: leadName.trim(),
                phone: leadPhone.trim(),
            });
            localStorage.setItem('autospf_chat_lead', JSON.stringify({ name: leadName.trim(), phone: leadPhone.trim() }));
            setLeadRequired(false);
            if (res.data?.reply) {
                appendMessage({ id: createMessageId('assistant'), sender: 'assistant', message: res.data.reply });
                if (res.data?.action?.type === 'open_booking' && onOpenBooking) {
                    onOpenBooking({ name: res.data.action.name, serviceName: res.data.action.serviceName });
                }
            } else if (pendingMessage) {
                await sendMessage(pendingMessage);
            }
            setPendingMessage(null);
        } catch {
            toast.error('Unable to save lead details.');
        }
    };

    const handleHandoff = async () => {
        const lastUserMessage = [...messages].reverse().find(m => m.sender === 'user')?.message;
        try {
            const res = await api.post('/chat/handoff', { sessionId, lastMessage: lastUserMessage });
            if (res.data?.success) {
                appendMessage({
                    id: createMessageId('assistant'),
                    sender: 'assistant',
                    message: 'Let me connect you with a specialist who can help you better! Please use Talk to a protection specialist below.',
                });
                toast.success('Human handoff requested.');
            }
        } catch {
            toast.error('Unable to request a human agent.');
        }
    };

    const chatInputPlaceholder =
        registrationStep === 'firstName' ? 'First name'
            : registrationStep === 'lastName' ? 'Last name'
                : registrationStep === 'email' ? 'Email address'
                    : registrationStep === 'phone' ? 'Mobile number'
                        : registrationStep === 'submitting' ? 'Securing your setup link...'
                            : registrationStep === 'sent' ? 'Email sent. Ask me anything'
                                : trackerStep === 'reference' ? 'Booking reference'
                                    : trackerStep === 'phoneLookup' ? 'Registered mobile number'
                                        : trackerStep === 'fallbackReference' ? 'Appointment reference'
                                            : trackerStep === 'fallbackPhone' ? 'Registered phone number'
                                        : 'Message...';

    const windowHeight =
        variant === 'customer'
            ? 'min(690px, calc(100dvh - 112px))'
            : 'min(720px, calc(100dvh - 112px))';

    return (
        <div className={className || 'fixed bottom-4 right-3 left-3 sm:left-auto sm:bottom-6 sm:right-6 z-[60] flex flex-col items-end gap-3'}>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="chat-window"
                        variants={windowVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className={`${chatWindowClass} sm:w-[400px] sm:max-w-[400px]`}
                        style={{
                            height: windowHeight,
                            maxHeight: 'calc(100dvh - 88px)',
                        }}
                    >
                        {screen === 'home' && (
                            <ChatHomeScreen
                                preview={homeCardPreview}
                                relativeTime={relativeTime}
                                currentUserName={currentUserName}
                                onClose={() => setIsOpen(false)}
                                onOpenChat={() => openChat('home')}
                                onOpenMessages={() => setScreen('messages')}
                            />
                        )}

                        {screen === 'messages' && (
                            <ChatMessagesScreen
                                preview={conversationPreview}
                                relativeTime={relativeTime}
                                onClose={() => setIsOpen(false)}
                                onOpenChat={() => openChat('messages')}
                                onOpenHome={() => setScreen('home')}
                            />
                        )}

                        {screen === 'chat' && (
                            <ChatConversationScreen
                                messages={messages}
                                input={input}
                                inputFocused={inputFocused}
                                chatInputPlaceholder={chatInputPlaceholder}
                                isSending={isSending}
                                registrationStep={registrationStep}
                                registrationEmailSent={registrationEmailSent}
                                isResendingSetupEmail={isResendingSetupEmail}
                                leadRequired={leadRequired}
                                leadName={leadName}
                                leadPhone={leadPhone}
                                currentUserName={currentUserName}
                                endRef={endRef}
                                inputRef={inputRef}
                                onBack={() => setScreen(chatReturnTo)}
                                onClose={() => setIsOpen(false)}
                                onInputChange={setInput}
                                onInputFocus={() => setInputFocused(true)}
                                onInputBlur={() => setInputFocused(false)}
                                onSend={() => void handleSend()}
                                onLeadNameChange={setLeadName}
                                onLeadPhoneChange={setLeadPhone}
                                onLeadSubmit={() => void handleLeadSubmit()}
                                onHandoff={() => void handleHandoff()}
                                onResendSetupEmail={() => void handleResendSetupEmail()}
                                onChangeRegistrationEmail={handleChangeRegistrationEmail}
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                onClick={handleOpenWidget}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#0066FF] shadow-[0_6px_24px_rgba(0,102,255,0.38)] transition-shadow hover:shadow-[0_8px_28px_rgba(0,102,255,0.45)] cursor-pointer"
                aria-label={isOpen ? 'Close chat' : 'Open chat'}
            >
                <AnimatePresence mode="wait" initial={false}>
                    {isOpen ? (
                        <motion.span
                            key="chevron"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.15 }}
                        >
                            <ChevronDown className="h-6 w-6 text-white" strokeWidth={2.25} />
                        </motion.span>
                    ) : (
                        <motion.span
                            key="bubble"
                            initial={{ rotate: 90, opacity: 0, scale: 0.8 }}
                            animate={{ rotate: 0, opacity: 1, scale: 1 }}
                            exit={{ rotate: -90, opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.15 }}
                        >
                            <LauncherBubbleIcon />
                        </motion.span>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {!isOpen && unread > 0 && (
                        <motion.span
                            key="badge"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                            className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white"
                        >
                            {unread}
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.button>
        </div>
    );
}
