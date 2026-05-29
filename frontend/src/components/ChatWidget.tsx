import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import api, { BACKEND_API_URL, getStoredAuthToken } from '@/lib/api';
import {
    hasCorrectionIntent,
} from '@/lib/chat-onboarding-correction';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { chatWindowClass } from '@/components/chat/chat-theme';
import {
    getChatGuestKey,
    getLegacyChatSessionId,
    setStoredActiveConversationId,
} from '@/lib/chat-threads';
import {
    type ChatConversationThread,
    type ChatMessage,
    type ChatScreen,
    type PublicTrackerSummary,
    type RegistrationStep,
    getThreadPreview,
    getThreadRelativeTime,
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
const GREETING_ONLY_REGEX =
    /^(?:hi|hello|hey|heya|good\s+(?:morning|afternoon|evening)|kamusta|kumusta)(?:\s+(?:there|po)?)?[\s!.?,]*$/i;
const SIGNUP_INTENT_REGEX =
    /^(?:sign\s*up|signup|register)\s*[\s!.?,]*$|\b(create|make|open|start|set\s*up|setup|register|sign\s*up|signup)\b[\s\S]{0,60}\b(account|acct|acc|profile)\b|\b(register\s+me|sign\s+me\s+up|signup\s+ako|pa\s*register|pa[\s-]*register)\b|\b(gawan|gawa|gumawa|igawa|iregister|i-register)\b[\s\S]{0,60}\b(ako|mo|account|acct|acc|profile)\b|\b(gawa|create|make)\s+(an?\s+)?(acc|acct|account)\b|\b(want|need|gusto|gusto\s+ko|i\s+want|i\s+need)\b[\s\S]{0,40}\b(an?\s+)?(account|acct|acc|profile)\b|\b(mag|gusto)\s*[\s-]*register\b/i;
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

interface SendMessageOptions {
    applyActions?: boolean;
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
    conversationId: string,
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
        body: JSON.stringify({ conversationId, sessionId: conversationId, message }),
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

const extractBookingReference = (value: string) => {
    const match = value.match(ASPF_REFERENCE_REGEX);
    return (match?.[0] || '').toUpperCase();
};

const normalizePhoneCandidate = (value: string) => value.replace(/[()\-\s.]/g, '');

const extractPhoneNumber = (value: string) => {
    const normalized = normalizePhoneCandidate(value);
    return normalized.match(PHONE_NUMBER_REGEX)?.[0] || '';
};

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

const getRegistrationPromptForStep = (step: RegistrationStep, draft: RegistrationDraft) => {
    if (step === 'firstName') return 'May I have your first name?';
    if (step === 'lastName') return draft.firstName
        ? `Thanks, ${draft.firstName}. What is your last name?`
        : 'What is your last name?';
    if (step === 'email') return 'What email address should we use for your secure setup link?';
    if (step === 'phone') {
        return 'What mobile number should we place on your account?';
    }
    return '';
};

const getRegistrationResumePrompt = (step: RegistrationStep, draft: RegistrationDraft) => {
    if (step === 'lastName' && draft.firstName) {
        return `Now, thanks ${draft.firstName} — what is your last name?`;
    }
    return `Now, ${getRegistrationPromptForStep(step, draft)}`;
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

const mapApiMessages = (rows: any[] = []): ChatMessage[] =>
    rows.map((m: any) => ({
        id: m.id || m._id || createMessageId('history'),
        sender: m.sender,
        message: m.message,
        createdAt: m.createdAt,
        meta: m.metadata,
    }));

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
    const [conversations, setConversations] = useState<ChatConversationThread[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

    const endRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const inboxHydratedRef = useRef(false);

    const latestThread = conversations[0] ?? null;
    const authed = typeof isAuthenticated === 'boolean'
        ? isAuthenticated
        : typeof window !== 'undefined' && !!localStorage.getItem('autospf_token');

    const activeThread = useMemo(
        () => conversations.find((thread) => thread.conversationId === activeConversationId) || null,
        [conversations, activeConversationId]
    );

    const inboxPreview = useMemo(
        () => getThreadPreview(latestThread, registrationStep),
        [latestThread, registrationStep]
    );

    const inboxRelativeTime = useMemo(
        () => getThreadRelativeTime(latestThread),
        [latestThread]
    );

    const resetThreadLocalState = () => {
        setRegistrationStep('idle');
        setRegistrationDraft(emptyRegistrationDraft());
        setRegistrationEmailSent('');
        setTrackerStep('idle');
        setTrackerDraft({ bookingReference: '' });
        setLeadRequired(false);
        setPendingMessage(null);
    };

    const loadConversationsList = async () => {
        const guestKey = getChatGuestKey();
        const legacySessionId = getLegacyChatSessionId();
        const res = await api.get('/chat/conversations', {
            params: {
                guestKey,
                ...(legacySessionId ? { legacySessionId } : {}),
            },
        });
        const list = (res.data?.conversations || []) as ChatConversationThread[];
        setConversations(list);
        return list;
    };

    const openConversation = async (
        conversationId: string,
        returnTo: 'home' | 'messages' = 'messages'
    ) => {
        setIsSending(true);
        try {
            resetThreadLocalState();
            const res = await api.get(`/chat/conversations/${conversationId}`, {
                params: { guestKey: getChatGuestKey() },
            });
            const hydrated = mapApiMessages(res.data?.messages || []);
            setActiveConversationId(conversationId);
            setStoredActiveConversationId(conversationId);
            setMessages(hydrated);
            syncRegistrationFromBackend({ session: res.data?.session });
            setChatReturnTo(returnTo);
            setScreen('chat');
            setIsOpen(true);
        } catch (error) {
            console.warn('[ChatWidget] Unable to open conversation:', error);
            toast.error('Unable to open this conversation.');
        } finally {
            setIsSending(false);
        }
    };

    const createNewConversation = async (returnTo: 'home' | 'messages' = 'home') => {
        setIsSending(true);
        try {
            resetThreadLocalState();
            const res = await api.post('/chat/conversations', {
                guestKey: getChatGuestKey(),
                source: 'web',
            });
            const conversation = res.data?.conversation as ChatConversationThread;
            const hydrated = mapApiMessages(res.data?.messages || []);
            if (!conversation?.conversationId) {
                throw new Error('Missing conversationId');
            }
            setConversations((prev) => [
                conversation,
                ...prev.filter((item) => item.conversationId !== conversation.conversationId),
            ]);
            setActiveConversationId(conversation.conversationId);
            setStoredActiveConversationId(conversation.conversationId);
            setMessages(hydrated);
            syncRegistrationFromBackend({ session: res.data?.session });
            setChatReturnTo(returnTo);
            setScreen('chat');
            setIsOpen(true);
        } catch (error) {
            console.warn('[ChatWidget] Unable to create conversation:', error);
            toast.error('Unable to start a new conversation.');
        } finally {
            setIsSending(false);
        }
    };

    const openChat = (returnTo: 'home' | 'messages' = 'home') => {
        setChatReturnTo(returnTo);
        setScreen('chat');
    };

    const handleOpenRecent = () => {
        if (latestThread) {
            void openConversation(latestThread.conversationId, 'home');
            return;
        }
        void createNewConversation('home');
    };

    const handleAskQuestion = () => {
        void createNewConversation(screen === 'messages' ? 'messages' : 'home');
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
        if (!isOpen || inboxHydratedRef.current) return;
        inboxHydratedRef.current = true;
        let cancelled = false;

        loadConversationsList()
            .then((list) => {
                if (cancelled) return;
                const storedActive = getLegacyChatSessionId();
                if (storedActive && list.some((thread) => thread.conversationId === storedActive)) {
                    setActiveConversationId(storedActive);
                }
            })
            .catch((error) => {
                console.warn('[ChatWidget] Unable to load conversations:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen]);

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

    useEffect(() => {
        if (registrationStep !== 'submitting' || !activeConversationId) return undefined;

        let cancelled = false;
        const poll = async () => {
            if (cancelled) return;
            try {
                const res = await api.get(`/chat/conversations/${activeConversationId}`, {
                    params: { guestKey: getChatGuestKey() },
                    meta: { suppressErrorToast: true },
                } as any);
                if (cancelled) return;

                syncRegistrationFromBackend({ session: res.data?.session });
                const status = res.data?.session?.onboarding?.status;
                if (status !== 'sent' && status !== 'failed') return;

                const assistantMessages = [...(res.data?.messages || [])]
                    .filter((entry: any) => entry.sender === 'assistant');
                const outcomeMessage = [...assistantMessages]
                    .reverse()
                    .find((entry: any) =>
                        ['account_onboarding_complete', 'account_onboarding_failed', 'account_onboarding_outcome']
                            .includes(entry?.metadata?.type)
                    ) || assistantMessages[assistantMessages.length - 1];
                if (!outcomeMessage?.message) return;

                const normalized = String(outcomeMessage.message).trim();
                setMessages((prev) => {
                    if (prev.some((msg) => msg.sender === 'assistant' && msg.message.trim() === normalized)) {
                        return prev;
                    }
                    return [...prev, ...mapApiMessages([outcomeMessage])];
                });

                const email = res.data?.session?.onboarding?.draft?.email;
                if (status === 'sent' && email) {
                    setRegistrationEmailSent(email);
                }
            } catch {
                // ignore polling errors
            }
        };

        void poll();
        const intervalId = window.setInterval(() => {
            void poll();
        }, 2500);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [registrationStep, activeConversationId]);

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

    const syncRegistrationFromBackend = (payload: any = {}) => {
        const metadata = payload?.metadata || payload || {};
        const onboarding = payload?.onboarding || payload?.session?.onboarding || null;
        const status = metadata.onboardingStatus || onboarding?.status;
        const step = metadata.onboardingStep || onboarding?.step;
        const draft = onboarding?.draft;

        if (draft) {
            setRegistrationDraft({
                firstName: draft.firstName || '',
                lastName: draft.lastName || '',
                email: draft.email || '',
                phone: draft.phone || '',
            });
        }

        if (status === 'sent' || metadata.type === 'account_onboarding_complete') {
            setRegistrationStep('sent');
            if (metadata.email) setRegistrationEmailSent(metadata.email);
            if (draft?.email) setRegistrationEmailSent(draft.email);
            return;
        }

        if (status === 'submitting') {
            setRegistrationStep('submitting');
            return;
        }

        if (status === 'failed') {
            setRegistrationStep(
                ['firstName', 'lastName', 'email', 'phone'].includes(step) ? (step as RegistrationStep) : 'email'
            );
            return;
        }

        if (status === 'collecting' && ['firstName', 'lastName', 'email', 'phone'].includes(step)) {
            setRegistrationStep(step as RegistrationStep);
        }
    };

    const recoverRegistrationStateAfterError = async () => {
        const conversationId = activeConversationId || await ensureActiveConversationId().catch(() => null);
        if (!conversationId) return false;

        const res = await api.get(`/chat/conversations/${conversationId}`, {
            params: { guestKey: getChatGuestKey() },
            meta: { suppressErrorToast: true },
        } as any);

        syncRegistrationFromBackend({ session: res.data?.session, metadata: res.data?.messages?.at(-1)?.metadata });
        const lastAssistant = [...(res.data?.messages || [])]
            .reverse()
            .find((entry: any) => entry.sender === 'assistant');
        if (lastAssistant?.message) {
            const normalized = String(lastAssistant.message).trim();
            setMessages((prev) => {
                if (prev.some((msg) => msg.sender === 'assistant' && msg.message.trim() === normalized)) {
                    return prev;
                }
                return [
                    ...prev,
                    ...mapApiMessages([lastAssistant]),
                ];
            });
            return true;
        }
        return false;
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

    const beginRegistration = async (options?: { includeUserMessage?: boolean; triggerMessage?: string }) => {
        setIsSending(true);
        try {
            await createNewConversation('home');
            if (options?.includeUserMessage) {
                appendMessage({
                    id: createMessageId('user'),
                    sender: 'user',
                    message: options.triggerMessage || 'Create an account',
                });
            }
            await sendMessage(options?.triggerMessage || 'Create an account');
        } catch {
            setRegistrationStep('firstName');
            appendAssistant("I'll help you create your AutoSPF+ account.", { type: 'registration' });
            appendAssistant('May I have your first name?', { type: 'registration' });
        } finally {
            setIsSending(false);
        }
        window.setTimeout(() => inputRef.current?.focus(), 120);
    };

    useEffect(() => {
        const openRegistration = () => {
            setIsOpen(true);
            if (registrationStep === 'idle' || registrationStep === 'sent') {
                void beginRegistration({ includeUserMessage: true });
            } else {
                openChat('home');
                window.setTimeout(() => inputRef.current?.focus(), 120);
            }
        };

        window.addEventListener('autospf:open-chat-registration', openRegistration);
        return () => window.removeEventListener('autospf:open-chat-registration', openRegistration);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registrationStep]);

    const handleRegistrationInput = async (content: string) => {
        setIsSending(true);
        try {
            await sendMessage(content);
        } catch {
            const recovered = await recoverRegistrationStateAfterError().catch(() => false);
            if (!recovered) {
                const resumeStep = registrationStep === 'submitting' ? 'email' : registrationStep;
                appendAssistant(
                    `I could not reach the secure onboarding service right now.\n\n${getRegistrationResumePrompt(resumeStep, registrationDraft)}`,
                    { type: 'registration' }
                );
            }
        } finally {
            setIsSending(false);
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
            const conversationId = await ensureActiveConversationId();
            const res = await api.post('/chat/tracker/verify', {
                conversationId,
                sessionId: conversationId,
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

    const ensureActiveConversationId = async (): Promise<string> => {
        if (activeConversationId) return activeConversationId;
        const res = await api.post('/chat/conversations', {
            guestKey: getChatGuestKey(),
            source: 'web',
        });
        const conversation = res.data?.conversation as ChatConversationThread;
        const hydrated = mapApiMessages(res.data?.messages || []);
        if (!conversation?.conversationId) {
            throw new Error('Missing conversationId');
        }
        setConversations((prev) => [
            conversation,
            ...prev.filter((item) => item.conversationId !== conversation.conversationId),
        ]);
        setActiveConversationId(conversation.conversationId);
        setStoredActiveConversationId(conversation.conversationId);
        setMessages(hydrated);
        syncRegistrationFromBackend({ session: res.data?.session });
        return conversation.conversationId;
    };

    const sendMessage = async (content: string, options: SendMessageOptions = {}) => {
        const applyActions = options.applyActions !== false;
        const conversationId = await ensureActiveConversationId();
        let data: any;
        let streamStarted = false;
        let streamedReply = '';
        const assistantId = createMessageId('assistant-stream');

        try {
            data = await streamChatResponse(conversationId, content, {
                onStart: () => {
                    streamStarted = true;
                },
                onDelta: (text: string) => {
                    if (!text) return;
                    streamStarted = true;
                    streamedReply += text;
                    upsertAssistantMessage(assistantId, streamedReply);
                    if (streamedReply.trim()) {
                        setIsSending(false);
                    }
                },
            });
        } catch (networkErr) {
            if (streamStarted) {
                console.error('[ChatWidget] Stream error:', networkErr);
                try {
                    const res = await api.post('/chat/message', {
                        conversationId,
                        sessionId: conversationId,
                        message: content,
                    });
                    data = res.data;
                } catch (fallbackErr) {
                    console.error('[ChatWidget] Fallback message error:', fallbackErr);
                    throw new Error('Network error');
                }
            } else {
                try {
                    const res = await api.post('/chat/message', {
                        conversationId,
                        sessionId: conversationId,
                        message: content,
                    });
                    data = res.data;
                } catch (fallbackErr) {
                    console.error('[ChatWidget] Network error:', fallbackErr);
                    throw new Error('Network error');
                }
            }
        }

        const reply = data?.reply || streamedReply || 'Sorry, I could not generate a response.';
        syncRegistrationFromBackend({ ...data, metadata: data?.metadata || data });

        if (streamStarted) {
            upsertAssistantMessage(assistantId, reply);
        } else {
            appendMessage({ id: createMessageId('assistant'), sender: 'assistant', message: reply });
        }
        setConversations((prev) => {
            const preview = content.trim() || reply.trim();
            const next = prev.map((thread) =>
                thread.conversationId === conversationId
                    ? {
                        ...thread,
                        lastMessagePreview: preview.slice(0, 120),
                        lastMessageAt: new Date().toISOString(),
                    }
                    : thread
            );
            const current = next.find((thread) => thread.conversationId === conversationId);
            if (!current) return prev;
            return [current, ...next.filter((thread) => thread.conversationId !== conversationId)];
        });
        setUnread(prev => (isOpen && screen === 'chat' ? 0 : prev + 1));

        if (applyActions && data?.action?.type === 'open_booking' && onOpenBooking) {
            onOpenBooking({ name: data.action.name, serviceName: data.action.serviceName });
        }
        if (applyActions && data?.action?.type === 'tracker_prompt') {
            setTrackerStep('reference');
            setTrackerDraft({ bookingReference: '' });
        }
        if (applyActions && data?.leadRequired) {
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
            if (/\b(try\s+again|retry|resend|ulitin|subukan\s+muli)\b/i.test(trimmed)) {
                await handleRegistrationInput(trimmed);
                return;
            }
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

        if (!authed && !GREETING_ONLY_REGEX.test(trimmed) && SIGNUP_INTENT_REGEX.test(trimmed)) {
            setIsSending(true);
            try {
                await sendMessage(trimmed);
            } catch {
                if (SIGNUP_INTENT_REGEX.test(trimmed)) {
                    await beginRegistration({ triggerMessage: trimmed });
                }
            } finally {
                setIsSending(false);
            }
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
            const conversationId = await ensureActiveConversationId();
            const res = await api.post('/chat/lead', {
                conversationId,
                sessionId: conversationId,
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
            const conversationId = await ensureActiveConversationId();
            const res = await api.post('/chat/handoff', {
                conversationId,
                sessionId: conversationId,
                lastMessage: lastUserMessage,
            });
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
                                preview={inboxPreview}
                                relativeTime={inboxRelativeTime}
                                hasRecentThread={Boolean(latestThread)}
                                currentUserName={currentUserName}
                                onClose={() => setIsOpen(false)}
                                onOpenRecent={handleOpenRecent}
                                onAskQuestion={handleAskQuestion}
                                onOpenMessages={() => setScreen('messages')}
                            />
                        )}

                        {screen === 'messages' && (
                            <ChatMessagesScreen
                                conversations={conversations}
                                registrationStep={registrationStep}
                                onClose={() => setIsOpen(false)}
                                onSelectConversation={(id) => void openConversation(id, 'messages')}
                                onAskQuestion={handleAskQuestion}
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
