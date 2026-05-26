import { useEffect, useMemo, useRef, useState } from 'react';
import {
    MessageCircle,
    X,
    Send,
    User,
    PhoneCall,
    Headset,
    Sparkles,
    ArrowRight,
    Bot,
    ReceiptText,
    CheckCircle2,
    CalendarDays,
    MapPinned,
    Radio,
    ShieldCheck,
    Zap,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';

/* ─────────────────────── Types ─────────────────────── */
interface ChatMessage {
    id: string;
    sender: 'user' | 'assistant' | 'system';
    message: string;
    createdAt?: string;
}

interface ChatWidgetProps {
    variant?: 'customer' | 'landing';
    onOpenBooking?: (payload: { name?: string; serviceName?: string }) => void;
    currentUserName?: string;
    isAuthenticated?: boolean;
    className?: string;
}

/* ─────────────────────── Helpers ─────────────────────── */
const QUOTE_INTENT_REGEX = /(quote|price|cost|how much|pricing|estimate)/i;

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

/* ─────────────────────── Quick-reply tiles ─────────────────────── */
const QUICK_REPLIES = [
    {
        label: 'SPF Prices',
        detail: 'Vehicle packages',
        prompt: 'What are your SPF package prices? I have a sedan.',
        Icon: ReceiptText,
        accent: '#fbbf24',
        glow: 'rgba(251, 191, 36, 0.24)',
    },
    {
        label: 'How to Book',
        detail: 'Reserve a slot',
        prompt: 'How do I book a service on the AutoSPF+ website?',
        Icon: CalendarDays,
        accent: '#22d3ee',
        glow: 'rgba(34, 211, 238, 0.18)',
    },
    {
        label: 'Login Help',
        detail: 'Account dashboard',
        prompt: 'How do I log in or register on AutoSPF+?',
        Icon: CheckCircle2,
        accent: '#34d399',
        glow: 'rgba(52, 211, 153, 0.18)',
    },
    {
        label: 'Shop Info',
        detail: 'Location & contact',
        prompt: 'Where is AutoSPF+ located and how can I contact you?',
        Icon: MapPinned,
        accent: '#fb7185',
        glow: 'rgba(251, 113, 133, 0.18)',
    },
];

const SIGNAL_BARS = [16, 24, 13, 30, 20, 27, 15, 23];

/* ─────────────────────── Framer variants ─────────────────────── */
const EASE = [0.16, 1, 0.3, 1] as const;

const windowVariants: Variants = {
    hidden: {
        opacity: 0,
        scale: 0.9,
        y: 26,
        rotateX: 7,
        originX: 1,
        originY: 1,
        filter: 'blur(8px)',
    },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        rotateX: 0,
        filter: 'blur(0px)',
        transition: { type: 'spring', stiffness: 360, damping: 31, mass: 0.85 },
    },
    exit: {
        opacity: 0,
        scale: 0.92,
        y: 18,
        filter: 'blur(6px)',
        transition: { duration: 0.18, ease: 'easeIn' },
    },
};

const msgVariants: Variants = {
    hidden: { opacity: 0, y: 12, scale: 0.96 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.28, ease: EASE } },
};

const chipVariants: Variants = {
    hidden: { opacity: 0, y: 12, scale: 0.92 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.42, ease: EASE, delay: 0.2 + i * 0.075 },
    }),
};

/* ═══════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════ */
export default function ChatWidget({
    variant = 'landing',
    onOpenBooking,
    currentUserName,
    isAuthenticated,
    className,
}: ChatWidgetProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [leadName, setLeadName] = useState('');
    const [leadPhone, setLeadPhone] = useState('');
    const [leadRequired, setLeadRequired] = useState(false);
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [unread, setUnread] = useState(0);
    const [inputFocused, setInputFocused] = useState(false);

    const endRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const sessionId = useMemo(() => getSessionId(), []);
    const authed = typeof isAuthenticated === 'boolean'
        ? isAuthenticated
        : typeof window !== 'undefined' && !!localStorage.getItem('autospf_token');

    /* ── Restore lead from localStorage ── */
    useEffect(() => {
        const stored = localStorage.getItem('autospf_chat_lead');
        if (stored) {
            try {
                const p = JSON.parse(stored);
                setLeadName(p.name || '');
                setLeadPhone(p.phone || '');
            } catch { localStorage.removeItem('autospf_chat_lead'); }
        }
    }, []);

    /* ── Auto-scroll only after real conversation activity ── */
    useEffect(() => {
        if (!isOpen || (messages.length === 0 && !isSending)) return;
        window.requestAnimationFrame(() => {
            endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        });
    }, [messages, isOpen, isSending]);

    /* ── Clear unread when opened ── */
    useEffect(() => {
        if (isOpen) {
            setUnread(0);
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    /* ─── Send helpers ─── */
    const appendMessage = (msg: ChatMessage) => setMessages(prev => [...prev, msg]);

    /* ── Send via backend (same pipeline as mobile) ── */
    const sendMessage = async (content: string) => {
        let data: any;
        try {
            const res = await api.post('/chat/message', {
                sessionId,
                message: content,
            });
            data = res.data;
        } catch (networkErr) {
            console.error('[ChatWidget] Network error:', networkErr);
            throw new Error('Network error');
        }

        const reply = data?.reply || 'Sorry, I could not generate a response.';

        appendMessage({ id: `assistant-${Date.now()}`, sender: 'assistant', message: reply });
        setUnread(prev => isOpen ? 0 : prev + 1);

        // Handle action chips or booking redirects from backend
        if (data?.action?.type === 'open_booking' && onOpenBooking) {
            onOpenBooking({ name: data.action.name, serviceName: data.action.serviceName });
        }
        if (data?.leadRequired) {
            setLeadRequired(true);
            setPendingMessage(content);
        }
    };

    const handleSend = async (overrideText?: string) => {
        const trimmed = (overrideText ?? input).trim();
        if (!trimmed) return;

        appendMessage({ id: `user-${Date.now()}`, sender: 'user', message: trimmed });
        setInput('');

        const needsLead = !authed && !leadName && !leadPhone && QUOTE_INTENT_REGEX.test(trimmed);
        if (needsLead) {
            setLeadRequired(true);
            setPendingMessage(trimmed);
            appendMessage({
                id: `assistant-${Date.now()}`, sender: 'assistant',
                message: 'Before I can provide a quote, please share your name and phone number.',
            });
            return;
        }

        setIsSending(true);
        try { await sendMessage(trimmed); }
        catch { toast.error('Unable to send message.'); }
        finally { setIsSending(false); }
    };

    const handleLeadSubmit = async () => {
        if (!leadName.trim() || !leadPhone.trim()) {
            toast.error('Please enter your name and phone number.'); return;
        }
        try {
            const res = await api.post('/chat/lead', {
                sessionId, name: leadName.trim(), phone: leadPhone.trim(),
            });
            localStorage.setItem('autospf_chat_lead', JSON.stringify({ name: leadName.trim(), phone: leadPhone.trim() }));
            setLeadRequired(false);
            if (res.data?.reply) {
                appendMessage({ id: `assistant-${Date.now()}`, sender: 'assistant', message: res.data.reply });
                if (res.data?.action?.type === 'open_booking' && onOpenBooking)
                    onOpenBooking({ name: res.data.action.name, serviceName: res.data.action.serviceName });
            } else if (pendingMessage) {
                await sendMessage(pendingMessage);
            }
            setPendingMessage(null);
        } catch { toast.error('Unable to save lead details.'); }
    };

    const handleHandoff = async () => {
        const lastUserMessage = [...messages].reverse().find(m => m.sender === 'user')?.message;
        try {
            const res = await api.post('/chat/handoff', { sessionId, lastMessage: lastUserMessage });
            if (res.data?.success) {
                appendMessage({ id: `assistant-${Date.now()}`, sender: 'assistant', message: 'A human specialist has been notified and will follow up shortly.' });
                toast.success('Human handoff requested.');
            }
        } catch { toast.error('Unable to request a human agent.'); }
    };

    /* ════════════════════════════════
       RENDER
    ════════════════════════════════ */
    return (
        <div className={className || 'fixed bottom-4 right-3 left-3 sm:left-auto sm:bottom-6 sm:right-6 z-[60] flex flex-col items-end gap-3'}>

            {/* ── Chat window ── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="chat-window"
                        variants={windowVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="relative w-full sm:w-[500px] sm:max-w-[500px] flex flex-col overflow-hidden rounded-[30px]
                                   border border-white/[0.12]
                                   shadow-[0_34px_100px_rgba(0,0,0,0.62),0_0_0_1px_rgba(255,255,255,0.05)]"
                        style={{
                            height: variant === 'customer'
                                ? 'min(650px, calc(100dvh - 112px))'
                                : 'min(680px, calc(100dvh - 112px))',
                            maxHeight: 'calc(100dvh - 88px)',
                            background: 'linear-gradient(180deg, rgba(11,13,22,0.98) 0%, rgba(8,12,20,0.99) 48%, rgba(5,8,13,1) 100%)',
                            backdropFilter: 'blur(38px)',
                            perspective: 1200,
                        }}
                    >
                        {/* Animated atmospheric layer */}
                        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                            <motion.div
                                className="absolute inset-0 opacity-[0.22]"
                                style={{
                                    backgroundImage:
                                        'linear-gradient(rgba(255,255,255,0.075) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)',
                                    backgroundSize: '34px 34px',
                                    maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.28) 55%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.28) 55%, transparent 100%)',
                                }}
                                animate={{ backgroundPosition: ['0px 0px', '34px 34px'] }}
                                transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
                            />
                            <motion.div
                                className="absolute -left-20 top-[16%] h-px w-[145%] bg-gradient-to-r from-transparent via-amber-300/[0.45] to-transparent"
                                animate={{ x: ['-15%', '15%'], opacity: [0.12, 0.55, 0.12] }}
                                transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <motion.div
                                className="absolute left-0 right-0 top-0 h-32 bg-gradient-to-b from-amber-400/[0.12] via-cyan-300/[0.04] to-transparent"
                                animate={{ opacity: [0.5, 0.92, 0.5] }}
                                transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),transparent_32%),linear-gradient(225deg,rgba(34,211,238,0.07),transparent_36%),linear-gradient(180deg,transparent,rgba(0,0,0,0.26))]" />
                        </div>

                        {/* ── Header ── */}
                        <div className="relative z-10 flex items-center justify-between gap-4 px-5 py-4 shrink-0">
                            <div className="absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-amber-300/[0.5] to-cyan-300/[0.3] pointer-events-none" />
                            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

                            <div className="flex min-w-0 items-center gap-3.5">
                                <div className="relative">
                                    <motion.div
                                        className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[18px] bg-gradient-to-br from-amber-300 via-orange-500 to-rose-600 text-white shadow-[0_14px_34px_rgba(245,132,11,0.28)] ring-1 ring-white/[0.15]"
                                        animate={{ boxShadow: ['0 14px 34px rgba(245,132,11,0.24)', '0 18px 42px rgba(34,211,238,0.16)', '0 14px 34px rgba(245,132,11,0.24)'] }}
                                        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
                                    >
                                        <Bot className="relative z-10 h-[22px] w-[22px]" />
                                        <motion.span
                                            className="absolute inset-x-0 h-5 bg-white/[0.24] blur-sm"
                                            animate={{ y: [-28, 48] }}
                                            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.3, ease: 'easeInOut' }}
                                        />
                                    </motion.div>
                                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 rounded-full border-[3px] border-[#0b0f18] bg-emerald-400">
                                        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-35" />
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-white text-[15px] font-bold tracking-tight leading-none mb-1.5">
                                        AutoSPF+ Chatbot
                                    </p>
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="flex items-center gap-1.5 text-emerald-300 text-[10.5px] font-bold">
                                            <Radio className="h-3 w-3" />
                                            Online now
                                        </span>
                                        <span className="hidden sm:inline-block h-3 w-px bg-white/[0.12]" />
                                        <p className="hidden sm:block text-white/[0.42] text-[10.5px] font-semibold">
                                            Prices · booking · login · shop info
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <motion.button
                                onClick={() => setIsOpen(false)}
                                whileHover={{ scale: 1.08, rotate: 90 }}
                                whileTap={{ scale: 0.9 }}
                                className="w-9 h-9 rounded-2xl flex items-center justify-center text-white/[0.42] hover:text-white
                                           hover:bg-white/[0.08] transition-all duration-200"
                                aria-label="Close chat"
                            >
                                <X className="h-[18px] w-[18px]" />
                            </motion.button>
                        </div>

                        {/* ── Message area ── */}
                        <div
                            className="relative z-10 flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0 sm:px-5"
                            style={{
                                scrollbarWidth: 'thin',
                                scrollbarColor: 'rgba(255,255,255,0.11) transparent',
                            }}
                        >
                            {/* Empty state / welcome */}
                            {messages.length === 0 && (
                                <>
                                    <motion.div
                                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ duration: 0.42, ease: EASE }}
                                        className="relative mb-3 overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.055] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                    >
                                        <motion.div
                                            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/[0.7] to-transparent"
                                            animate={{ x: ['-80%', '80%'] }}
                                            transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
                                        />
                                        <div className="relative flex items-start gap-3">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-black/[0.35] ring-1 ring-white/10">
                                                <ShieldCheck className="h-5 w-5 text-amber-200" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[14px] font-bold leading-snug text-white">
                                                    Ready to help with your next AutoSPF+ plan.
                                                </p>
                                                <p className="mt-1 text-[11.5px] font-medium leading-relaxed text-white/[0.48]">
                                                    Choose a topic below for prices, booking, login, or shop details.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex h-8 items-end gap-1.5">
                                            {SIGNAL_BARS.map((height, i) => (
                                                <motion.span
                                                    key={i}
                                                    className="w-full rounded-full bg-gradient-to-t from-orange-500/[0.2] via-amber-300/[0.5] to-cyan-200/[0.6]"
                                                    style={{ height }}
                                                    animate={{ scaleY: [0.72, 1, 0.72], opacity: [0.45, 0.95, 0.45] }}
                                                    transition={{ duration: 1.35, repeat: Infinity, delay: i * 0.09, ease: 'easeInOut' }}
                                                />
                                            ))}
                                        </div>
                                    </motion.div>

                                    <div className="grid grid-cols-2 gap-2">
                                        {QUICK_REPLIES.map((q, i) => (
                                            <motion.button
                                                key={q.label}
                                                custom={i}
                                                variants={chipVariants}
                                                initial="hidden"
                                                animate="visible"
                                                onClick={() => handleSend(q.prompt)}
                                                whileHover={{ scale: 1.018, y: -2 }}
                                                whileTap={{ scale: 0.975 }}
                                                className="group relative flex min-h-[82px] items-center justify-between gap-2.5 overflow-hidden rounded-[22px]
                                                           border border-white/10 bg-white/[0.045] pl-3.5 pr-7 py-3 text-left
                                                           shadow-[inset_0_1px_0_rgba(255,255,255,0.075)]
                                                           transition-all duration-300 hover:border-white/[0.18] hover:bg-white/[0.07] cursor-pointer"
                                                style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.075), 0 18px 46px ${q.glow}` }}
                                            >
                                                <span
                                                    className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full opacity-80"
                                                    style={{ backgroundColor: q.accent }}
                                                />
                                                <span
                                                    className="absolute -right-10 top-0 h-full w-24 rotate-12 bg-white/10 opacity-0 blur-lg transition-all duration-500 group-hover:right-8 group-hover:opacity-40"
                                                />
                                                <span className="relative flex min-w-0 items-center gap-2.5">
                                                    <span
                                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-black/[0.3] ring-1 ring-white/10 sm:h-10 sm:w-10"
                                                        style={{ color: q.accent }}
                                                    >
                                                        <q.Icon className="h-[18px] w-[18px]" />
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate whitespace-nowrap text-[11.5px] font-bold leading-tight text-white/[0.86] sm:text-[13px]">{q.label}</span>
                                                        <span className="mt-1 block text-[10px] font-semibold leading-tight text-white/[0.42] sm:text-[11px]">{q.detail}</span>
                                                    </span>
                                                </span>
                                                <ArrowRight
                                                    className="absolute right-3.5 h-4 w-4 shrink-0 text-white/[0.24] transition-all duration-300 group-hover:translate-x-1 group-hover:text-white/[0.7]"
                                                    aria-hidden="true"
                                                />
                                            </motion.button>
                                        ))}
                                    </div>
                                </>
                            )}

                            {/* Messages */}
                            {messages.map(msg => (
                                <motion.div
                                    key={msg.id}
                                    variants={msgVariants}
                                    initial="hidden"
                                    animate="visible"
                                    className={`flex items-end gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.sender !== 'user' && (
                                        <div className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 shadow-sm shadow-amber-500/[0.2] ring-1 ring-white/10">
                                            <Bot className="h-4 w-4 text-white" />
                                        </div>
                                    )}
                                    <div
                                        className={`max-w-[80%] whitespace-pre-wrap px-3.5 py-2.5 text-[12.5px] leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${msg.sender === 'user'
                                            ? 'rounded-[20px] rounded-br-md bg-gradient-to-r from-amber-400 via-orange-500 to-rose-600 text-white shadow-lg shadow-orange-500/[0.15]'
                                            : 'rounded-[20px] rounded-tl-md border border-white/10 bg-white/[0.065] text-white/[0.78]'
                                            }`}
                                    >
                                        {msg.message}
                                    </div>
                                </motion.div>
                            ))}

                            {/* Typing indicator */}
                            {isSending && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-end gap-2.5"
                                >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 shadow-sm shadow-amber-500/[0.2] ring-1 ring-white/10">
                                        <Bot className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="flex items-center gap-2 rounded-[20px] rounded-tl-md border border-white/10 bg-white/[0.065] px-4 py-3">
                                        {[0, 0.15, 0.3].map((delay, i) => (
                                            <motion.span
                                                key={i}
                                                className="h-1.5 w-1.5 rounded-full bg-amber-300"
                                                animate={{ opacity: [0.28, 1, 0.28], y: [0, -4, 0] }}
                                                transition={{ duration: 0.9, repeat: Infinity, delay }}
                                            />
                                        ))}
                                        <span className="ml-1 text-[10.5px] font-semibold text-white/[0.38]">checking</span>
                                    </div>
                                </motion.div>
                            )}
                            <div ref={endRef} />
                        </div>

                        {/* ── Lead capture ── */}
                        <AnimatePresence>
                            {leadRequired && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0, y: 10 }}
                                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                                    exit={{ opacity: 0, height: 0, y: 8 }}
                                    className="relative z-10 shrink-0 overflow-hidden border-t border-white/10 px-4 py-4 sm:px-5"
                                    style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))' }}
                                >
                                    <div className="mb-3 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/[0.42]">
                                        <Zap className="h-3.5 w-3.5 text-amber-300" />
                                        Quote details
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <div className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-black/[0.2] px-3 transition-colors focus-within:border-amber-300/[0.45]">
                                            <User className="w-3.5 h-3.5 text-white/[0.36] shrink-0" />
                                            <Input
                                                value={leadName}
                                                onChange={e => setLeadName(e.target.value)}
                                                placeholder="Name"
                                                className="h-8 border-0 bg-transparent p-0 text-xs text-white placeholder:text-white/[0.28] focus-visible:ring-0"
                                            />
                                        </div>
                                        <div className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-black/[0.2] px-3 transition-colors focus-within:border-cyan-300/[0.45]">
                                            <PhoneCall className="w-3.5 h-3.5 text-white/[0.36] shrink-0" />
                                            <Input
                                                value={leadPhone}
                                                onChange={e => setLeadPhone(e.target.value)}
                                                placeholder="Phone"
                                                className="h-8 border-0 bg-transparent p-0 text-xs text-white placeholder:text-white/[0.28] focus-visible:ring-0"
                                            />
                                        </div>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.015 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleLeadSubmit}
                                        className="mt-3 h-10 w-full rounded-2xl bg-gradient-to-r from-amber-300 via-orange-500 to-rose-600 text-xs font-bold text-white shadow-lg shadow-orange-500/[0.18]
                                                   transition-all hover:brightness-110 cursor-pointer"
                                    >
                                        Submit Details
                                    </motion.button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Input area ── */}
                        <div className="relative z-10 px-4 py-3.5 space-y-2.5 shrink-0">
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

                            <div className="flex items-center gap-2.5">
                                <div className={`relative flex-1 flex items-center h-12 overflow-hidden rounded-[22px] border px-3.5 transition-all duration-300
                                    ${inputFocused
                                        ? 'border-cyan-200/[0.42] bg-white/[0.065] shadow-[0_0_28px_rgba(34,211,238,0.10)]'
                                        : 'border-white/10 bg-white/[0.045]'
                                    }`}
                                >
                                    <motion.span
                                        className="pointer-events-none absolute inset-y-2 left-0 w-px bg-cyan-200/[0.7]"
                                        animate={{ opacity: inputFocused ? [0.3, 1, 0.3] : 0.25 }}
                                        transition={{ duration: 1.4, repeat: inputFocused ? Infinity : 0 }}
                                    />
                                    <Input
                                        ref={inputRef as any}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onFocus={() => setInputFocused(true)}
                                        onBlur={() => setInputFocused(false)}
                                        placeholder="SPF prices, booking, login, location..."
                                        className="h-8 flex-1 border-0 bg-transparent p-0 text-sm text-white
                                                   placeholder:text-white/[0.28] focus-visible:ring-0"
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    />
                                </div>
                                <motion.button
                                    onClick={() => handleSend()}
                                    disabled={isSending || !input.trim()}
                                    whileHover={{ scale: 1.08, rotate: -3 }}
                                    whileTap={{ scale: 0.94 }}
                                    className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[22px] bg-gradient-to-br from-amber-300 via-orange-500 to-rose-600
                                               shadow-lg shadow-orange-500/[0.25] transition-all duration-200 hover:shadow-orange-500/[0.4]
                                               disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none cursor-pointer"
                                    aria-label="Send message"
                                >
                                    <motion.span
                                        className="absolute inset-0 bg-white/[0.2]"
                                        animate={{ x: ['-120%', '120%'] }}
                                        transition={{ duration: 2.7, repeat: Infinity, ease: 'easeInOut' }}
                                    />
                                    <Send className="relative h-[18px] w-[18px] text-white" />
                                </motion.button>
                            </div>

                            <motion.button
                                onClick={handleHandoff}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                className="mx-auto flex h-8 w-full items-center justify-center gap-1.5 rounded-2xl
                                           text-[11px] font-bold text-white/[0.42] transition-all duration-200
                                           hover:bg-white/[0.045] hover:text-white/[0.72] cursor-pointer"
                            >
                                <Headset className="w-3.5 h-3.5" />
                                Talk to a human specialist
                            </motion.button>

                            {currentUserName && (
                                <p className="text-[9px] text-white/[0.18] text-center">Signed in as {currentUserName}</p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Floating trigger button ── */}
            <div className="relative flex h-[68px] w-[68px] items-center justify-center">
                <motion.div
                    className="absolute inset-0 rounded-[26px] opacity-75"
                    style={{ background: 'conic-gradient(from 0deg, rgba(251,191,36,0), rgba(251,191,36,0.65), rgba(34,211,238,0.48), rgba(251,113,133,0.55), rgba(251,191,36,0))' }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    aria-hidden="true"
                />
                <motion.button
                    onClick={() => setIsOpen(o => !o)}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    className="relative flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-[22px]
                               bg-gradient-to-br from-amber-300 via-orange-500 to-rose-700
                               shadow-[0_18px_44px_rgba(245,132,11,0.36),inset_0_1px_0_rgba(255,255,255,0.26)]
                               ring-1 ring-white/[0.18] transition-shadow duration-300 cursor-pointer"
                    aria-label={isOpen ? 'Close chat' : 'Open chat'}
                >
                    <motion.span
                        className="absolute inset-x-2 top-0 h-px bg-white/[0.45]"
                        animate={{ opacity: [0.35, 1, 0.35] }}
                        transition={{ duration: 2.2, repeat: Infinity }}
                    />
                    <motion.span
                        className="absolute inset-0 bg-white/[0.16]"
                        animate={{ y: ['-120%', '120%'] }}
                        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <AnimatePresence mode="wait" initial={false}>
                        {isOpen ? (
                            <motion.span
                                key="x"
                                initial={{ rotate: -90, opacity: 0, scale: 0.8 }}
                                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                exit={{ rotate: 90, opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.18 }}
                            >
                                <X className="h-[22px] w-[22px] text-white" />
                            </motion.span>
                        ) : (
                            <motion.span
                                key="chat"
                                initial={{ rotate: 90, opacity: 0, scale: 0.8 }}
                                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                exit={{ rotate: -90, opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.18 }}
                                className="relative"
                            >
                                <MessageCircle className="h-[22px] w-[22px] text-white" />
                                <Sparkles className="absolute -right-2 -top-2 h-3.5 w-3.5 text-white" />
                            </motion.span>
                        )}
                    </AnimatePresence>

                    {/* Unread badge */}
                    <AnimatePresence>
                        {!isOpen && unread > 0 && (
                            <motion.span
                                key="badge"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full
                                           border-[2.5px] border-[#0f1119] bg-red-500 px-1 text-[10px] font-bold text-white"
                            >
                                {unread}
                            </motion.span>
                        )}
                    </AnimatePresence>
                </motion.button>
            </div>
        </div>
    );
}
