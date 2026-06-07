export type ConversationStatus = 'Needs Sales' | 'In Conversation' | 'Resolved' | 'Converted';

export type MessageSender = 'customer' | 'ai' | 'sales' | 'system';

export type ConciergeMessage = {
  id: string;
  sender: MessageSender;
  text: string;
  sentAt: string;
};

export type ConciergeNote = {
  id: string;
  author: string;
  time: string;
  text: string;
};

export type ConciergeConversation = {
  id: string;
  customerId: string;
  customerName: string;
  initials: string;
  phone: string;
  vehicle: string;
  plate: string;
  serviceInterest: string;
  status: ConversationStatus;
  source: 'AI Chatbot';
  lastMessagePreview: string;
  time: string;
  lastActive: string;
  unread: boolean;
  handoffNote: string;
  aiSummary: string;
  bookingNotes: string;
  internalNotes: ConciergeNote[];
  messages: ConciergeMessage[];
  assignedSalesId?: string | null;
  assignedSalesName?: string;
};

export type BookingFromChatDraft = {
  customerName: string;
  vehicle: string;
  serviceInterest: string;
  notes: string;
};
