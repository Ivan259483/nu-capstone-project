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
  | 'waiting_customer'
  | 'booking_created'
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
  selectedServiceId?: string | null;
  selectedServiceName?: string;
  selectedVehicleType?: string;
  offeredSchedule?: { date: string; time: string }[];
  source?: string;
  status: ApiConversationStatus;
  assignedSalesId?: string | null;
  assignedSalesName?: string;
  lastMessage?: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  lastCustomerMessageAt?: string;
  handedOffAt?: string;
  salesJoinedAt?: string;
  createdAt?: string;
  unreadForSales?: boolean;
  aiSummary?: string;
  linkedBookingId?: string | null;
  linkedBookingReference?: string;
  resolutionReason?: ConciergeConversation['resolutionReason'];
  resolvedAt?: string;
  internalNotes?: {
    id?: string;
    _id?: string;
    authorName?: string;
    text: string;
    createdAt?: string;
  }[];
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
  waiting_customer: 'Waiting for Customer',
  booking_created: 'Booking Created',
  resolved: 'Resolved',
  converted: 'Booking Created',
};

const statusToApi = (status: ConversationStatus): ApiConversationStatus => {
  if (status === 'Needs Sales') return 'needs_sales';
  if (status === 'In Conversation') return 'in_conversation';
  if (status === 'Waiting for Customer') return 'waiting_customer';
  if (status === 'Booking Created') return 'booking_created';
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
  const lastActivity = formatRelativeTime(conversation.lastMessageAt);
  const lastCustomerActivity = conversation.lastCustomerMessageAt
    ? formatRelativeTime(conversation.lastCustomerMessageAt)
    : 'Not recorded';
  const handoffTime = conversation.handedOffAt
    ? formatRelativeTime(conversation.handedOffAt)
    : 'Not recorded';
  const salesJoinedTime = conversation.salesJoinedAt
    ? formatRelativeTime(conversation.salesJoinedAt)
    : 'Not yet';

  return {
    id: conversation.conversationId,
    customerId: conversation.customerId
      ? String(conversation.customerId)
      : `GUEST-${conversation.conversationId.slice(0, 8).toUpperCase()}`,
    customerName,
    initials: getInitials(customerName),
    phone:
      formatPhilippinePhoneDisplay(conversation.customerPhone) ||
      'Not provided',
    email: conversation.customerEmail || 'Not provided',
    vehicle: conversation.vehicleLabel || 'Not provided',
    plate: conversation.plateNumber || '',
    serviceInterest: conversation.serviceInterest || 'General inquiry',
    selectedServiceId: conversation.selectedServiceId
      ? String(conversation.selectedServiceId)
      : '',
    selectedServiceName: conversation.selectedServiceName || '',
    selectedVehicleType: conversation.selectedVehicleType || '',
    offeredSchedule: conversation.offeredSchedule || [],
    status: STATUS_LABELS[conversation.status] || 'Needs Sales',
    source: 'AI Chatbot',
    lastMessagePreview:
      conversation.lastMessagePreview ||
      conversation.lastMessage ||
      'No messages yet',
    time: lastActivity,
    lastActivityLabel: `Last activity ${lastActivity.toLowerCase()}`,
    lastCustomerActivityLabel:
      lastCustomerActivity === 'Not recorded'
        ? 'Customer activity not recorded'
        : `Customer replied ${lastCustomerActivity.toLowerCase()}`,
    handoffTimeLabel:
      handoffTime === 'Not recorded'
        ? 'Handoff time not recorded'
        : `Handed off ${handoffTime.toLowerCase()}`,
    salesJoinedTimeLabel:
      salesJoinedTime === 'Not yet'
        ? 'Sales has not joined'
        : `Sales joined ${salesJoinedTime.toLowerCase()}`,
    lastMessageAt: conversation.lastMessageAt,
    lastCustomerMessageAt: conversation.lastCustomerMessageAt,
    handedOffAt: conversation.handedOffAt,
    salesJoinedAt: conversation.salesJoinedAt,
    unread: Boolean(conversation.unreadForSales),
    handoffNote: 'Chat was escalated from AutoSPF+ AI to Sales.',
    aiSummary:
      conversation.aiSummary ||
      'Review the conversation history and continue the customer request from the AI handoff.',
    bookingNotes: conversation.aiSummary || conversation.lastMessage || '',
    internalNotes: (conversation.internalNotes || []).map((note) => ({
      id: String(note.id || note._id || `note-${Date.now()}`),
      author: note.authorName || 'Sales Team',
      time: note.createdAt
        ? new Intl.DateTimeFormat('en-PH', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(note.createdAt))
        : 'Just now',
      text: note.text,
    })),
    messages: messages.map(mapConciergeMessage),
    assignedSalesId: conversation.assignedSalesId
      ? String(conversation.assignedSalesId)
      : null,
    assignedSalesName: conversation.assignedSalesName || '',
    linkedBookingId: conversation.linkedBookingId
      ? String(conversation.linkedBookingId)
      : null,
    linkedBookingReference: conversation.linkedBookingReference || '',
    resolutionReason: conversation.resolutionReason || '',
    resolvedAt: conversation.resolvedAt,
  };
};

export const conciergeApi = {
  async list(search = ''): Promise<ConciergeConversation[]> {
    const response = await api.get<ConversationListResponse>(
      '/chat/sales/conversations',
      {
        params: search.trim() ? { search: search.trim() } : undefined,
        meta: { suppressErrorToast: true },
      } as any,
    );
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

  async remove(conversationId: string): Promise<void> {
    await api.delete(`/chat/sales/conversations/${conversationId}`, {
      meta: { suppressErrorToast: true },
    } as any);
  },

  async send(
    conversationId: string,
    message: string,
    context?: {
      selectedServiceId?: string;
      selectedVehicleType?: string;
      offeredSchedule?: { date: string; time: string }[];
    },
  ): Promise<ConciergeConversation> {
    await api.post(`/chat/sales/conversations/${conversationId}/messages`, {
      senderType: 'sales',
      message,
      ...(context ? { context } : {}),
    });
    return this.detail(conversationId);
  },

  async updateStatus(
    conversationId: string,
    status: ConversationStatus,
    reason?: ConciergeConversation['resolutionReason'],
  ): Promise<ConciergeConversation> {
    await api.patch(`/chat/sales/conversations/${conversationId}/status`, {
      status: statusToApi(status),
      ...(reason ? { reason } : {}),
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

  async linkBooking(
    conversationId: string,
    bookingId: string,
  ): Promise<ConciergeConversation> {
    await api.post(`/chat/sales/conversations/${conversationId}/booking`, {
      bookingId,
    });
    return this.detail(conversationId);
  },

  async addNote(
    conversationId: string,
    text: string,
  ): Promise<ConciergeConversation> {
    await api.post(`/chat/sales/conversations/${conversationId}/notes`, {
      text,
    });
    return this.detail(conversationId);
  },
};
