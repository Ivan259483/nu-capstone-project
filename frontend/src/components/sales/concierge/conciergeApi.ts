import api from '@/lib/api';
import { formatPhilippinePhoneDisplay } from '@/lib/phone';
import type {
  ConciergeConversation,
  ConciergeMessage,
  ConversationStatus,
  MessageSender,
} from './conciergeTypes';

type ApiConversationStatus =
  | 'ai_handling'
  | 'needs_sales'
  | 'in_conversation'
  | 'resolved'
  | 'converted';

type ApiMessage = {
  id?: string;
  _id?: string;
  sender?: 'user' | 'assistant' | 'sales' | 'system';
  senderType?: 'customer' | 'ai' | 'sales' | 'system';
  senderName?: string;
  message: string;
  createdAt?: string;
};

type ApiConversation = {
  conversationId: string;
  customerId?: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  vehicleLabel?: string;
  plateNumber?: string;
  serviceInterest?: string;
  source?: string;
  status: ApiConversationStatus;
  assignedSalesId?: string | null;
  assignedSalesName?: string;
  lastMessage?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  handedOffAt?: string;
  salesJoinedAt?: string;
  createdAt?: string;
  unreadForSales?: boolean;
  aiSummary?: string;
};

type ConversationListResponse = {
  success: boolean;
  conversations: ApiConversation[];
};

type ConversationDetailResponse = {
  success: boolean;
  conversation: ApiConversation;
  messages: ApiMessage[];
};

const STATUS_LABELS: Record<ApiConversationStatus, ConversationStatus> = {
  ai_handling: 'Needs Sales',
  needs_sales: 'Needs Sales',
  in_conversation: 'In Conversation',
  resolved: 'Resolved',
  converted: 'Converted',
};

const statusToApi = (status: ConversationStatus): ApiConversationStatus => {
  if (status === 'Needs Sales') return 'needs_sales';
  if (status === 'In Conversation') return 'in_conversation';
  if (status === 'Converted') return 'converted';
  return 'resolved';
};

const getInitials = (name = 'Guest') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'G';

const formatRelativeTime = (value?: string) => {
  if (!value) return 'Just now';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Just now';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatMessageTime = (value?: string) => {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const mapMessageSender = (message: ApiMessage): MessageSender => {
  if (message.senderType) return message.senderType;
  if (message.sender === 'user') return 'customer';
  if (message.sender === 'assistant') return 'ai';
  return message.sender || 'system';
};

export const mapConciergeMessage = (message: ApiMessage): ConciergeMessage => ({
  id: message.id || message._id || `message-${Date.now()}-${Math.random()}`,
  sender: mapMessageSender(message),
  text: message.message,
  sentAt: formatMessageTime(message.createdAt),
});

export const mapConciergeConversation = (
  conversation: ApiConversation,
  messages: ApiMessage[] = [],
): ConciergeConversation => {
  const customerName = conversation.customerName?.trim() || 'Guest Customer';
  const lastActive = formatRelativeTime(conversation.lastMessageAt);
  const conversationStarted = formatRelativeTime(
    conversation.salesJoinedAt || conversation.handedOffAt || conversation.createdAt,
  );

  return {
    id: conversation.conversationId,
    customerId: conversation.customerId
      ? String(conversation.customerId)
      : `GUEST-${conversation.conversationId.slice(0, 8).toUpperCase()}`,
    customerName,
    initials: getInitials(customerName),
    phone: formatPhilippinePhoneDisplay(conversation.customerPhone) || 'Not provided',
    vehicle: conversation.vehicleLabel || 'Not provided',
    plate: conversation.plateNumber || '',
    serviceInterest: conversation.serviceInterest || 'General inquiry',
    status: STATUS_LABELS[conversation.status] || 'Needs Sales',
    source: 'AI Chatbot',
    lastMessagePreview:
      conversation.lastMessagePreview || conversation.lastMessage || 'No messages yet',
    time: lastActive,
    lastActive: `Active ${lastActive.toLowerCase()}`,
    conversationStarted,
    unread: Boolean(conversation.unreadForSales),
    handoffNote: 'Chat was escalated from AutoSPF+ AI to Sales.',
    aiSummary:
      conversation.aiSummary ||
      'Review the conversation history and continue the customer request from the AI handoff.',
    bookingNotes: conversation.aiSummary || conversation.lastMessage || '',
    internalNotes: [],
    messages: messages.map(mapConciergeMessage),
    assignedSalesId: conversation.assignedSalesId
      ? String(conversation.assignedSalesId)
      : null,
    assignedSalesName: conversation.assignedSalesName || '',
  };
};

export const conciergeApi = {
  async list(search = ''): Promise<ConciergeConversation[]> {
    const response = await api.get<ConversationListResponse>('/chat/sales/conversations', {
      params: search.trim() ? { search: search.trim() } : undefined,
      meta: { suppressErrorToast: true },
    } as any);
    return (response.data.conversations || []).map((conversation) =>
      mapConciergeConversation(conversation),
    );
  },

  async detail(conversationId: string): Promise<ConciergeConversation> {
    const response = await api.get<ConversationDetailResponse>(
      `/chat/sales/conversations/${conversationId}`,
      { meta: { suppressErrorToast: true } } as any,
    );
    return mapConciergeConversation(
      response.data.conversation,
      response.data.messages || [],
    );
  },

  async send(conversationId: string, message: string): Promise<ConciergeConversation> {
    await api.post(`/chat/sales/conversations/${conversationId}/messages`, {
      senderType: 'sales',
      message,
    });
    return this.detail(conversationId);
  },

  async updateStatus(
    conversationId: string,
    status: ConversationStatus,
  ): Promise<ConciergeConversation> {
    await api.patch(`/chat/sales/conversations/${conversationId}/status`, {
      status: statusToApi(status),
    });
    return this.detail(conversationId);
  },

  async assign(conversationId: string): Promise<ConciergeConversation> {
    await api.patch(`/chat/sales/conversations/${conversationId}/assign`);
    return this.detail(conversationId);
  },

  async markRead(conversationId: string): Promise<void> {
    await api.patch(`/chat/sales/conversations/${conversationId}/read`);
  },
};
