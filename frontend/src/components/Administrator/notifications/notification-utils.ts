import {
  differenceInMinutes,
  format,
  formatDistanceToNow,
  isToday,
  isValid,
  parseISO,
} from 'date-fns';
import type { SystemNotification } from '@/lib/notification-service';

export type AdminNotificationSeverity = 'critical' | 'warning' | 'info' | 'success';
export type NotificationTimeGroup = 'Now' | 'Today' | 'Earlier';
export type NotificationFlyoutTab = 'all' | 'unread' | 'action' | 'system';

export const NOTIFICATION_TIME_GROUPS: NotificationTimeGroup[] = ['Now', 'Today', 'Earlier'];

const CRITICAL_WORDS = [
  'breach',
  'emergency closure enabled',
  'failed',
  'out of stock',
  'security alert',
  'suspicious',
];

const WARNING_WORDS = [
  'at risk',
  'delayed',
  'low stock',
  'nearing full',
  'overdue',
  'pending',
  'unassigned',
];

const SUCCESS_WORDS = [
  'completed',
  'paid',
  'payment received',
  'replenished',
  'resolved',
  'restored',
];

function notificationText(notification: SystemNotification): string {
  return `${notification.title || ''} ${notification.message || ''}`.toLowerCase();
}

export function getNotificationId(notification: SystemNotification): string {
  return String(notification.id || notification._id || '');
}

export function getNotificationSeverity(notification: SystemNotification): AdminNotificationSeverity {
  if (notification.severity) return notification.severity;

  const text = notificationText(notification);
  if (notification.type === 'error' || CRITICAL_WORDS.some((word) => text.includes(word))) {
    return 'critical';
  }
  if (
    notification.type === 'warning' ||
    notification.priority === 'high' ||
    WARNING_WORDS.some((word) => text.includes(word))
  ) {
    return 'warning';
  }
  if (notification.type === 'success' || SUCCESS_WORDS.some((word) => text.includes(word))) {
    return 'success';
  }
  return 'info';
}

export function getNotificationCategory(notification: SystemNotification): string {
  const metadataCategory = typeof notification.metadata?.category === 'string'
    ? notification.metadata.category
    : '';
  const raw = String(notification.category || metadataCategory || '').trim().toLowerCase();

  if (['appointment', 'appointments', 'booking', 'bookings', 'availability'].includes(raw)) {
    return 'appointments';
  }
  if (['tracking', 'live tracking', 'live_tracking', 'job', 'jobs', 'service'].includes(raw)) {
    return 'live_tracking';
  }
  if (['payment', 'payments', 'billing', 'revenue', 'finance'].includes(raw)) {
    return 'payments';
  }
  if (['inventory', 'stock', 'supplies'].includes(raw)) return 'inventory';
  if (['security', 'audit', 'permissions', 'admin'].includes(raw)) return 'security';
  if (['system', 'maintenance'].includes(raw)) return 'system';

  const link = String(notification.action?.link || notification.link || '').toLowerCase();
  const text = notificationText(notification);
  if (notification.type === 'booking' || /booking|appointment|availability|closure/.test(`${link} ${text}`)) {
    return 'appointments';
  }
  if (/tracking|tracker|technician|sla|job /.test(`${link} ${text}`)) return 'live_tracking';
  if (/payment|billing|revenue|refund/.test(`${link} ${text}`)) return 'payments';
  if (notification.type === 'inventory' || /inventory|stock|reorder/.test(`${link} ${text}`)) {
    return 'inventory';
  }
  if (/security|permission|login|account|audit/.test(`${link} ${text}`)) return 'security';
  return 'system';
}

export function getNotificationCategoryLabel(notification: SystemNotification): string {
  const category = getNotificationCategory(notification);
  const labels: Record<string, string> = {
    appointments: 'Appointments',
    live_tracking: 'Live Tracking',
    payments: 'Payments',
    inventory: 'Inventory',
    security: 'Security',
    system: 'System',
  };
  return labels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getNotificationSource(notification: SystemNotification): string {
  if (notification.source?.trim()) return notification.source.trim();
  const metadataSource = notification.metadata?.source;
  if (typeof metadataSource === 'string' && metadataSource.trim()) return metadataSource.trim();
  return getNotificationCategoryLabel(notification);
}

export function isNotificationActionRequired(notification: SystemNotification): boolean {
  if (typeof notification.actionRequired === 'boolean') return notification.actionRequired;
  if (typeof notification.metadata?.actionRequired === 'boolean') {
    return notification.metadata.actionRequired;
  }
  return ['critical', 'warning'].includes(getNotificationSeverity(notification));
}

export function isSystemNotification(notification: SystemNotification): boolean {
  return ['system', 'security'].includes(getNotificationCategory(notification));
}

export function matchesFlyoutTab(
  notification: SystemNotification,
  tab: NotificationFlyoutTab,
): boolean {
  if (tab === 'unread') return !notification.isRead;
  if (tab === 'action') return isNotificationActionRequired(notification);
  if (tab === 'system') return isSystemNotification(notification);
  return true;
}

export function getNotificationDate(notification: SystemNotification): Date {
  const parsed = parseISO(notification.lastOccurredAt || notification.createdAt || '');
  return isValid(parsed) ? parsed : new Date();
}

export function getNotificationTimeGroup(notification: SystemNotification): NotificationTimeGroup {
  const date = getNotificationDate(notification);
  const minutesOld = differenceInMinutes(new Date(), date);
  if (minutesOld >= 0 && minutesOld <= 60) return 'Now';
  if (isToday(date)) return 'Today';
  return 'Earlier';
}

export function getRelativeNotificationTime(notification: SystemNotification): string {
  return formatDistanceToNow(getNotificationDate(notification), { addSuffix: true });
}

export function getAbsoluteNotificationTime(notification: SystemNotification): string {
  return format(getNotificationDate(notification), 'MMM d, yyyy · h:mm a');
}

export function getNotificationDateTime(notification: SystemNotification): string {
  return notification.lastOccurredAt || notification.createdAt;
}

export function groupNotificationsByTime(
  notifications: SystemNotification[],
): Record<NotificationTimeGroup, SystemNotification[]> {
  return notifications.reduce<Record<NotificationTimeGroup, SystemNotification[]>>(
    (groups, notification) => {
      groups[getNotificationTimeGroup(notification)].push(notification);
      return groups;
    },
    { Now: [], Today: [], Earlier: [] },
  );
}

export function getNotificationLink(notification: SystemNotification): string | undefined {
  const metadataLink = notification.metadata?.link;
  if (notification.action?.link) return notification.action.link;
  if (notification.link) return notification.link;
  return typeof metadataLink === 'string' ? metadataLink : undefined;
}

export function getNotificationActionLabel(notification: SystemNotification): string {
  if (notification.action?.label) return notification.action.label;
  const metadataLabel = notification.metadata?.actionLabel;
  if (typeof metadataLabel === 'string' && metadataLabel.trim()) return metadataLabel;

  const labels: Record<string, string> = {
    appointments: 'Review booking',
    live_tracking: 'Open job',
    payments: 'Review payment',
    inventory: 'View inventory',
    security: 'Review activity',
    system: 'View details',
  };
  return labels[getNotificationCategory(notification)] || 'View details';
}

export function getGroupCount(notification: SystemNotification): number {
  const metadataCount = Number(notification.metadata?.groupCount || notification.metadata?.count || 0);
  return Math.max(1, Number(notification.groupCount || metadataCount || 1));
}
