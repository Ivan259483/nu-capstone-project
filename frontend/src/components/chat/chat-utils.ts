export interface PublicTrackerSummary {
    bookingReference: string;
    serviceName: string;
    vehicleLabel: string;
    scheduleLabel: string;
    status: string;
    serviceTrackingStage: string;
    currentStageLabel?: string;
    progressPercent: number;
    updatedAt?: string | null;
    trackerStageMedia: Array<{
        stage?: string;
        slot?: string;
        photoUrl?: string;
        description?: string;
        uploadedAt?: string | null;
    }>;
    serviceStaffAssignments: Array<{
        slot?: string;
        name?: string;
        role?: string;
    }>;
}

export interface ChatMessage {
    id: string;
    sender: 'user' | 'assistant' | 'sales' | 'system';
    message: string;
    createdAt?: string;
    meta?: {
        type?: string;
        tracker?: PublicTrackerSummary;
        trackerUrl?: string;
        trackerReference?: string;
        salesHandoffOffer?: {
            eligible?: boolean;
            reason?: string;
        };
    };
}

export type RegistrationStep =
    | 'idle'
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'phone'
    | 'submitting'
    | 'sent';

export type ChatScreen = 'home' | 'messages' | 'chat';

export interface ChatConversationThread {
    conversationId: string;
    title: string;
    mode: string;
    status?: SalesHandoffStatus;
    lastMessagePreview?: string;
    lastMessageAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export type SalesHandoffStatus =
    | 'ai_handling'
    | 'needs_sales'
    | 'in_conversation'
    | 'resolved'
    | 'converted';

export function getThreadPreview(
    thread: ChatConversationThread | null | undefined,
    registrationStep: RegistrationStep
): string {
    if (registrationStep !== 'idle' && registrationStep !== 'sent') {
        return getConversationPreview([], registrationStep);
    }
    const preview = String(thread?.lastMessagePreview || '').trim();
    if (preview) return preview.length <= 56 ? preview : `${preview.slice(0, 53)}...`;
    return '';
}

export function getThreadRelativeTime(thread: ChatConversationThread | null | undefined): string {
    return formatRelativeTime(thread?.lastMessageAt);
}

const ACTION_CHIP_ARRAY_REGEX = /\[\s*(?:"[^"]+"\s*(?:,\s*"[^"]+"\s*)*)\]/g;

/** Plain-text display for bot/user bubbles (no markdown or JSON chip leaks). */
export function formatChatMessageText(text: string): string {
    if (!text) return '';
    let out = text;
    out = out.replace(/```[\s\S]*?```/g, '');
    out = out.replace(ACTION_CHIP_ARRAY_REGEX, (match) => {
        try {
            const parsed = JSON.parse(match) as unknown;
            if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) return '';
        } catch {
            /* keep */
        }
        return match;
    });
    out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
    out = out.replace(/__([^_]+)__/g, '$1');
    out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1');
    out = out.replace(/^#{1,6}\s+/gm, '');
    out = out.replace(/`([^`]+)`/g, '$1');
    out = out.replace(/^[*\-]\s+/gm, '• ');
    out = out.replace(/\*\*/g, '');
    return out.replace(/\n{3,}/g, '\n\n').trim();
}

export function formatRelativeTime(createdAt?: string): string {
    if (!createdAt) return 'Just now';
    const diff = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function getConversationPreview(
    messages: ChatMessage[],
    registrationStep: RegistrationStep
): string {
    if (registrationStep === 'firstName') return 'Asked for first name';
    if (registrationStep === 'lastName') return 'Asked for last name';
    if (registrationStep === 'email') return 'Asked for email';
    if (registrationStep === 'phone') return 'Asked for phone number';
    if (registrationStep === 'submitting') return 'Setting up your account...';
    if (registrationStep === 'sent') return 'Verification email sent';

    const last = [...messages].reverse().find(m => m.sender !== 'system');
    if (!last) return '';
    const text = last.message.trim();
    if (text.length <= 56) return text;
    return `${text.slice(0, 53)}...`;
}

/** Subtitle on Home "recent message" card when thread is empty */
export function getHomeCardPreview(
    messages: ChatMessage[],
    registrationStep: RegistrationStep
): string {
    const preview = getConversationPreview(messages, registrationStep);
    if (preview) return preview;
    return 'We typically reply in minutes';
}

export function getLastActivityTime(
    messages: ChatMessage[]
): string | undefined {
    const withTime = [...messages].reverse().find(m => m.createdAt);
    return withTime?.createdAt;
}
