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

export type ChatAgentImageValue =
    | string
    | {
        url?: string;
        secure_url?: string;
        secureUrl?: string;
        src?: string;
    };

export interface ChatMessage {
    id: string;
    sender: 'user' | 'assistant' | 'sales' | 'system';
    senderId?: string;
    senderName?: string;
    senderAvatarUrl?: string;
    message: string;
    createdAt?: string;
    meta?: {
        type?: string;
        senderAvatarUrl?: ChatAgentImageValue;
        avatarUrl?: ChatAgentImageValue;
        avatar?: ChatAgentImageValue;
        profileImage?: ChatAgentImageValue;
        photoURL?: ChatAgentImageValue;
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

export interface ChatAgentProfile {
    _id?: string;
    id?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    fullName?: string;
    displayName?: string;
    role?: string;
    email?: string;
    avatar?: ChatAgentImageValue;
    avatarUrl?: ChatAgentImageValue;
    profileImage?: ChatAgentImageValue;
    photoURL?: ChatAgentImageValue;
    profilePhoto?: ChatAgentImageValue;
    image?: ChatAgentImageValue;
    photo?: ChatAgentImageValue;
}

export interface ChatAgentIdentity {
    kind: 'bot' | 'human';
    displayName: string;
    avatarUrl: string;
    initials: string;
}

export interface ChatConversationThread {
    conversationId: string;
    title: string;
    mode: string;
    status?: SalesHandoffStatus;
    assignedSalesId?: string | ChatAgentProfile | null;
    assignedSalesName?: string;
    assignedSalesAvatar?: string;
    assignedSalesAvatarUrl?: string;
    assignedSalesUser?: ChatAgentProfile | null;
    assignedStaff?: ChatAgentProfile | null;
    lastHumanResponder?: ChatAgentProfile | null;
    currentAssignedProfile?: ChatAgentProfile | null;
    lastMessageSender?: ChatMessage['sender'];
    lastMessageSenderName?: string;
    lastMessageSenderAvatar?: string;
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

const PROFILE_IMAGE_FIELDS = [
    'avatarUrl',
    'avatar',
    'profileImage',
    'photoURL',
    'image',
    'profilePhoto',
    'photo',
] as const;

const clean = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

export const resolveChatAgentAvatarUrl = (...values: unknown[]): string => {
    const candidates: string[] = [];

    for (const value of values) {
        const direct = clean(value);
        if (direct && !direct.startsWith('blob:')) {
            candidates.push(direct);
        }
        if (!value || typeof value !== 'object') continue;

        const nested = value as {
            url?: unknown;
            secure_url?: unknown;
            secureUrl?: unknown;
            src?: unknown;
        };
        candidates.push(
            clean(nested.url),
            clean(nested.secure_url),
            clean(nested.secureUrl),
            clean(nested.src)
        );
    }

    const usable = candidates.filter(value => value && !value.startsWith('blob:'));
    return (
        usable.find(value => /^https?:\/\//i.test(value)) ||
        usable.find(value => /^data:image\//i.test(value)) ||
        usable[0] ||
        ''
    );
};

const getProfileName = (profile?: ChatAgentProfile | null): string =>
    clean(profile?.fullName) ||
    clean(profile?.name) ||
    clean([profile?.firstName, profile?.lastName].filter(Boolean).join(' ')) ||
    clean(profile?.displayName);

const getProfileAvatar = (profile?: ChatAgentProfile | null): string => {
    if (!profile) return '';
    return resolveChatAgentAvatarUrl(
        ...PROFILE_IMAGE_FIELDS.map(field => profile[field])
    );
};

const toAgentProfile = (
    source: unknown,
    fallbackName = '',
    fallbackAvatar = ''
): ChatAgentProfile | null => {
    const profile =
        source && typeof source === 'object'
            ? source as ChatAgentProfile
            : null;
    const name = getProfileName(profile) || clean(fallbackName);
    const avatarUrl = getProfileAvatar(profile) || clean(fallbackAvatar);
    if (!name && !avatarUrl) return null;
    return { ...profile, name, avatarUrl };
};

export function getInitials(name: string): string {
    const parts = clean(name)
        .split(/\s+/)
        .filter(Boolean);
    if (!parts.length) return 'ST';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getLastHumanResponder(messages: ChatMessage[]): ChatAgentProfile | null {
    const message = [...messages].reverse().find(entry => entry.sender === 'sales');
    if (!message) return null;
    return toAgentProfile(
        {
            ...message.meta,
            id: message.senderId,
            name: message.senderName,
            avatarUrl: message.senderAvatarUrl,
        },
        message.senderName || 'Sales Team',
        message.senderAvatarUrl
    );
}

export function resolveChatAgentIdentity(
    thread?: ChatConversationThread | null,
    messages: ChatMessage[] = []
): ChatAgentIdentity {
    const hasHumanAgent =
        Boolean(thread?.assignedSalesUser) ||
        Boolean(thread?.assignedStaff) ||
        Boolean(thread?.lastHumanResponder) ||
        Boolean(thread?.currentAssignedProfile) ||
        Boolean(thread?.assignedSalesId) ||
        Boolean(clean(thread?.assignedSalesName));
    const assignedSales = toAgentProfile(
        thread?.assignedSalesUser ||
        thread?.assignedStaff ||
        (thread?.assignedSalesId && typeof thread.assignedSalesId === 'object'
            ? thread.assignedSalesId
            : null),
        thread?.assignedSalesName,
        thread?.assignedSalesAvatarUrl || thread?.assignedSalesAvatar
    );
    const lastHumanResponder =
        toAgentProfile(thread?.lastHumanResponder) ||
        getLastHumanResponder(messages) ||
        toAgentProfile(
            null,
            thread?.lastMessageSender === 'sales' ? thread.lastMessageSenderName : '',
            thread?.lastMessageSender === 'sales' ? thread.lastMessageSenderAvatar : ''
        );
    const currentAssignedProfile = toAgentProfile(thread?.currentAssignedProfile);
    const humanProfile = assignedSales || lastHumanResponder || currentAssignedProfile;
    const isHumanMode =
        hasHumanAgent ||
        Boolean(humanProfile) ||
        Boolean(thread?.status && thread.status !== 'ai_handling');

    if (!isHumanMode) {
        return {
            kind: 'bot',
            displayName: 'AutoSPF+',
            avatarUrl: '',
            initials: 'A+',
        };
    }

    const displayName = getProfileName(humanProfile) || 'Sales Team';
    return {
        kind: 'human',
        displayName,
        avatarUrl: getProfileAvatar(humanProfile),
        initials: getInitials(displayName),
    };
}

export function getRecentSenderLabel(identity: ChatAgentIdentity): string {
    if (identity.kind === 'bot') return identity.displayName;
    return identity.displayName;
}

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
