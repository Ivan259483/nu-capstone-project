import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  CircleCheck,
  CircleDollarSign,
  Package,
  RadioTower,
  ShieldAlert,
} from 'lucide-react';
import type { SystemNotification } from '@/lib/notification-service';
import {
  getNotificationCategory,
  getNotificationSeverity,
  type AdminNotificationSeverity,
} from './notification-utils';

const SEVERITY_ICONS = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  success: CircleCheck,
  info: BellRing,
};

const CATEGORY_ICONS = {
  appointments: CalendarDays,
  live_tracking: RadioTower,
  payments: CircleDollarSign,
  inventory: Package,
  security: ShieldAlert,
  system: BellRing,
};

export function AdminNotificationIcon({
  notification,
  size = 18,
}: {
  notification: SystemNotification;
  size?: number;
}) {
  const severity = getNotificationSeverity(notification);
  const category = getNotificationCategory(notification);
  const Icon = severity === 'critical'
    ? SEVERITY_ICONS.critical
    : CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] || SEVERITY_ICONS[severity];

  return (
    <span className={`anc-icon anc-icon--${severity}`} aria-hidden>
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
}

export function NotificationSeverityPill({
  severity,
}: {
  severity: AdminNotificationSeverity;
}) {
  return (
    <span className={`anc-severity anc-severity--${severity}`}>
      {severity}
    </span>
  );
}

