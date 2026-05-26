/**
 * chatbotService — Syncs with backend /api/chatbot endpoints
 *
 * Session strategy:
 *   - Session ID persists per user/device so language and context memory survive app restarts
 *   - Session ID is prefixed with the user's auth token to keep it private per-account
 *   - Logout clears the stored chat session
 *
 * Endpoints:
 *   POST /chat/session   → start session
 *   POST /chat/message   → send user message, get AI reply
 *   POST /chat/lead      → save name + phone for guest quotes
 *   POST /chat/handoff   → request a human agent
 */

import { apiClient } from '@/services/api/client';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSharedSocket } from '@/hooks/useRealtimeSync';

const CHAT_SESSION_STORAGE_KEY = '@autospf_chat_session_id';

// ── In-memory mirror of the durable per-user/device session ───────────────────
let _sessionId: string | null = null;

async function getSessionPrefix(): Promise<string> {
  let prefix = 'guest';
  try {
    const token = await AsyncStorage.getItem('@autospf_token');
    if (token) {
      prefix = token.substring(0, 8).replace(/[^a-zA-Z0-9]/g, 'x');
    }
  } catch (_) {}
  return prefix;
}

async function buildSessionId(prefix: string): Promise<string> {
  return `${prefix}_${Crypto.randomUUID()}`;
}

function storedSessionMatchesPrefix(sessionId: string | null, prefix: string): sessionId is string {
  return Boolean(sessionId && sessionId.startsWith(`${prefix}_`));
}

async function getSessionId(): Promise<string> {
  if (_sessionId) return _sessionId;

  const prefix = await getSessionPrefix();
  const stored = await AsyncStorage.getItem(CHAT_SESSION_STORAGE_KEY);
  if (storedSessionMatchesPrefix(stored, prefix)) {
    _sessionId = stored;
    return _sessionId;
  }

  _sessionId = await buildSessionId(prefix);
  await AsyncStorage.setItem(CHAT_SESSION_STORAGE_KEY, _sessionId);
  return _sessionId;
}

export interface ChatMessageRecord {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  message: string;
  createdAt?: string;
  actionChips?: string[];
}

export interface ChatSessionResponse {
  sessionId: string;
  leadName?: string;
  leadPhone?: string;
  preferredLanguage?: 'english' | 'tagalog' | 'taglish';
  lastIntent?: string;
  lastTopic?: string;
  messages: ChatMessageRecord[];
}

export interface ChatSendResponse {
  reply: string;
  action?: {
    type: 'open_booking' | 'login_required' | 'handoff' | 'tracker_prompt';
    name?: string;
    serviceName?: string;
  } | null;
  actionChips?: string[];
  leadRequired: boolean;
  metadata?: Record<string, any> | null;
}

export interface ChatStreamHandlers {
  onStart?: (payload: { clientMessageId: string; messageId?: string }) => void;
  onDelta?: (text: string) => void;
}

export const chatbotService = {
  /** Get the current durable session ID */
  async getSessionId(): Promise<string> {
    return getSessionId();
  },

  /** Start or resume the durable chat session */
  async startSession(source = 'mobile'): Promise<ChatSessionResponse> {
    const sessionId = await getSessionId();
    const response = await apiClient.post<{ success: boolean; session: any; messages: any[] }>(
      '/chat/session',
      { sessionId, source }
    );

    const data = response.data;
    return {
      sessionId: data.session?.sessionId || sessionId,
      leadName: data.session?.leadName,
      leadPhone: data.session?.leadPhone,
      preferredLanguage: data.session?.preferredLanguage,
      lastIntent: data.session?.lastIntent,
      lastTopic: data.session?.lastTopic,
      messages: (data.messages || []).map((m: any) => ({
        id: m.id || m._id || String(Math.random()),
        sender: m.sender,
        message: m.message,
        createdAt: m.createdAt,
      })),
    };
  },

  /** Send a message and receive an AI reply */
  async sendMessage(message: string, context?: any): Promise<ChatSendResponse> {
    const sessionId = await getSessionId();
    const response = await apiClient.post<{ success: boolean } & ChatSendResponse>(
      '/chat/message',
      { sessionId, message, context }
    );

    return {
      reply: response.data.reply || 'Sorry, I could not process your message.',
      action: response.data.action || null,
      actionChips: response.data.actionChips || [],
      leadRequired: response.data.leadRequired || false,
      metadata: response.data.metadata || null,
    };
  },

  /** Send a message over Socket.IO and receive streamed token deltas. */
  async sendMessageStream(
    message: string,
    context?: any,
    handlers: ChatStreamHandlers = {}
  ): Promise<ChatSendResponse> {
    const sessionId = await getSessionId();
    const socket = await getSharedSocket();
    const clientMessageId = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      let started = false;
      const startTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('Chat stream did not start.'));
      }, 2500);
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(started ? 'Chat stream timed out.' : 'Chat stream did not start.'));
      }, 20000);

      const matches = (payload: any) => payload?.clientMessageId === clientMessageId;

      const cleanup = () => {
        clearTimeout(startTimeout);
        clearTimeout(timeout);
        socket.off('chat:stream:start', onStart);
        socket.off('chat:stream:delta', onDelta);
        socket.off('chat:stream:done', onDone);
        socket.off('chat:stream:error', onError);
      };

      const onStart = (payload: any) => {
        if (!matches(payload)) return;
        started = true;
        clearTimeout(startTimeout);
        handlers.onStart?.({ clientMessageId, messageId: payload.messageId });
      };

      const onDelta = (payload: any) => {
        if (!matches(payload)) return;
        handlers.onDelta?.(payload.text || '');
      };

      const onDone = (payload: any) => {
        if (!matches(payload)) return;
        cleanup();
        resolve({
          reply: payload.reply || 'Sorry, I could not process your message.',
          action: payload.action || null,
          actionChips: payload.actionChips || [],
          leadRequired: Boolean(payload.leadRequired),
          metadata: payload.metadata || null,
        });
      };

      const onError = (payload: any) => {
        if (!matches(payload)) return;
        cleanup();
        reject(new Error(payload.message || 'Chat stream failed.'));
      };

      socket.on('chat:stream:start', onStart);
      socket.on('chat:stream:delta', onDelta);
      socket.on('chat:stream:done', onDone);
      socket.on('chat:stream:error', onError);
      socket.emit('join_room', `chat:${sessionId}`);
      socket.emit('chat:message:stream', { sessionId, message, context, clientMessageId });
    });
  },

  /** Save lead info (name + phone) for guest quote requests */
  async saveLead(name: string, phone: string): Promise<{ reply?: string; action?: any }> {
    const sessionId = await getSessionId();
    const response = await apiClient.post<{ success: boolean; reply?: string; action?: any }>(
      '/chat/lead',
      { sessionId, name, phone }
    );
    return {
      reply: response.data.reply,
      action: response.data.action,
    };
  },

  /** Request handoff to a human agent */
  async requestHandoff(lastMessage?: string): Promise<void> {
    const sessionId = await getSessionId();
    await apiClient.post('/chat/handoff', { sessionId, lastMessage });
  },

  /**
   * Reset session (call on logout so the next user gets a clean session)
   * The in-memory _sessionId is also cleared.
   */
  async clearSession(): Promise<void> {
    _sessionId = null;
    await AsyncStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
  },
};
