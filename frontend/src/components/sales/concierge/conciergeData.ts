import type { ConciergeConversation } from './conciergeTypes';

export const QUICK_REPLIES = [
  {
    label: 'Send Pricing',
    text: 'Our SPF 80 Essential and SPF 89 ceramic coating packages are available for sedans. I can walk you through the package inclusions and current pricing.',
  },
  {
    label: 'Offer Schedule',
    text: 'What day and time would work best for you? I can check our available schedule and help reserve a slot.',
  },
  {
    label: 'Create Booking',
    text: 'I can create the booking for you now. Please share your preferred schedule and I will prepare the reservation details.',
  },
];

export const INITIAL_CONVERSATIONS: ConciergeConversation[] = [
  {
    id: 'maria-santos',
    customerId: 'CUS-2026-1048',
    customerName: 'Maria Santos',
    initials: 'MS',
    phone: '+63 917 555 0142',
    vehicle: 'Toyota Vios',
    plate: 'ABC123',
    serviceInterest: 'Ceramic coating',
    status: 'Needs Sales',
    source: 'AI Chatbot',
    lastMessagePreview: 'Magkano po ceramic coating for sedan?',
    time: '2m ago',
    lastActive: 'Active 2 minutes ago',
    unread: true,
    handoffNote:
      'AI escalated this conversation to Sales because the customer asked for schedule availability and booking assistance.',
    aiSummary:
      'Customer is asking about ceramic coating for a sedan and wants weekend availability. Recommended action: explain SPF 80 and SPF 89 pricing, then offer to create a booking.',
    bookingNotes:
      'Interested in ceramic coating for a sedan. Customer asked about SPF 80 and weekend availability.',
    internalNotes: [
      {
        id: 'maria-note-1',
        author: 'Sales Team',
        time: 'Today, 10:20 AM',
        text: 'Weekend availability requested. Confirm package pricing before reserving a slot.',
      },
    ],
    messages: [
      {
        id: 'maria-1',
        sender: 'customer',
        text: 'Magkano po ceramic coating for sedan?',
        sentAt: '10:18 AM',
      },
      {
        id: 'maria-2',
        sender: 'ai',
        text: 'Our sedan ceramic coating packages start from SPF 80 Essential. Would you like me to connect you with our Sales Team for exact pricing and availability?',
        sentAt: '10:18 AM',
      },
      {
        id: 'maria-3',
        sender: 'customer',
        text: 'Yes po, available ba this weekend?',
        sentAt: '10:19 AM',
      },
    ],
  },
  {
    id: 'daniel-cruz',
    customerId: 'CUS-2026-1031',
    customerName: 'Daniel Cruz',
    initials: 'DC',
    phone: '+63 928 555 0188',
    vehicle: 'Honda Civic',
    plate: 'DCR884',
    serviceInterest: 'Premium wash and detailing',
    status: 'In Conversation',
    source: 'AI Chatbot',
    lastMessagePreview: 'Available po ba this Saturday?',
    time: '8m ago',
    lastActive: 'Active 8 minutes ago',
    unread: false,
    handoffNote:
      'AI handed this inquiry to Sales after the customer requested a confirmed Saturday schedule.',
    aiSummary:
      'Customer wants a Saturday appointment for a Honda Civic. Confirm the preferred time, then offer the closest available detailing schedule.',
    bookingNotes:
      'Customer is requesting a Saturday slot for a Honda Civic premium wash and detailing service.',
    internalNotes: [
      {
        id: 'daniel-note-1',
        author: 'Sales Team',
        time: 'Today, 10:13 AM',
        text: 'Customer prefers Saturday. Waiting for a preferred time window.',
      },
    ],
    messages: [
      {
        id: 'daniel-1',
        sender: 'customer',
        text: 'I want to have my Civic detailed this weekend.',
        sentAt: '10:10 AM',
      },
      {
        id: 'daniel-2',
        sender: 'ai',
        text: 'I can help with that. Would you like our Sales Team to confirm the available weekend schedules?',
        sentAt: '10:10 AM',
      },
      {
        id: 'daniel-3',
        sender: 'customer',
        text: 'Available po ba this Saturday?',
        sentAt: '10:12 AM',
      },
      {
        id: 'daniel-4',
        sender: 'sales',
        text: 'Yes, I can check Saturday availability for you. What time would you prefer?',
        sentAt: '10:14 AM',
      },
    ],
  },
  {
    id: 'angela-reyes',
    customerId: 'CUS-2026-0997',
    customerName: 'Angela Reyes',
    initials: 'AR',
    phone: '+63 905 555 0116',
    vehicle: 'Mitsubishi Montero',
    plate: 'MTR902',
    serviceInterest: 'Booking reschedule',
    status: 'Needs Sales',
    source: 'AI Chatbot',
    lastMessagePreview: 'Can I reschedule my booking?',
    time: '15m ago',
    lastActive: 'Active 15 minutes ago',
    unread: true,
    handoffNote:
      'AI escalated this conversation because rescheduling requires Sales to confirm a new appointment slot.',
    aiSummary:
      'Customer needs to reschedule an existing Montero booking. Ask for the appointment reference and preferred replacement schedule.',
    bookingNotes:
      'Existing Montero booking needs to be rescheduled. Confirm appointment reference and preferred new date.',
    internalNotes: [
      {
        id: 'angela-note-1',
        author: 'Sales Team',
        time: 'Today, 10:05 AM',
        text: 'Ask for the appointment reference before checking afternoon slots.',
      },
    ],
    messages: [
      {
        id: 'angela-1',
        sender: 'customer',
        text: 'Can I reschedule my booking?',
        sentAt: '10:03 AM',
      },
      {
        id: 'angela-2',
        sender: 'ai',
        text: 'Yes. Our Sales Team can help confirm a new available slot for your appointment.',
        sentAt: '10:03 AM',
      },
      {
        id: 'angela-3',
        sender: 'customer',
        text: 'Next week sana, preferably afternoon.',
        sentAt: '10:04 AM',
      },
    ],
  },
  {
    id: 'john-lim',
    customerId: 'CUS-2026-0942',
    customerName: 'John Lim',
    initials: 'JL',
    phone: '+63 917 555 0194',
    vehicle: 'Ford Ranger',
    plate: 'RGR551',
    serviceInterest: 'Paint protection package',
    status: 'Converted',
    source: 'AI Chatbot',
    lastMessagePreview: 'Thank you, I’ll proceed with the booking.',
    time: '1h ago',
    lastActive: 'Active 1 hour ago',
    unread: false,
    handoffNote:
      'AI transferred the conversation after the customer requested final package confirmation and booking assistance.',
    aiSummary:
      'Customer selected a paint protection package for a Ford Ranger and agreed to proceed. The inquiry has been converted to a booking.',
    bookingNotes:
      'Ford Ranger paint protection package confirmed. Customer agreed to proceed with booking.',
    internalNotes: [
      {
        id: 'john-note-1',
        author: 'Sales Team',
        time: 'Today, 9:22 AM',
        text: 'Converted after package confirmation. Booking follow-through remains mock-only.',
      },
    ],
    messages: [
      {
        id: 'john-1',
        sender: 'customer',
        text: 'Which package is best for a Ranger used daily?',
        sentAt: '9:05 AM',
      },
      {
        id: 'john-2',
        sender: 'ai',
        text: 'A paint protection package with ceramic coating is a strong option for a daily-driven pickup.',
        sentAt: '9:05 AM',
      },
      {
        id: 'john-3',
        sender: 'sales',
        text: 'I have prepared the recommended package and booking details for you.',
        sentAt: '9:12 AM',
      },
      {
        id: 'john-4',
        sender: 'sales',
        text: 'Your preferred schedule is available. I can finalize the reservation once you confirm.',
        sentAt: '9:18 AM',
      },
      {
        id: 'john-5',
        sender: 'customer',
        text: 'Thank you, I’ll proceed with the booking.',
        sentAt: '9:20 AM',
      },
    ],
  },
  {
    id: 'patricia-gomez',
    customerId: 'CUS-2026-0908',
    customerName: 'Patricia Gomez',
    initials: 'PG',
    phone: '+63 998 555 0105',
    vehicle: 'No vehicle yet',
    plate: '',
    serviceInterest: 'Service package consultation',
    status: 'Resolved',
    source: 'AI Chatbot',
    lastMessagePreview: 'Thanks for explaining the packages.',
    time: '3h ago',
    lastActive: 'Active 3 hours ago',
    unread: false,
    handoffNote:
      'AI handed the inquiry to Sales so the customer could compare package inclusions before choosing a vehicle-specific service.',
    aiSummary:
      'Customer requested a general package comparison and does not have vehicle details ready. The questions were answered and the inquiry is resolved.',
    bookingNotes:
      'General package consultation completed. Customer has not provided vehicle details yet.',
    internalNotes: [
      {
        id: 'patricia-note-1',
        author: 'Sales Team',
        time: 'Today, 7:25 AM',
        text: 'Resolved after package comparison. Follow up when vehicle details are available.',
      },
    ],
    messages: [
      {
        id: 'patricia-1',
        sender: 'customer',
        text: 'Can you explain the difference between your care packages?',
        sentAt: '7:15 AM',
      },
      {
        id: 'patricia-2',
        sender: 'ai',
        text: 'I can give you an overview, then Sales can help match a package once your vehicle details are available.',
        sentAt: '7:15 AM',
      },
      {
        id: 'patricia-3',
        sender: 'sales',
        text: 'The main differences are the protection level, preparation work, and included aftercare.',
        sentAt: '7:20 AM',
      },
      {
        id: 'patricia-4',
        sender: 'customer',
        text: 'Thanks for explaining the packages.',
        sentAt: '7:22 AM',
      },
    ],
  },
];
