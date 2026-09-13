import { differenceInMinutes, format, isToday, isYesterday } from 'date-fns';
import { Bell, Car, CheckCircle2, CreditCard, Search, type LucideIcon } from 'lucide-react';
import type { SystemNotification } from '@/lib/notification-service';
import {
  getNotificationCategory,
  getNotificationDate,
  getNotificationLink,
  getNotificationSeverity,
  isNotificationActionRequired,
} from '@/lib/notification-presentation';
import type { CustomerTone } from '@/lib/customer-booking-presentation';

export type CustomerNotificationGroup = 'payment' | 'service' | 'quality' | 'completion' | 'general';
export type CustomerNotificationTag = 'action' | 'completed' | 'update';

const QUALITY_CHECK_PATTERN = /\bqc\b|quality check|inspection|evidence/i;
const RECEIPT_PATTERN = /receipt/i;

function notificationText(notification: SystemNotification): string {
  return `${notification.title || ''} ${notification.message || ''} ${notification.event || ''} ${notification.type || ''}`;
}

/**
 * Buckets a notification into one of the four AutoSPF+ notification categories
 * (Payment / Service Progress / Quality Check / Completion). Built on top of the
 * shared `getNotificationCategory`/`getNotificationSeverity` helpers rather than a
 * new parallel classification.
 */
export function getCustomerNotificationGroup(notification: SystemNotification): CustomerNotificationGroup {
  const category = getNotificationCategory(notification);
  if (category === 'payments') return 'payment';
  if (getNotificationSeverity(notification) === 'success') return 'completion';
  if (QUALITY_CHECK_PATTERN.test(notificationText(notification))) return 'quality';
  if (category === 'live_tracking' || category === 'appointments') return 'service';
  return 'general';
}

const GROUP_ICONS: Record<CustomerNotificationGroup, LucideIcon> = {
  payment: CreditCard,
  service: Car,
  quality: Search,
  completion: CheckCircle2,
  general: Bell,
};

export function getCustomerNotificationIcon(notification: SystemNotification): LucideIcon {
  return GROUP_ICONS[getCustomerNotificationGroup(notification)];
}

/**
 * Replaces the old "Important"-only badge with the three-state priority system:
 * Action Required (yellow), Completed (green), Update (blue).
 */
export function getCustomerNotificationTag(notification: SystemNotification): CustomerNotificationTag {
  if (getNotificationSeverity(notification) === 'success') return 'completed';
  if (isNotificationActionRequired(notification)) return 'action';
  return 'update';
}

export const CUSTOMER_TAG_LABEL: Record<CustomerNotificationTag, string> = {
  action: 'Action Required',
  completed: 'Completed',
  update: 'Update',
};

export const CUSTOMER_TAG_TONE: Record<CustomerNotificationTag, CustomerTone> = {
  action: 'warning',
  completed: 'success',
  update: 'active',
};

/**
 * Customer-facing contextual action label ("View Receipt", "Open Tracker", ...).
 * Prefers whatever label the backend already set on the notification; only falls
 * back to a category default when none was provided.
 */
export function getCustomerActionLabel(notification: SystemNotification): string {
  if (notification.action?.label) return notification.action.label;
  const metadataLabel = notification.metadata?.actionLabel;
  if (typeof metadataLabel === 'string' && metadataLabel.trim()) return metadataLabel;

  const kind = typeof notification.metadata?.kind === 'string' ? notification.metadata.kind : '';
  if (kind === 'receipt_ready' || RECEIPT_PATTERN.test(notificationText(notification))) {
    return 'View Receipt';
  }

  const labels: Record<CustomerNotificationGroup, string> = {
    payment: 'View Payment',
    service: 'Open Tracker',
    quality: 'View Evidence',
    completion: 'View Details',
    general: 'View Details',
  };
  return labels[getCustomerNotificationGroup(notification)];
}

/** Only show a contextual action button when a real destination exists. */
export function hasCustomerNotificationAction(notification: SystemNotification): boolean {
  if (getNotificationLink(notification)) return true;
  return notification.metadata?.kind === 'receipt_ready';
}

/**
 * "2 minutes ago" for anything in the last hour, otherwise a short calendar label
 * ("Today • 4:10 PM", "Yesterday • 4:10 PM", "Sep 12 • 4:10 PM"). The exact date is
 * still available via `getAbsoluteNotificationTime` for a hover/title attribute.
 */
export function formatCustomerNotificationTime(notification: SystemNotification): string {
  const date = getNotificationDate(notification);
  const minutesOld = differenceInMinutes(new Date(), date);
  if (minutesOld >= 0 && minutesOld < 60) {
    return minutesOld < 1 ? 'Just now' : `${minutesOld} minute${minutesOld === 1 ? '' : 's'} ago`;
  }
  if (isToday(date)) return `Today • ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return `Yesterday • ${format(date, 'h:mm a')}`;
  return format(date, 'MMM d • h:mm a');
}
