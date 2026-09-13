import { useMemo, useState } from 'react';
import { Bell, LoaderCircle, Settings2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import type { SystemNotification } from '@/lib/notification-service';
import { getAbsoluteNotificationTime, getNotificationDateTime, getNotificationId } from '@/lib/notification-presentation';
import {
  CUSTOMER_TAG_LABEL,
  CUSTOMER_TAG_TONE,
  formatCustomerNotificationTime,
  getCustomerActionLabel,
  getCustomerNotificationGroup,
  getCustomerNotificationIcon,
  getCustomerNotificationTag,
  hasCustomerNotificationAction,
} from './customer-notification-presentation';
import './customer-notification-center.css';

interface CustomerNotificationCenterProps {
  notifications: SystemNotification[];
  loading: boolean;
  onMarkAllAsRead: () => Promise<unknown> | unknown;
  onOpenNotification: (notification: SystemNotification) => Promise<unknown> | unknown;
  onOpenSettings: () => void;
  className?: string;
  /** Optional controlled open state, for pages that need to force-close the panel
   * from elsewhere (e.g. dismissing all overlays when another modal opens). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function CustomerNotificationCenter({
  notifications,
  loading,
  onMarkAllAsRead,
  onOpenNotification,
  onOpenSettings,
  className = '',
  open: openProp,
  onOpenChange,
}: CustomerNotificationCenterProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isMobile = useIsMobile();
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.isRead).length,
    [notifications],
  );

  const handleOpenNotification = async (notification: SystemNotification) => {
    const result = await onOpenNotification(notification);
    if (result === false) return;
    setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      className={`customer-notification-trigger relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-[0_6px_18px_-16px_rgba(15,23,42,0.34)] transition-colors hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 ${className}`}
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <span
        className={`flex size-5 items-center justify-center ${unreadCount > 0 ? 'origin-top [transform:translateZ(0)] animate-[ring_2s_ease-in-out_infinite]' : ''}`}
      >
        <Bell size={19} strokeWidth={2} className="shrink-0 text-current" aria-hidden />
      </span>
      {unreadCount > 0 && (
        <span
          className={`customer-notification-badge absolute right-1 top-1 z-10 flex translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-red-500 font-extrabold tabular-nums leading-none text-white antialiased shadow-sm ${
            unreadCount > 9 ? 'h-4 min-w-5 px-1 text-[8px]' : 'size-4 text-[9px]'
          }`}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );

  const body = (
    <>
      <header className="ccn-header">
        <div className="ccn-header-top">
          <div className="ccn-header-heading">
            <Bell size={17} strokeWidth={2} aria-hidden />
            <h2>Notifications</h2>
            {unreadCount > 0 ? <span className="ccn-header-count">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
          </div>
          {unreadCount > 0 ? (
            <button type="button" className="ccn-mark-all" onClick={() => { void onMarkAllAsRead(); }}>
              Mark all as read
            </button>
          ) : null}
        </div>
        <p>Stay updated with your vehicle</p>
      </header>

      <div className="ccn-list">
        {loading ? (
          <div className="ccn-state" role="status" aria-label="Loading notifications">
            <LoaderCircle className="ccn-spin" size={22} aria-hidden />
            <p>Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="ccn-state">
            <span className="ccn-state-icon" aria-hidden><Bell size={22} /></span>
            <strong>You&apos;re all caught up</strong>
            <p>No new notifications right now.</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <CustomerNotificationCard
              key={getNotificationId(notification) || notification.title}
              notification={notification}
              onOpen={() => { void handleOpenNotification(notification); }}
            />
          ))
        )}
      </div>

      <footer className="ccn-footer">
        <button
          type="button"
          className="ccn-settings"
          onClick={() => { setOpen(false); onOpenSettings(); }}
        >
          <Settings2 size={14} aria-hidden />
          Notification Settings
        </button>
      </footer>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="customer-portal-theme ccn-sheet">
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="customer-portal-theme ccn-popover"
        role="dialog"
        aria-label="Notifications"
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

function CustomerNotificationCard({
  notification,
  onOpen,
}: {
  notification: SystemNotification;
  onOpen: () => void;
}) {
  const group = getCustomerNotificationGroup(notification);
  const Icon = getCustomerNotificationIcon(notification);
  const tag = getCustomerNotificationTag(notification);
  const isUnread = !notification.isRead;
  const showAction = hasCustomerNotificationAction(notification);

  return (
    <article className={`ccn-card ${isUnread ? 'is-unread' : ''}`}>
      <span className={`ccn-card-icon ccn-card-icon--${group}`} aria-hidden>
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <div className="ccn-card-body">
        <div className="ccn-card-title-row">
          <button type="button" className="ccn-card-title" onClick={onOpen}>
            {notification.title}
          </button>
          {isUnread ? <span className="ccn-unread-dot" aria-label="Unread" /> : null}
        </div>
        <span className={`customer-status ccn-tag ccn-tag--${tag}`} data-tone={CUSTOMER_TAG_TONE[tag]}>
          {CUSTOMER_TAG_LABEL[tag]}
        </span>
        <p className="ccn-card-message">{notification.message}</p>
        <time
          className="ccn-card-time"
          dateTime={getNotificationDateTime(notification)}
          title={getAbsoluteNotificationTime(notification)}
        >
          {formatCustomerNotificationTime(notification)}
        </time>
        {showAction ? (
          <button type="button" className="ccn-card-action" onClick={onOpen}>
            {getCustomerActionLabel(notification)}
          </button>
        ) : null}
      </div>
    </article>
  );
}
