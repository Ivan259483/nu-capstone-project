const GUEST_KEY_STORAGE = 'autospf_chat_guest_key';
const ACTIVE_CONVERSATION_STORAGE = 'autospf_active_conversation';
const LEGACY_SESSION_STORAGE = 'autospf_chat_session';

export const getChatGuestKey = (): string => {
    if (typeof window === 'undefined') return 'server-guest';
    const existing = localStorage.getItem(GUEST_KEY_STORAGE);
    if (existing) return existing;
    const created = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `guest_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(GUEST_KEY_STORAGE, created);
    return created;
};

export const getLegacyChatSessionId = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(LEGACY_SESSION_STORAGE);
};

export const getStoredActiveConversationId = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_CONVERSATION_STORAGE);
};

export const setStoredActiveConversationId = (conversationId: string) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACTIVE_CONVERSATION_STORAGE, conversationId);
    localStorage.setItem(LEGACY_SESSION_STORAGE, conversationId);
};

export const clearStoredActiveConversationId = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE);
};
