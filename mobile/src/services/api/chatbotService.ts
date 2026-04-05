/**
 * chatbotService — Syncs with backend /api/chatbot endpoints
 *
 * Mirrors the website's working chatbot integration:
 *   POST /chatbot/session   → start / resume a session
 *   POST /chatbot/message   → send user message, get AI reply
 *   POST /chatbot/lead      → save name + phone for guest quotes
 *   POST /chatbot/handoff   → request a human agent
 */

import { apiClient } from '@/services/api/client';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = '@autospf_chat_session_id';

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

async function getOrCreateSessionId(): Promise<string> {
  const existingSessionId = await AsyncStorage.getItem(SESSION_KEY);
  if (existingSessionId) {
    return existingSessionId;
  }
  const newSessionId = Crypto.randomUUID();
  await AsyncStorage.setItem(SESSION_KEY, newSessionId);
  return newSessionId;
}

export const chatbotService = {
  /** Get or create session ID */
  async getSessionId(): Promise<string> {
    return getOrCreateSessionId();
  },

  /** Start or resume a chat session and load message history */
  async startSession(source = 'mobile'): Promise<ChatSessionResponse> {
    const sessionId = await getOrCreateSessionId();
    const response = await apiClient.post<{ success: boolean; session: any; messages: any[] }>(
      '/chat/session',
      { sessionId, source }
    );

    const data = response.data;
    return {
      sessionId: data.session?.sessionId || sessionId,
      leadName: data.session?.leadName,
      leadPhone: data.session?.leadPhone,
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
    const sessionId = await getOrCreateSessionId();
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
    const sessionId = await getOrCreateSessionId();
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
    const sessionId = await getOrCreateSessionId();
    await apiClient.post('/chat/handoff', { sessionId, lastMessage });
  },

  /** Clear session (for logout) */
  async clearSession(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
  },
};
