/**
 * chatbotService — Syncs with backend /api/chatbot endpoints
 *
 * Session strategy:
 *   - Session ID is tied to the CURRENT APP LAUNCH (not persisted across launches)
 *   - Session ID is prefixed with the user's auth token to keep it private per-account
 *   - On every app start, a fresh session ID is created → fresh conversation
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

// ── In-memory only — resets every app launch ──────────────────────────────────
let _sessionId: string | null = null;

async function buildSessionId(): Promise<string> {
  // Prefix with the user's stored token fingerprint so sessions are per-account
  // Even if the token is absent (guest), each launch gets a unique session
  let prefix = 'guest';
  try {
    const token = await AsyncStorage.getItem('@autospf_token');
    if (token) {
      // Use first 8 chars of token as a short identity tag
      prefix = token.substring(0, 8).replace(/[^a-zA-Z0-9]/g, 'x');
    }
  } catch (_) {}

  return `${prefix}_${Crypto.randomUUID()}`;
}

async function getSessionId(): Promise<string> {
  // Already created this launch — reuse it for the session
  if (_sessionId) return _sessionId;

  // Fresh app launch → create a new session ID (not saved to disk)
  _sessionId = await buildSessionId();
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
  messages: ChatMessageRecord[];
}

export interface ChatSendResponse {
  reply: string;
  action?: {
    type: 'open_booking' | 'login_required' | 'handoff';
    name?: string;
    serviceName?: string;
  } | null;
  actionChips?: string[];
  leadRequired: boolean;
}

export const chatbotService = {
  /** Get the current session ID (in-memory, resets on app launch) */
  async getSessionId(): Promise<string> {
    return getSessionId();
  },

  /** Start a fresh session for this app launch — no history loaded */
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
      // Always return empty — backend will have no history for a brand-new session ID
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
    };
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
    // Remove any legacy persisted key (from old version)
    await AsyncStorage.removeItem('@autospf_chat_session_id');
  },
};
