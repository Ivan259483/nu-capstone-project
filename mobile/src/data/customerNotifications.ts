export type CustomerNotificationCategory = 'important' | 'promotions';

export type CustomerNotificationType =
  | 'booking'
  | 'reminder'
  | 'service'
  | 'progress'
  | 'qc'
  | 'release'
  | 'payment'
  | 'warranty'
  | 'promo'
  | 'inspection'
  | 'ppf'
  | 'referral'
  | 'tint';

export interface CustomerNotification {
  id: string;
  category: CustomerNotificationCategory;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  type: CustomerNotificationType;
  actionLabel?: string;
}

export const initialCustomerNotifications: CustomerNotification[] = [
  {
    id: '1',
    category: 'important',
    title: 'Booking Confirmed',
    message: 'Your ceramic coating appointment has been confirmed for 14 Jun 2026 at 10:00 AM.',
    time: 'Today, 9:20 AM',
    unread: true,
    type: 'booking',
    actionLabel: 'View booking',
  },
  {
    id: '2',
    category: 'important',
    title: 'Appointment Reminder',
    message: 'Your detailing slot starts tomorrow at AutoSPF+ BGC. Please arrive 10 minutes early for vehicle intake.',
    time: 'Today, 8:45 AM',
    unread: true,
    type: 'reminder',
  },
  {
    id: '3',
    category: 'important',
    title: 'Vehicle Received',
    message: 'Your vehicle has been checked in at AutoSPF+. Our team will begin the pre-service inspection shortly.',
    time: 'Today, 10:15 AM',
    unread: true,
    type: 'service',
    actionLabel: 'Track service',
  },
  {
    id: '4',
    category: 'important',
    title: 'Service In Progress',
    message: 'Paint correction is now underway. We will notify you once the coating prep moves to quality check.',
    time: 'Today, 11:30 AM',
    unread: false,
    type: 'progress',
  },
  {
    id: '5',
    category: 'important',
    title: 'QC Completed',
    message: 'Final inspection is complete. Your vehicle is now ready for release.',
    time: 'Yesterday, 4:45 PM',
    unread: false,
    type: 'qc',
  },
  {
    id: '6',
    category: 'important',
    title: 'Vehicle Ready for Release',
    message: 'Your AutoSPF+ service is complete. Please proceed to the release desk for turnover and after-care notes.',
    time: 'Yesterday, 5:20 PM',
    unread: false,
    type: 'release',
  },
  {
    id: '7',
    category: 'important',
    title: 'Payment Received',
    message: 'We received your payment for the ceramic coating package. Your receipt is now available in the app.',
    time: '08 Jun 2026, 3:05 PM',
    unread: false,
    type: 'payment',
    actionLabel: 'View receipt',
  },
  {
    id: '8',
    category: 'important',
    title: 'Warranty Certificate Issued',
    message: 'Your coating warranty certificate has been issued and added to your AutoSPF+ documents.',
    time: '08 Jun 2026, 2:40 PM',
    unread: false,
    type: 'warranty',
  },
  {
    id: '9',
    category: 'promotions',
    title: 'Ceramic Coating Week',
    message: 'Protect your paint with studio-grade ceramic coating and get 10% off selected packages this week.',
    time: 'Today, 8:00 AM',
    unread: true,
    type: 'promo',
    actionLabel: 'Learn more',
  },
  {
    id: '10',
    category: 'promotions',
    title: 'Free Paint Inspection',
    message: 'Book a detailing consultation and get a free paint condition inspection at AutoSPF+.',
    time: '08 Jun 2026, 2:30 PM',
    unread: true,
    type: 'inspection',
    actionLabel: 'Book inspection',
  },
  {
    id: '11',
    category: 'promotions',
    title: 'PPF Protection Promo',
    message: 'Upgrade high-impact panels with premium paint protection film and save on bundled installation.',
    time: '07 Jun 2026, 6:10 PM',
    unread: false,
    type: 'ppf',
  },
  {
    id: '12',
    category: 'promotions',
    title: 'Rainy Season Detailing Package',
    message: 'Keep water spots and road grime under control with our wash, decon, and sealant package.',
    time: '06 Jun 2026, 11:20 AM',
    unread: false,
    type: 'promo',
  },
  {
    id: '13',
    category: 'promotions',
    title: 'Referral Reward',
    message: 'Refer a friend to AutoSPF+ and earn service credits after their completed appointment.',
    time: '05 Jun 2026, 5:35 PM',
    unread: false,
    type: 'referral',
  },
  {
    id: '14',
    category: 'promotions',
    title: 'Tinting Promo',
    message: 'Add heat rejection and cabin comfort with special pricing on selected tint packages.',
    time: '04 Jun 2026, 1:15 PM',
    unread: false,
    type: 'tint',
  },
];
