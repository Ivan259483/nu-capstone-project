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
import ChatAgentAvatar from './ChatAgentAvatar';
import { CHAT_BLUE } from './chat-theme';
import { SendArrowIcon } from './ChatIcons';
import {
    formatChatMessageText,
    formatRelativeTime,
    getInitials,
    resolveChatAgentAvatarUrl,
    type ChatAgentIdentity,
    type ChatMessage,
    type PublicTrackerSummary,
    type RegistrationStep,
    type SalesHandoffStatus,
} from './chat-utils';

const EASE = [0.16, 1, 0.3, 1] as const;

const msgVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
};

const FRIENDLY_HANDOFF_COPY =
    'You’re now connected to AutoSPF+ Sales. Please wait for a reply.';
const FRIENDLY_SALES_JOINED_COPY = 'AutoSPF+ Sales joined the conversation.';

function getSystemMessageCopy(message: ChatMessage): string {
    if (
        message.meta?.type === 'sales_handoff' ||
        message.message === 'Chat was escalated from AutoSPF+ AI to Sales.'
    ) {
        return FRIENDLY_HANDOFF_COPY;
    }
    if (
        message.meta?.type === 'sales_joined' ||
        message.message === 'Sales joined the conversation.'
    ) {
        return FRIENDLY_SALES_JOINED_COPY;
    }
    return formatChatMessageText(message.message);
}

function MiniBrandMark() {
    return (
        <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#171717] text-[9px] font-black tracking-[-0.04em]"
            aria-hidden="true"
        >
            <span className="text-white">A</span>
            <span className="text-[#FF6B35]">+</span>
        </span>
    );
}

interface ChatConversationScreenProps {
    messages: ChatMessage[];
    input: string;
    inputFocused: boolean;
    chatInputPlaceholder: string;
    isSending: boolean;
    agentIdentity: ChatAgentIdentity;
    handoffStatus: SalesHandoffStatus;
    showConnectToSales: boolean;
    handoffBusy: boolean;
    contactCapturePurpose: 'quote' | 'handoff' | null;
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
    onStartNewChat: () => void;
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

function TypingIndicator({ identity }: { identity: ChatAgentIdentity }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-end gap-2"
            aria-live="polite"
            aria-label={`${identity.displayName} is typing`}
        >
            <ChatAgentAvatar identity={identity} size="sm" />
            <div className="flex items-center gap-1.5 rounded-[22px] rounded-tl-[10px] bg-[#F4F4F5] px-4 py-3.5">
                {[0, 0.18, 0.36].map((delay, i) => (
                    <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-[#94A3B8]"
                        animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay, ease: 'easeInOut' }}
                    />
                ))}
            </div>
        </motion.div>
    );
}

export default function ChatConversationScreen({
    messages,
    input,
    inputFocused,
    chatInputPlaceholder,
    isSending,
    agentIdentity,
    handoffStatus,
    showConnectToSales,
    handoffBusy,
    contactCapturePurpose,
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
    onStartNewChat,
    onResendSetupEmail,
    onChangeRegistrationEmail,
}: ChatConversationScreenProps) {
    const isClosedHandoff = handoffStatus === 'resolved' || handoffStatus === 'converted';
    const isSalesHandoff =
        handoffStatus === 'needs_sales' || handoffStatus === 'in_conversation';
    const canSend =
        !isSending &&
        !handoffBusy &&
        !isClosedHandoff &&
        input.trim().length > 0 &&
        registrationStep !== 'submitting';
    const showTypingIndicator = isSending || registrationStep === 'submitting';
    const hasPersistedHandoffMessage = messages.some(
        message =>
            message.sender === 'system' &&
            (message.meta?.type === 'sales_handoff' ||
                message.message === 'Chat was escalated from AutoSPF+ AI to Sales.')
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-white">
            <header className="flex shrink-0 items-center gap-2 border-b !border-[#EEF0F3] bg-white px-4 py-3.5">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[#70747D] transition-colors hover:bg-[#F5F6F7] hover:text-[#15171C] cursor-pointer"
                    aria-label="Go back"
                >
                    <ChevronLeft className="h-6 w-6" strokeWidth={2.1} />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ChatAgentAvatar identity={agentIdentity} size="md" />
                    <div className="min-w-0">
                        <p className="truncate text-[17px] font-semibold leading-tight text-[#15171C]">
                            {agentIdentity.displayName}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] leading-tight text-[#747983]">
                            {agentIdentity.kind === 'human'
                                ? isSalesHandoff
                                    ? 'AutoSPF+ Sales'
                                    : 'Sales conversation'
                                : 'AI concierge'}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[#70747D] transition-colors hover:bg-[#F5F6F7] hover:text-[#15171C] cursor-pointer"
                    aria-label="More options"
                >
                    <MoreHorizontal className="h-6 w-6" strokeWidth={2.2} />
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-[#70747D] transition-colors hover:bg-[#F5F6F7] hover:text-[#15171C] cursor-pointer"
                    aria-label="Close chat"
                >
                    <X className="h-6 w-6" strokeWidth={2.1} />
                </button>
            </header>

            <div
                className="min-h-0 flex-1 scroll-smooth overflow-y-auto overscroll-contain bg-white px-5 py-7"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#E5E7EB transparent' }}
            >
                {messages.length === 0 && (
                    <p className="mx-auto max-w-[310px] px-1 pt-1 pb-8 text-center text-[16px] leading-relaxed text-[#6B7280]">
                        Hi, I&apos;m your AutoSPF+ Concierge. Ask me about paint protection film, ceramic coating, detailing, booking slots, or the best care plan for your vehicle.
                    </p>
                )}

                {messages.map((msg, index) => {
                    if (!msg.message.trim() && !msg.meta?.type) return null;
                    if (msg.sender === 'system') {
                        return (
                            <div key={msg.id} className="flex justify-center py-4">
                                <div className="flex max-w-[92%] items-center gap-2 rounded-full bg-[#F7F7F8] px-3 py-1.5 text-center text-[13px] leading-5 text-[#6B7280]">
                                    <MiniBrandMark />
                                    <span>{getSystemMessageCopy(msg)}</span>
                                </div>
                            </div>
                        );
                    }
                    const isSales = msg.sender === 'sales';
                    const isCustomer = msg.sender === 'user';
                    const salesDisplayName = msg.senderName || agentIdentity.displayName || 'Sales Team';
                    const salesIdentity: ChatAgentIdentity = {
                        kind: 'human',
                        displayName: salesDisplayName,
                        avatarUrl: resolveChatAgentAvatarUrl(
                            msg.senderAvatarUrl,
                            msg.meta?.senderAvatarUrl,
                            msg.meta?.avatarUrl,
                            msg.meta?.avatar,
                            msg.meta?.profileImage,
                            msg.meta?.photoURL,
                            agentIdentity.avatarUrl
                        ),
                        initials: getInitials(salesDisplayName),
                    };
                    const startsSenderGroup = messages[index - 1]?.sender !== msg.sender;
                    const endsSenderGroup = messages[index + 1]?.sender !== msg.sender;
                    return (
                    <motion.div
                        key={msg.id}
                        variants={msgVariants}
                        initial="hidden"
                        animate="visible"
                        className={`flex ${isCustomer ? 'justify-end' : 'justify-start'} ${
                            startsSenderGroup ? 'mt-5' : 'mt-1.5'
                        }`}
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
                            <div className={`flex items-end gap-2 ${isSales ? 'max-w-[86%]' : 'max-w-[78%]'}`}>
                                {isSales ? (
                                    endsSenderGroup
                                        ? <ChatAgentAvatar identity={salesIdentity} size="sm" />
                                        : <span className="h-9 w-9 shrink-0" aria-hidden="true" />
                                ) : null}
                                <div className="min-w-0">
                                    {!isCustomer && startsSenderGroup ? (
                                        <p className="mb-1.5 px-1 text-[12px] font-medium text-[#777C85]">
                                            {isSales ? salesDisplayName : 'AutoSPF+ AI'}
                                        </p>
                                    ) : null}
                                    <div
                                        className={`whitespace-pre-wrap px-[18px] py-3.5 text-[15px] leading-[1.55] ${
                                            isCustomer
                                                ? 'rounded-[22px] text-white'
                                                : 'rounded-[22px] bg-[#F3F4F6] text-[#17191D]'
                                        }`}
                                        style={isCustomer ? { backgroundColor: CHAT_BLUE } : undefined}
                                    >
                                        {formatChatMessageText(msg.message)}
                                    </div>
                                    {isSales && endsSenderGroup ? (
                                        <p className="mt-1.5 px-1 text-[12px] text-[#888D96]">
                                            {salesDisplayName}
                                            {msg.createdAt ? ` · ${formatRelativeTime(msg.createdAt)}` : ''}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </motion.div>
                    );
                })}

                <AnimatePresence>
                    {showTypingIndicator && (
                        <div className="flex justify-start">
                            <TypingIndicator identity={agentIdentity} />
                        </div>
                    )}
                </AnimatePresence>

                {registrationStep === 'sent' && registrationEmailSent && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="ml-0 max-w-[min(100%,22rem)] rounded-[24px] border !border-gray-200 bg-white px-5 py-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:px-6 sm:py-7"
                    >
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-50">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                            </div>
                            <div className="min-w-0 flex-1 pt-0.5">
                                <p className="text-[15px] font-bold leading-snug text-gray-900">Secure setup link sent</p>
                                <p className="mt-2.5 break-words text-[13px] leading-relaxed text-gray-500">
                                    Your AutoSPF+ account link is waiting at{' '}
                                    <span className="font-medium text-gray-700">{registrationEmailSent}</span>
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 flex flex-col gap-2.5">
                            <button
                                type="button"
                                onClick={() =>
                                    window.open('https://mail.google.com/mail/u/0/#inbox', '_blank', 'noopener,noreferrer')
                                }
                                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[14px] px-4 text-[13px] font-semibold whitespace-nowrap text-white cursor-pointer"
                                style={{ backgroundColor: CHAT_BLUE }}
                            >
                                <Mail className="h-4 w-4 shrink-0" />
                                Open Gmail
                            </button>
                            <div className="grid grid-cols-2 gap-2.5">
                                <button
                                    type="button"
                                    onClick={onResendSetupEmail}
                                    disabled={isResendingSetupEmail}
                                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-[14px] border !border-gray-200 px-3 text-[12px] font-semibold whitespace-nowrap text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
                                >
                                    <RefreshCw
                                        className={`h-3.5 w-3.5 shrink-0 ${isResendingSetupEmail ? 'animate-spin' : ''}`}
                                    />
                                    Resend
                                </button>
                                <button
                                    type="button"
                                    onClick={onChangeRegistrationEmail}
                                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-[14px] border !border-gray-200 px-3 text-[12px] font-semibold whitespace-nowrap text-gray-700 hover:bg-gray-50 cursor-pointer"
                                >
                                    <Edit3 className="h-3.5 w-3.5 shrink-0" />
                                    Change email
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
                <div ref={endRef} />
            </div>

            <AnimatePresence>
                {leadRequired && !isSalesHandoff && (registrationStep === 'idle' || registrationStep === 'sent') && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="shrink-0 border-t !border-gray-100 px-6 py-4"
                    >
                        <div className="rounded-[28px] border !border-gray-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
                            <p className="text-[16px] font-semibold text-[#15171C]">
                                {contactCapturePurpose === 'handoff'
                                    ? 'Connect with AutoSPF+ Sales'
                                    : 'Get a tailored SPF quote'}
                            </p>
                            <p className="mt-1 text-[13px] leading-relaxed text-[#6B7280]">
                                {contactCapturePurpose === 'handoff'
                                    ? 'Share your name and mobile number so Sales can identify and assist you in this conversation.'
                                    : 'Share your contact details and our studio team will follow up with the right protection package for your vehicle.'}
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
                                disabled={handoffBusy}
                                className="mt-3 flex h-11 w-full items-center justify-center rounded-[14px] text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(0,102,255,0.22)] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                style={{ backgroundColor: CHAT_BLUE }}
                            >
                                {contactCapturePurpose === 'handoff'
                                    ? handoffBusy
                                        ? 'Connecting...'
                                        : 'Continue to Sales'
                                    : 'Submit details'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="shrink-0 bg-white px-5 pb-5 pt-3">
                {handoffStatus === 'needs_sales' && !hasPersistedHandoffMessage ? (
                    <div className="mb-3 flex items-center justify-center gap-2 rounded-full bg-[#F7F7F8] px-3 py-2 text-center text-[13px] leading-5 text-[#6B7280]">
                        <MiniBrandMark />
                        <span>{FRIENDLY_HANDOFF_COPY}</span>
                    </div>
                ) : isClosedHandoff ? (
                    <div className="mb-3 rounded-[18px] bg-[#F7F7F8] px-4 py-3 text-center">
                        <p className="text-[13px] font-medium text-[#5F646D]">
                            This conversation has been resolved. Start a new chat if you need more help.
                        </p>
                        <button
                            type="button"
                            onClick={onStartNewChat}
                            className="mt-2 text-[12px] font-semibold text-[#0066FF] hover:underline"
                        >
                            Start New Chat
                        </button>
                    </div>
                ) : null}

                {messages.length === 0 && !showTypingIndicator && (
                    <div className="mb-3 flex items-center justify-center gap-2 text-[13px] text-[#6B7280]">
                        <ChatAgentAvatar identity={agentIdentity} size="sm" />
                        {agentIdentity.kind === 'human'
                            ? `${agentIdentity.displayName} is ready to help`
                            : 'AutoSPF+ studio team is on standby'}
                    </div>
                )}
                <div
                    className={`rounded-[28px] border-[1.5px] bg-white transition-all duration-200 ${
                        inputFocused
                            ? '!border-[#0B5CFF] shadow-[0_0_0_3px_rgba(11,92,255,0.11)]'
                            : '!border-[#E5E7EB]'
                    }`}
                >
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => onInputChange(e.target.value)}
                        onFocus={onInputFocus}
                        onBlur={onInputBlur}
                        placeholder={chatInputPlaceholder}
                        disabled={registrationStep === 'submitting' || isClosedHandoff || handoffBusy}
                        rows={2}
                        className="w-full resize-none border-0 bg-transparent px-5 pb-1 pt-4 text-[15px] text-gray-900 placeholder:text-[#8B9099] focus:outline-none focus:ring-0 disabled:opacity-60"
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (canSend) onSend();
                            }
                        }}
                    />
                    <div className="flex items-center justify-between px-4 pb-3.5 pt-0.5">
                        <div className="flex items-center gap-3.5 text-[#9CA1A9]">
                            <Paperclip className="h-[18px] w-[18px]" aria-hidden="true" />
                            <Smile className="h-[18px] w-[18px]" aria-hidden="true" />
                            <span className="text-[11px] font-semibold">GIF</span>
                            <Mic className="h-[18px] w-[18px]" aria-hidden="true" />
                        </div>
                        <button
                            type="button"
                            onClick={onSend}
                            disabled={!canSend}
                            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors cursor-pointer ${
                                canSend ? 'text-white' : 'bg-[#F0F1F2] text-[#CACDD2]'
                            }`}
                            style={canSend ? { backgroundColor: CHAT_BLUE } : undefined}
                            aria-label="Send message"
                        >
                            <SendArrowIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {showConnectToSales && !leadRequired && handoffStatus === 'ai_handling' ? (
                    <button
                        type="button"
                        onClick={onHandoff}
                        disabled={handoffBusy}
                        className="mx-auto mt-2 flex w-full items-center justify-center gap-1.5 rounded-[14px] border border-blue-100 bg-blue-50 py-2 text-[12px] font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                    >
                        <Headset className="h-3.5 w-3.5" />
                        {handoffBusy ? 'Connecting...' : 'Connect to Sales'}
                    </button>
                ) : null}

                {currentUserName && (
                    <p className="mt-1 text-center text-[10px] text-gray-400">
                        Signed in as {currentUserName}
                    </p>
                )}
            </div>
        </div>
    );
}
