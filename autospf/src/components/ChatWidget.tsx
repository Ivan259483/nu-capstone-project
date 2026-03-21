import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, X, Send, User, PhoneCall, Headset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';

/* ─────────────────────── Groq config ─────────────────────── */
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT =
    'You are the AutoSPF+ AI Assistant. Your tone is elite, professional, and helpful. ' +
    'You are an expert in Paint Protection Film (PPF), Ceramic Coating, Interior & Exterior Detailing, ' +
    'Nano Ceramic Tint, Car Foil, and Window Tints. ' +
    'Our shop is located in Las Piñas City, Metro Manila (Marcos Alvarez Ave.). ' +
    'If asked about price or quotes, politely direct the customer to leave their contact details ' +
    'or use the Book Now button for a personalised quote. ' +
    'Keep replies under 80 words unless more detail is genuinely needed. Do NOT use emojis.';

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
    'Paint Protection Film',
    'Ceramic Coating',
    'Interior Detailing',
    'Get a Quote',
];

/* ─────────────────────── Framer variants ─────────────────────── */
const windowVariants: Variants = {
    hidden: {
        opacity: 0,
        scale: 0.85,
        y: 24,
        originX: 1,
        originY: 1,
    },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { type: 'spring' as const, stiffness: 320, damping: 28 },
    },
    exit: {
        opacity: 0,
        scale: 0.88,
        y: 16,
        transition: { duration: 0.2, ease: 'easeIn' as const },
    },
};

const msgVariants: Variants = {
    hidden: { opacity: 0, y: 10, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25, ease: 'easeOut' as const } },
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

    // Keeps full conversation history for Groq context window
    const historyRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
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

    /* ── No server session needed; history managed locally ── */

    /* ── Auto-scroll ── */
    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen]);

    /* ── Clear unread when opened ── */
    useEffect(() => {
        if (isOpen) {
            setUnread(0);
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    /* ─── Send helpers ─── */
    const appendMessage = (msg: ChatMessage) => setMessages(prev => [...prev, msg]);

    /* ── Groq request ── */
    const sendMessage = async (content: string) => {
        if (!GROQ_API_KEY) {
            appendMessage({
                id: `assistant-${Date.now()}`, sender: 'assistant',
                message: 'The AI assistant is not configured. Please add VITE_GROQ_API_KEY to your .env.local file and restart the dev server.',
            });
            return;
        }

        // Append user turn to persistent history
        historyRef.current.push({ role: 'user', content });

        let response: Response;
        try {
            response = await fetch(GROQ_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        ...historyRef.current,
                    ],
                    max_tokens: 256,
                    temperature: 0.65,
                }),
            });
        } catch (networkErr) {
            console.error('[ChatWidget] Network error reaching Groq:', networkErr);
            // Remove the user turn we just pushed since it won't have a reply
            historyRef.current.pop();
            throw new Error('Network error');
        }

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`[ChatWidget] Groq ${response.status}:`, errBody);
            historyRef.current.pop();
            throw new Error(`Groq API error ${response.status}`);
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content?.trim() ?? 'Sorry, I could not generate a response.';

        // Append assistant turn to persistent history
        historyRef.current.push({ role: 'assistant', content: reply });

        appendMessage({ id: `assistant-${Date.now()}`, sender: 'assistant', message: reply });
        setUnread(prev => isOpen ? 0 : prev + 1);
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
        <div className={className || 'fixed bottom-6 right-6 z-[60] flex flex-col items-end gap-3'}>

            {/* ── Chat window ── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="chat-window"
                        variants={windowVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="w-80 sm:w-96 flex flex-col rounded-2xl overflow-hidden
                                   bg-[#0B1120]/85 backdrop-blur-2xl
                                   border border-white/10
                                   shadow-[0_32px_80px_rgba(0,0,0,0.7)]"
                        style={{ maxHeight: '520px' }}
                    >
                        {/* ── Header ── */}
                        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/8
                                        bg-white/[0.04] shrink-0">
                            {/* Top highlight */}
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

                            <div className="flex items-center gap-3">
                                <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/30">
                                    <Headset className="w-4 h-4 text-white" />
                                    {/* Green "online" dot */}
                                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0B1120] shadow-sm" />
                                </div>
                                <div>
                                    <p className="text-white text-xs font-semibold tracking-tight leading-none mb-0.5">
                                        AutoSPF+ Assistant
                                    </p>
                                    <p className="text-emerald-400 text-[10px] font-medium">Online</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                                    aria-label="Close chat"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* ── Message area ── */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0"
                            style={{ maxHeight: '280px' }}>

                            {/* Empty state / welcome */}
                            {messages.length === 0 && (
                                <>
                                    <motion.div
                                        variants={msgVariants} initial="hidden" animate="visible"
                                        className="flex items-start gap-2.5"
                                    >
                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                                            <Headset className="w-3.5 h-3.5 text-white" />
                                        </div>
                                        <div className="bg-white/[0.07] border border-white/10 rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                                            <p className="text-white/80 text-xs leading-relaxed">
                                                Hello! Welcome to <span className="text-orange-400 font-semibold">AutoSPF+</span>. How can I assist you with your vehicle's detailing today?
                                            </p>
                                        </div>
                                    </motion.div>

                                    {/* Quick-reply chips */}
                                    <div className="flex flex-wrap gap-1.5 pl-9">
                                        {QUICK_REPLIES.map(q => (
                                            <button
                                                key={q}
                                                onClick={() => handleSend(q)}
                                                className="px-2.5 py-1 rounded-full text-[10px] font-medium
                                                           border border-white/15 text-white/50 hover:border-orange-500/50
                                                           hover:text-orange-400 hover:bg-orange-500/8
                                                           transition-all duration-200"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}

                            {/* Messages */}
                            {messages.map(msg => (
                                <motion.div
                                    key={msg.id}
                                    variants={msgVariants} initial="hidden" animate="visible"
                                    className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.sender !== 'user' && (
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shrink-0 mb-0.5">
                                            <Headset className="w-3 h-3 text-white" />
                                        </div>
                                    )}
                                    <div className={`max-w-[80%] px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${msg.sender === 'user'
                                        ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-2xl rounded-br-sm'
                                        : 'bg-white/[0.07] border border-white/10 text-white/80 rounded-2xl rounded-tl-sm'
                                        }`}>
                                        {msg.message}
                                    </div>
                                </motion.div>
                            ))}

                            {/* Typing indicator */}
                            {isSending && (
                                <motion.div
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="flex items-end gap-2"
                                >
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shrink-0">
                                        <Headset className="w-3 h-3 text-white" />
                                    </div>
                                    <div className="bg-white/[0.07] border border-white/10 rounded-2xl rounded-tl-sm px-3.5 py-3 flex gap-1">
                                        {[0, 0.15, 0.3].map((delay, i) => (
                                            <motion.span
                                                key={i}
                                                className="w-1.5 h-1.5 rounded-full bg-white/40"
                                                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                                                transition={{ duration: 0.8, repeat: Infinity, delay }}
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
                                    className="border-t border-white/8 px-4 py-3 space-y-2 shrink-0 bg-white/[0.03] overflow-hidden"
                                >
                                    <p className="text-[11px] text-white/40 uppercase tracking-widest font-medium">Your details</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-2 h-9 rounded-lg border border-white/10 bg-white/5 px-2">
                                            <User className="w-3.5 h-3.5 text-white/30 shrink-0" />
                                            <Input value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="Name"
                                                className="h-7 border-0 bg-transparent p-0 text-xs text-white placeholder:text-white/25 focus-visible:ring-0" />
                                        </div>
                                        <div className="flex items-center gap-2 h-9 rounded-lg border border-white/10 bg-white/5 px-2">
                                            <PhoneCall className="w-3.5 h-3.5 text-white/30 shrink-0" />
                                            <Input value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="Phone"
                                                className="h-7 border-0 bg-transparent p-0 text-xs text-white placeholder:text-white/25 focus-visible:ring-0" />
                                        </div>
                                    </div>
                                    <Button onClick={handleLeadSubmit}
                                        className="w-full h-8 text-xs rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 text-white font-semibold hover:from-orange-600 hover:to-amber-700">
                                        Submit Details
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Input area ── */}
                        <div className="border-t border-white/8 px-3 py-3 space-y-2 shrink-0 bg-white/[0.02]">
                            <div className="flex items-center gap-2">
                                <Input
                                    ref={inputRef as any}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    placeholder="Type your message..."
                                    className="h-9 flex-1 rounded-xl bg-white/5 border border-white/10 text-xs text-white
                                               placeholder:text-white/25 focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20
                                               transition-all"
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                />
                                <motion.button
                                    onClick={() => handleSend()} disabled={isSending || !input.trim()}
                                    whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }}
                                    className="w-9 h-9 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600
                                               flex items-center justify-center shadow-md shadow-orange-500/25
                                               disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                    <Send className="w-3.5 h-3.5 text-white" />
                                </motion.button>
                            </div>

                            <Button variant="outline" onClick={handleHandoff}
                                className="w-full h-7 rounded-lg border-white/10 text-[10px] text-white/35 hover:text-white/70 hover:bg-white/8 uppercase tracking-widest font-medium transition-all">
                                Talk to Human
                            </Button>

                            {currentUserName && (
                                <p className="text-[10px] text-white/20 text-center">Signed in as {currentUserName}</p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Floating trigger button ── */}
            <motion.button
                onClick={() => setIsOpen(o => !o)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
                className="relative w-14 h-14 rounded-full flex items-center justify-center
                           bg-gradient-to-r from-orange-500 to-amber-600
                           shadow-xl shadow-orange-500/40 hover:shadow-orange-500/60
                           transition-shadow duration-300"
                aria-label={isOpen ? 'Close chat' : 'Open chat'}
            >
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
                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 border-2 border-[#0B1120]
                                       text-white text-[10px] font-bold flex items-center justify-center"
                        >
                            {unread}
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.button>
        </div>
    );
}
