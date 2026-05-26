import {
    X,
    ChevronLeft,
    MoreHorizontal,
    User,
    PhoneCall,
    Headset,
    Mail,
    RefreshCw,
    Edit3,
    CheckCircle2,
    Paperclip,
    Smile,
    Mic,
    ArrowUpRight,
    Car,
    Clock3,
    MapPin,
    ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Input } from '@/components/ui/input';
import ChatBrandAvatar from './ChatBrandAvatar';
import { CHAT_BLUE } from './chat-theme';
import { SendArrowIcon } from './ChatIcons';
import { formatChatMessageText, formatRelativeTime, type ChatMessage, type PublicTrackerSummary, type RegistrationStep } from './chat-utils';

const EASE = [0.16, 1, 0.3, 1] as const;

const msgVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
};

interface ChatConversationScreenProps {
    messages: ChatMessage[];
    input: string;
    inputFocused: boolean;
    chatInputPlaceholder: string;
    isSending: boolean;
    registrationStep: RegistrationStep;
    registrationEmailSent: string;
    isResendingSetupEmail: boolean;
    leadRequired: boolean;
    leadName: string;
    leadPhone: string;
    currentUserName?: string;
    endRef: React.RefObject<HTMLDivElement | null>;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    onBack: () => void;
    onClose: () => void;
    onInputChange: (value: string) => void;
    onInputFocus: () => void;
    onInputBlur: () => void;
    onSend: () => void;
    onLeadNameChange: (value: string) => void;
    onLeadPhoneChange: (value: string) => void;
    onLeadSubmit: () => void;
    onHandoff: () => void;
    onResendSetupEmail: () => void;
    onChangeRegistrationEmail: () => void;
}

function TrackerResultCard({
    tracker,
    trackerUrl,
}: {
    tracker: PublicTrackerSummary;
    trackerUrl?: string;
}) {
    const progress = Math.max(0, Math.min(100, Number(tracker.progressPercent || 0)));
    const assignedNames = tracker.serviceStaffAssignments
        .map((entry) => entry.name?.trim())
        .filter(Boolean);
    const teamLabel = assignedNames.length
        ? assignedNames.join(', ')
        : 'AutoSPF+ studio team';
    const fullUrl = trackerUrl || '';

    return (
        <div className="w-full max-w-[92%] rounded-[26px] border !border-gray-200 bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.10)]">
            <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[#111111] text-white">
                    <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#0066FF]">Live tracker verified</p>
                    <h3 className="mt-1 text-[17px] font-bold leading-tight text-[#15171C]">
                        {tracker.currentStageLabel || 'Tracker active'}
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#6B7280]">
                        {tracker.serviceName} · {tracker.vehicleLabel}
                    </p>
                </div>
            </div>

            <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-[#6B7280]">
                    <span>{progress}% complete</span>
                    <span>{tracker.bookingReference}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                    <div
                        className="h-2 rounded-full bg-[#0066FF] transition-all"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 text-[13px] text-[#4B5563]">
                <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-[#9CA3AF]" />
                    <span>{tracker.scheduleLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-[#9CA3AF]" />
                    <span>{teamLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#9CA3AF]" />
                    <span>Updated {formatRelativeTime(tracker.updatedAt || undefined)}</span>
                </div>
            </div>

            {fullUrl && (
                <button
                    type="button"
                    onClick={() => window.open(fullUrl, '_blank', 'noopener,noreferrer')}
                    className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[15px] bg-[#0066FF] text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(0,102,255,0.22)] cursor-pointer"
                >
                    Open full tracker
                    <ArrowUpRight className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}

function TrackerLinkCard({
    trackerUrl,
    reference,
    message,
}: {
    trackerUrl?: string;
    reference?: string;
    message?: string;
}) {
    const url = trackerUrl || '/customer/live-tracker';

    return (
        <div className="w-full max-w-[92%] rounded-[26px] border !border-gray-200 bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.10)]">
            <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[#111111] text-white">
                    <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#0066FF]">Live tracker</p>
                    <h3 className="mt-1 text-[17px] font-bold leading-tight text-[#15171C]">Appointment status ready</h3>
                    {reference && (
                        <p className="mt-1 text-[13px] font-semibold text-[#6B7280]">{reference}</p>
                    )}
                </div>
            </div>

            {message && (
                <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-[#4B5563]">
                    {formatChatMessageText(message)}
                </p>
            )}

            <button
                type="button"
                onClick={() => window.location.assign(url)}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[15px] bg-[#0066FF] text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(0,102,255,0.22)] cursor-pointer"
            >
                Open live tracker
                <ArrowUpRight className="h-4 w-4" />
            </button>
        </div>
    );
}

export default function ChatConversationScreen({
    messages,
    input,
    inputFocused,
    chatInputPlaceholder,
    isSending,
    registrationStep,
    registrationEmailSent,
    isResendingSetupEmail,
    leadRequired,
    leadName,
    leadPhone,
    currentUserName,
    endRef,
    inputRef,
    onBack,
    onClose,
    onInputChange,
    onInputFocus,
    onInputBlur,
    onSend,
    onLeadNameChange,
    onLeadPhoneChange,
    onLeadSubmit,
    onHandoff,
    onResendSetupEmail,
    onChangeRegistrationEmail,
}: ChatConversationScreenProps) {
    const canSend = !isSending && input.trim().length > 0 && registrationStep !== 'submitting';

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-white">
            <header className="flex shrink-0 items-center gap-2 border-b !border-gray-200 px-4 py-4">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-gray-100 hover:text-[#15171C] cursor-pointer"
                    aria-label="Go back"
                >
                    <ChevronLeft className="h-6 w-6" strokeWidth={2.1} />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ChatBrandAvatar size="md" />
                    <div className="min-w-0">
                        <p className="truncate text-[18px] font-semibold leading-tight text-[#15171C]">AutoSPF+</p>
                        <p className="truncate text-[14px] leading-tight text-[#6B7280]">Team can help</p>
                    </div>
                </div>
                <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-[15px] text-[#6B7280] transition-colors hover:bg-gray-100 hover:text-[#15171C] cursor-pointer"
                    aria-label="More options"
                >
                    <MoreHorizontal className="h-6 w-6" strokeWidth={2.2} />
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[#6B7280] transition-colors hover:bg-gray-100 hover:text-[#15171C] cursor-pointer"
                    aria-label="Close chat"
                >
                    <X className="h-6 w-6" strokeWidth={2.1} />
                </button>
            </header>

            <div
                className="min-h-0 flex-1 overflow-y-auto px-6 py-6 space-y-3 bg-white"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#E5E7EB transparent' }}
            >
                {messages.length === 0 && (
                    <p className="mx-auto max-w-[310px] px-1 pt-1 pb-8 text-center text-[16px] leading-relaxed text-[#6B7280]">
                        Hi, I&apos;m your AutoSPF+ Concierge. Ask me about paint protection film, ceramic coating, detailing, booking slots, or the best care plan for your vehicle.
                    </p>
                )}

                {messages.map(msg => (
                    <motion.div
                        key={msg.id}
                        variants={msgVariants}
                        initial="hidden"
                        animate="visible"
                        className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        {msg.meta?.type === 'tracker_result' && msg.meta.tracker ? (
                            <TrackerResultCard tracker={msg.meta.tracker} trackerUrl={msg.meta.trackerUrl} />
                        ) : msg.meta?.type === 'tracker_link' ? (
                            <TrackerLinkCard
                                trackerUrl={msg.meta.trackerUrl}
                                reference={msg.meta.trackerReference}
                                message={msg.message}
                            />
                        ) : (
                            <div
                                className={`max-w-[82%] whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed ${
                                    msg.sender === 'user'
                                        ? 'rounded-[22px] rounded-br-[10px] text-white shadow-[0_8px_20px_rgba(0,102,255,0.22)]'
                                        : 'rounded-[22px] rounded-tl-[10px] bg-[#F4F4F5] text-[#15171C]'
                                }`}
                                style={msg.sender === 'user' ? { backgroundColor: CHAT_BLUE } : undefined}
                            >
                                {formatChatMessageText(msg.message)}
                            </div>
                        )}
                    </motion.div>
                ))}

                {registrationStep === 'sent' && registrationEmailSent && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="ml-0 max-w-[94%] rounded-[24px] border !border-gray-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]"
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-bold text-gray-900">Secure setup link sent</p>
                                <p className="mt-1 break-words text-[13px] text-gray-500">
                                    Your AutoSPF+ account link is waiting at {registrationEmailSent}
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={() =>
                                    window.open('https://mail.google.com/mail/u/0/#inbox', '_blank', 'noopener,noreferrer')
                                }
                                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] text-[12px] font-semibold text-white cursor-pointer"
                                style={{ backgroundColor: CHAT_BLUE }}
                            >
                                <Mail className="h-3.5 w-3.5" />
                                Open Gmail
                            </button>
                            <button
                                type="button"
                                onClick={onResendSetupEmail}
                                disabled={isResendingSetupEmail}
                                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] border !border-gray-200 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${isResendingSetupEmail ? 'animate-spin' : ''}`} />
                                Resend
                            </button>
                            <button
                                type="button"
                                onClick={onChangeRegistrationEmail}
                                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] border !border-gray-200 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
                            >
                                <Edit3 className="h-3.5 w-3.5" />
                                Change email
                            </button>
                        </div>
                    </motion.div>
                )}

                {isSending && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex justify-start"
                    >
                        <div className="flex items-center gap-2 rounded-[22px] rounded-tl-[10px] bg-[#F4F4F5] px-4 py-3">
                            {[0, 0.15, 0.3].map((delay, i) => (
                                <motion.span
                                    key={i}
                                    className="h-1.5 w-1.5 rounded-full bg-gray-400"
                                    animate={{ opacity: [0.3, 1, 0.3] }}
                                    transition={{ duration: 0.9, repeat: Infinity, delay }}
                                />
                            ))}
                        </div>
                    </motion.div>
                )}
                <div ref={endRef} />
            </div>

            <AnimatePresence>
                {leadRequired && (registrationStep === 'idle' || registrationStep === 'sent') && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="shrink-0 border-t !border-gray-100 px-6 py-4"
                    >
                        <div className="rounded-[28px] border !border-gray-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
                            <p className="text-[16px] font-semibold text-[#15171C]">Get a tailored SPF quote</p>
                            <p className="mt-1 text-[13px] leading-relaxed text-[#6B7280]">
                                Share your contact details and our studio team will follow up with the right protection package for your vehicle.
                            </p>
                            <div className="mt-3 space-y-2">
                                <div className="flex h-12 items-center gap-2 rounded-[14px] border !border-gray-200 bg-gray-50 px-3 transition-colors focus-within:!border-[#0066FF]">
                                    <User className="h-4 w-4 shrink-0 text-gray-400" />
                                    <Input
                                        value={leadName}
                                        onChange={e => onLeadNameChange(e.target.value)}
                                        placeholder="Your name"
                                        className="h-9 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                                    />
                                </div>
                                <div className="flex h-12 items-center gap-2 rounded-[14px] border !border-gray-200 bg-gray-50 px-3 transition-colors focus-within:!border-[#0066FF]">
                                    <PhoneCall className="h-4 w-4 shrink-0 text-gray-400" />
                                    <Input
                                        value={leadPhone}
                                        onChange={e => onLeadPhoneChange(e.target.value)}
                                        placeholder="Phone number"
                                        className="h-9 border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                                    />
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onLeadSubmit}
                                className="mt-3 flex h-11 w-full items-center justify-center rounded-[14px] text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(0,102,255,0.22)] cursor-pointer"
                                style={{ backgroundColor: CHAT_BLUE }}
                            >
                                Submit details
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="shrink-0 px-6 pb-5 pt-3">
                {messages.length === 0 && !isSending && (
                    <div className="mb-3 flex items-center justify-center gap-2 text-[13px] text-[#6B7280]">
                        <ChatBrandAvatar size="sm" />
                        AutoSPF+ studio team is on standby
                    </div>
                )}
                <div
                    className={`rounded-[22px] border bg-white transition-all duration-200 ${
                        inputFocused
                            ? 'border-[#0066FF] shadow-[0_0_0_3px_rgba(0,102,255,0.12)]'
                            : 'border-[#E5E7EB] shadow-sm'
                    }`}
                >
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => onInputChange(e.target.value)}
                        onFocus={onInputFocus}
                        onBlur={onInputBlur}
                        placeholder={chatInputPlaceholder}
                        disabled={registrationStep === 'submitting'}
                        rows={2}
                        className="w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] text-gray-900 placeholder:text-[#9CA3AF] focus:outline-none focus:ring-0 disabled:opacity-60"
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (canSend) onSend();
                            }
                        }}
                    />
                    <div className="flex items-center justify-between px-3 pb-3 pt-0">
                        <div className="flex items-center gap-3 text-[#C4C4C4]">
                            <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
                            <Smile className="h-[18px] w-[18px]" aria-hidden="true" />
                            <span className="text-[11px] font-bold">GIF</span>
                            <Mic className="h-[18px] w-[18px]" aria-hidden="true" />
                        </div>
                        <button
                            type="button"
                            onClick={onSend}
                            disabled={!canSend}
                            className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors cursor-pointer ${
                                canSend ? 'text-white' : 'bg-[#F3F4F6] text-[#D1D5DB]'
                            }`}
                            style={canSend ? { backgroundColor: CHAT_BLUE } : undefined}
                            aria-label="Send message"
                        >
                            <SendArrowIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onHandoff}
                    className="mx-auto mt-2 flex w-full items-center justify-center gap-1.5 py-1 text-[11px] font-semibold text-gray-400 transition-colors hover:text-gray-600 cursor-pointer"
                >
                    <Headset className="h-3.5 w-3.5" />
                    Talk to a protection specialist
                </button>

                {currentUserName && (
                    <p className="mt-1 text-center text-[10px] text-gray-400">
                        Signed in as {currentUserName}
                    </p>
                )}
            </div>
        </div>
    );
}
