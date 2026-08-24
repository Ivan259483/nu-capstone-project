export type ConversationStatus =
  | 'Needs Sales'
  | 'In Conversation'
  | 'Waiting for Customer'
  | 'Booking Created'
  | 'Resolved';

export type ResolutionReason =
  | 'booking_created'
  | 'question_answered'
  | 'customer_declined'
  | 'no_response'
  | 'duplicate_spam'
  | 'other';

export type ConciergeMessageContext = {
  selectedServiceId?: string;
  selectedVehicleType?: string;
  offeredSchedule?: { date: string; time: string }[];
};

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
  email: string;
  vehicle: string;
  plate: string;
  serviceInterest: string;
  selectedServiceId?: string;
  selectedServiceName?: string;
  selectedVehicleType?: string;
  offeredSchedule?: { date: string; time: string }[];
  status: ConversationStatus;
  source: 'AI Chatbot';
  lastMessagePreview: string;
  time: string;
  lastActivityLabel: string;
  lastCustomerActivityLabel: string;
  handoffTimeLabel: string;
  salesJoinedTimeLabel: string;
  lastMessageAt?: string;
  lastCustomerMessageAt?: string;
  handedOffAt?: string;
  salesJoinedAt?: string;
  unread: boolean;
  handoffNote: string;
  aiSummary: string;
  bookingNotes: string;
  internalNotes: ConciergeNote[];
  messages: ConciergeMessage[];
  assignedSalesId?: string | null;
  assignedSalesName?: string;
  linkedBookingId?: string | null;
  linkedBookingReference?: string;
  resolutionReason?: ResolutionReason | '';
  resolvedAt?: string;
};

export type BookingFromChatDraft = {
  customerName: string;
  phone: string;
  vehicleYear: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleColor: string;
  plate: string;
  vehicleType: string;
  serviceId: string;
  bookingDate: string;
  bookingTime: string;
  notes: string;
};
