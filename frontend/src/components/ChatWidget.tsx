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

/* ─────────────────────── Quick-reply chips ─────────────────────── */
const QUICK_REPLIES = [
    { label: 'Service Prices', detail: 'Wash, detail, coating rates', prompt: 'Show me your service prices and starting rates.', Icon: ReceiptText },
    { label: 'How to Book', detail: 'Steps, date, vehicle info', prompt: 'How do I book an AutoSPF+ detailing service?', Icon: CalendarDays },
    { label: 'Detailing Menu', detail: 'Interior, exterior, full detail', prompt: 'Explain your detailing services and what is included.', Icon: Sparkles },
    { label: 'Custom Quote', detail: 'Vehicle-specific estimate', prompt: 'I want a quote for my vehicle. What details do you need?', Icon: CheckCircle2 },
];

const SERVICE_PRICE_GUIDE = [
    { service: 'Exterior Wash', price: 'from ₱499' },
    { service: 'Interior Detail', price: 'from ₱699' },
    { service: 'Ceramic Coating', price: 'from ₱3,999' },
    { service: 'Full Detail', price: 'from ₱5,499' },
];

/* ─────────────────────── Framer variants ─────────────────────── */
const EASE = [0.16, 1, 0.3, 1] as const;

const windowVariants: Variants = {
    hidden: {
        opacity: 0,
        scale: 0.92,
        y: 20,
        originX: 1,
        originY: 1,
    },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 380, damping: 30 },
    },
    exit: {
        opacity: 0,
        scale: 0.92,
        y: 14,
        transition: { duration: 0.18, ease: 'easeIn' },
    },
};

const msgVariants: Variants = {
    hidden: { opacity: 0, y: 10, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: 'easeOut' } },
};

const chipVariants: Variants = {
    hidden: { opacity: 0, y: 8, scale: 0.9 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { duration: 0.35, ease: EASE, delay: 0.15 + i * 0.06 },
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
        : !!localStorage.getItem('autospf_token');

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
	                        className="w-full sm:w-[460px] sm:max-w-[460px] flex flex-col rounded-[28px] overflow-hidden
	                                   border border-white/[0.1]
	                                   shadow-[0_34px_90px_rgba(0,0,0,0.58),0_0_0_1px_rgba(255,255,255,0.045)]"
	                        style={{
	                            height: 'min(620px, calc(100dvh - 112px))',
	                            maxHeight: 'calc(100dvh - 88px)',
	                            background: 'linear-gradient(180deg, rgba(13,16,24,0.98) 0%, rgba(8,11,18,0.99) 58%, rgba(9,12,17,0.99) 100%)',
	                            backdropFilter: 'blur(40px)',
	                        }}
	                    >
	                        {/* ── Header ── */}
	                        <div className="relative flex items-center justify-between gap-4 px-5 py-4 shrink-0">
	                            {/* Top highlight line */}
	                            <div className="absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-orange-500/30 pointer-events-none" />
	                            {/* Bottom border */}
	                            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent pointer-events-none" />

	                            <div className="flex min-w-0 items-center gap-3">
	                                {/* Avatar */}
	                                <div className="relative">
	                                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700 flex items-center justify-center shadow-lg shadow-amber-500/25 ring-1 ring-white/10">
	                                        <Bot className="w-5 h-5 text-white" />
	                                    </div>
	                                    {/* Pulse ring */}
	                                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-[2.5px] border-[#0f1119]">
	                                        <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
	                                    </span>
	                                </div>
	                                <div className="min-w-0">
	                                        <p className="truncate text-white text-[14px] font-semibold tracking-tight leading-none mb-1">
	                                        AutoSPF+ Global Concierge
	                                    </p>
	                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
	                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
	                                        <p className="text-emerald-400/85 text-[10px] font-semibold">Online now</p>
	                                        <span className="hidden sm:inline-block h-3 w-px bg-white/10" />
	                                        <p className="hidden sm:block text-white/38 text-[10px] font-medium">Prices, booking, detailing</p>
	                                    </div>
	                                </div>
	                            </div>

                            <motion.button
                                onClick={() => setIsOpen(false)}
                                whileHover={{ scale: 1.1, rotate: 90 }}
                                whileTap={{ scale: 0.9 }}
	                                className="w-9 h-9 rounded-xl flex items-center justify-center text-white/35 hover:text-white
	                                           hover:bg-white/[0.06] transition-all duration-200"
                                aria-label="Close chat"
                            >
                                <X className="w-4 h-4" />
                            </motion.button>
                        </div>

                        {/* ── Message area ── */}
	                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0"
	                            style={{
	                                scrollbarWidth: 'thin',
	                                scrollbarColor: 'rgba(255,255,255,0.08) transparent',
	                            }}>

                            {/* Empty state / welcome */}
                            {messages.length === 0 && (
                                <>
                                    {/* Welcome card */}
	                                    <motion.div
	                                        variants={msgVariants} initial="hidden" animate="visible"
	                                        className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
	                                    >
		                                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/35 to-orange-500/35 pointer-events-none" />
		                                        <div className="flex items-start gap-3">
		                                            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20 ring-1 ring-white/10">
		                                                <Sparkles className="w-4 h-4 text-white" />
		                                            </div>
	                                            <div className="min-w-0">
	                                                <p className="text-white text-[14.5px] font-semibold leading-tight mb-1">
	                                                    Prices, booking, and detailing help.
	                                                </p>
	                                                <p className="text-white/58 text-[12px] leading-relaxed">
	                                                    Ask about service prices, what each detailing package includes, how to book, or a vehicle-specific quote.
	                                                </p>
	                                            </div>
	                                        </div>

	                                        <div className="mt-3 grid grid-cols-2 gap-1.5">
	                                            {SERVICE_PRICE_GUIDE.map((item) => (
	                                                <div key={item.service} className="rounded-xl border border-white/8 bg-black/15 px-3 py-2">
	                                                    <p className="text-[9.5px] font-semibold leading-tight text-white/68">{item.service}</p>
	                                                    <p className="mt-0.5 text-[11.5px] font-bold leading-tight text-amber-300">{item.price}</p>
	                                                </div>
	                                            ))}
	                                        </div>
	                                        <p className="mt-2 text-[10px] leading-relaxed text-white/38">
	                                            Starts shown. To book: choose service, send vehicle details, pick schedule, confirm quote.
	                                        </p>
	                                    </motion.div>

	                                    {/* Quick-reply chips */}
	                                    <div className="grid grid-cols-1 gap-1.5 pt-0.5 sm:grid-cols-2">
	                                        {QUICK_REPLIES.map((q, i) => (
	                                            <motion.button
	                                                key={q.label}
                                                custom={i}
                                                variants={chipVariants}
                                                initial="hidden"
                                                animate="visible"
	                                                onClick={() => handleSend(q.prompt)}
	                                                whileHover={{ scale: 1.02, y: -1 }}
	                                                whileTap={{ scale: 0.97 }}
	                                                className="group flex min-h-[50px] items-center justify-between gap-2.5 rounded-2xl border border-white/10
	                                                           bg-white/[0.04] px-3 py-2.5 text-left text-[11.5px] font-semibold text-white/72
		                                                           transition-all duration-250 hover:border-amber-400/35 hover:bg-amber-400/[0.06] hover:text-white cursor-pointer"
	                                            >
	                                                <span className="flex min-w-0 items-center gap-2">
		                                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xl bg-white/[0.055] text-amber-300 ring-1 ring-white/8">
	                                                        <q.Icon className="h-3.5 w-3.5" />
	                                                    </span>
	                                                    <span className="min-w-0">
	                                                        <span className="block leading-tight">{q.label}</span>
	                                                        <span className="mt-0.5 block text-[10px] font-medium leading-tight text-white/38">{q.detail}</span>
	                                                    </span>
	                                                </span>
		                                                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-white/22 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-200" />
	                                            </motion.button>
	                                        ))}
	                                    </div>

	                                </>
	                            )}

                            {/* Messages */}
                            {messages.map(msg => (
                                <motion.div
                                    key={msg.id}
                                    variants={msgVariants} initial="hidden" animate="visible"
                                    className={`flex items-end gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.sender !== 'user' && (
                                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 mb-0.5 shadow-sm shadow-amber-500/20">
                                            <Bot className="w-3.5 h-3.5 text-white" />
                                        </div>
                                    )}
                                    <div className={`max-w-[78%] px-3.5 py-2.5 text-[12.5px] leading-relaxed ${msg.sender === 'user'
                                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-2xl rounded-br-md shadow-md shadow-amber-500/15'
                                        : 'bg-white/[0.05] border border-white/8 text-white/75 rounded-2xl rounded-tl-md'
                                        }`}>
                                        {msg.message}
                                    </div>
                                </motion.div>
                            ))}

                            {/* Typing indicator */}
                            {isSending && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                    className="flex items-end gap-2.5"
                                >
                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
                                        <Bot className="w-3.5 h-3.5 text-white" />
                                    </div>
                                    <div className="bg-white/[0.05] border border-white/8 rounded-2xl rounded-tl-md px-4 py-3 flex gap-1.5">
                                        {[0, 0.15, 0.3].map((delay, i) => (
                                            <motion.span
                                                key={i}
                                                className="w-1.5 h-1.5 rounded-full bg-amber-400/60"
                                                animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                                                transition={{ duration: 0.9, repeat: Infinity, delay }}
                                            />
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                            <div ref={endRef} />
                        </div>

                        {/* ── Lead capture ── */}
                        <AnimatePresence>
                            {leadRequired && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="border-t border-white/8 px-5 py-4 space-y-3 shrink-0 overflow-hidden"
                                    style={{ background: 'rgba(255,255,255,0.02)' }}
                                >
	                                    <p className="text-[11px] text-white/38 uppercase tracking-[0.18em] font-semibold">Your details</p>
	                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
		                                        <div className="flex items-center gap-2 h-11 rounded-2xl border border-white/10 bg-white/[0.035] px-3 focus-within:border-amber-400/40 transition-colors">
	                                            <User className="w-3.5 h-3.5 text-white/30 shrink-0" />
	                                            <Input value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="Name"
	                                                className="h-8 border-0 bg-transparent p-0 text-xs text-white placeholder:text-white/25 focus-visible:ring-0" />
	                                        </div>
		                                        <div className="flex items-center gap-2 h-11 rounded-2xl border border-white/10 bg-white/[0.035] px-3 focus-within:border-amber-400/40 transition-colors">
	                                            <PhoneCall className="w-3.5 h-3.5 text-white/30 shrink-0" />
	                                            <Input value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="Phone"
	                                                className="h-8 border-0 bg-transparent p-0 text-xs text-white placeholder:text-white/25 focus-visible:ring-0" />
	                                        </div>
	                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleLeadSubmit}
		                                        className="w-full h-10 rounded-2xl text-xs font-semibold bg-gradient-to-r from-amber-400 to-orange-600 text-white shadow-md shadow-amber-500/20
		                                                   hover:from-amber-300 hover:to-orange-500 transition-all cursor-pointer"
	                                    >
	                                        Submit Details
	                                    </motion.button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Input area ── */}
	                        <div className="relative px-4 py-3.5 space-y-2.5 shrink-0">
                            {/* Top border */}
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent pointer-events-none" />

	                            <div className="flex items-center gap-2">
	                                <div className={`flex-1 flex items-center rounded-2xl h-11 px-3.5 border transition-all duration-300
	                                    ${inputFocused
		                                        ? 'border-amber-400/40 bg-white/[0.045] shadow-[0_0_20px_rgba(245,158,11,0.08)]'
	                                        : 'border-white/10 bg-white/[0.035]'
	                                    }`}>
                                    <Input
                                        ref={inputRef as any}
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        onFocus={() => setInputFocused(true)}
                                        onBlur={() => setInputFocused(false)}
	                                        placeholder="Ask about prices, booking steps, or detailing..."
	                                        className="h-8 flex-1 border-0 bg-transparent p-0 text-xs text-white
	                                                   placeholder:text-white/25 focus-visible:ring-0"
	                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
	                                    />
	                                </div>
                                <motion.button
                                    onClick={() => handleSend()} disabled={isSending || !input.trim()}
                                    whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
	                                    className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600
	                                               flex items-center justify-center
	                                               shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40
	                                               disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none
	                                               transition-all duration-200 cursor-pointer shrink-0"
	                                    aria-label="Send message"
	                                >
                                    <Send className="w-4 h-4 text-white" />
                                </motion.button>
                            </div>

                            <motion.button
                                onClick={handleHandoff}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
	                                className="w-full h-8 rounded-xl flex items-center justify-center gap-1.5
	                                           text-[10.5px] text-white/34 hover:text-white/65 font-semibold
	                                           hover:bg-white/[0.04] transition-all duration-200 cursor-pointer"
	                            >
	                                <Headset className="w-3 h-3" />
	                                Talk to a human specialist
	                            </motion.button>

                            {currentUserName && (
                                <p className="text-[9px] text-white/15 text-center">Signed in as {currentUserName}</p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Floating trigger button ── */}
	            <div className="relative">
	                <motion.button
	                    onClick={() => setIsOpen(o => !o)}
	                    whileHover={{ scale: 1.08 }}
	                    whileTap={{ scale: 0.92 }}
	                    className="relative w-14 h-14 rounded-2xl flex items-center justify-center
	                               bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700
	                               shadow-[0_16px_38px_rgba(245,132,11,0.34),inset_0_1px_0_rgba(255,255,255,0.22)]
	                               ring-1 ring-white/15 transition-shadow duration-300 cursor-pointer"
	                    aria-label={isOpen ? 'Close chat' : 'Open chat'}
	                >
	                    <span className="absolute inset-x-3 top-0 h-px bg-white/35" />
	                    <AnimatePresence mode="wait" initial={false}>
                        {isOpen ? (
                            <motion.span key="x"
                                initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
                                <X className="w-5 h-5 text-white" />
                            </motion.span>
                        ) : (
                            <motion.span key="chat"
                                initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
                                exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.18 }}>
                                <MessageCircle className="w-5 h-5 text-white" />
                            </motion.span>
                        )}
                    </AnimatePresence>

                    {/* Unread badge */}
                    <AnimatePresence>
                        {!isOpen && unread > 0 && (
                            <motion.span
                                key="badge"
                                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full
	                                           bg-red-500 border-[2.5px] border-[#0f1119]
                                           text-white text-[10px] font-bold flex items-center justify-center"
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
