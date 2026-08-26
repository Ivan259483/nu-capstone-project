import { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SystemNotification } from '@/lib/notification-service';
import { AdminNotificationIcon, NotificationSeverityPill } from './AdminNotificationVisuals';
import {
  getAbsoluteNotificationTime,
  getGroupCount,
  getNotificationActionLabel,
  getNotificationDateTime,
  getNotificationId,
  getNotificationSeverity,
  getNotificationSource,
  getRelativeNotificationTime,
  groupNotificationsByTime,
  isNotificationActionRequired,
  matchesFlyoutTab,
  NOTIFICATION_TIME_GROUPS,
  type NotificationFlyoutTab,
} from './notification-utils';
import './admin-notifications.css';

interface AdminNotificationBellProps {
  notifications: SystemNotification[];
  unreadCount?: number;
  onRefresh?: () => Promise<unknown> | unknown;
  onSetRead: (id: string, isRead: boolean) => Promise<unknown> | unknown;
  onMarkAllRead: () => Promise<unknown> | unknown;
  onOpenNotification: (notification: SystemNotification) => Promise<unknown> | unknown;
  onViewAll: () => void;
  onOpenSettings?: () => void;
  className?: string;
  theme?: 'light' | 'dark';
  loading?: boolean;
  error?: string | null;
  onRetry?: () => Promise<unknown> | unknown;
  contentClassName?: string;
  onOpenChange?: (open: boolean) => void;
}

const FLYOUT_TABS: Array<{ id: NotificationFlyoutTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'action', label: 'Action Required' },
  { id: 'system', label: 'System' },
];

function mutationFailed(result: unknown): boolean {
  return result === false || Boolean(
    result && typeof result === 'object' && 'success' in result && !(result as { success?: boolean }).success,
  );
}

export default function AdminNotificationBell({
  notifications,
  unreadCount: unreadCountProp,
  onRefresh,
  onSetRead,
  onMarkAllRead,
  onOpenNotification,
  onViewAll,
  onOpenSettings,
  className = '',
  theme = 'light',
  loading = false,
  error = null,
  onRetry,
  contentClassName = '',
  onOpenChange,
}: AdminNotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationFlyoutTab>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [announcement, setAnnouncement] = useState('');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const unreadCount = unreadCountProp ?? notifications.filter((item) => !item.isRead).length;
  const hasUnreadCritical = notifications.some(
    (item) => !item.isRead && getNotificationSeverity(item) === 'critical',
  );

  const tabCounts = useMemo(() => ({
    all: notifications.length,
    unread: notifications.filter((item) => !item.isRead).length,
    action: notifications.filter(isNotificationActionRequired).length,
    system: notifications.filter((item) => matchesFlyoutTab(item, 'system')).length,
  }), [notifications]);

  const visibleNotifications = useMemo(
    () => notifications.filter((item) => matchesFlyoutTab(item, activeTab)).slice(0, 20),
    [activeTab, notifications],
  );
  const groupedNotifications = useMemo(
    () => groupNotificationsByTime(visibleNotifications),
    [visibleNotifications],
  );

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (!nextOpen || !onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSetRead = async (notification: SystemNotification, isRead: boolean) => {
    const id = getNotificationId(notification);
    if (!id || pendingIds.has(id)) return;
    setPendingIds((current) => new Set(current).add(id));
    try {
      const result = await onSetRead(id, isRead);
      if (mutationFailed(result)) {
        setAnnouncement('Notification status could not be updated.');
        return;
      }
      setAnnouncement(`Notification marked as ${isRead ? 'read' : 'unread'}.`);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const handleOpenNotification = async (notification: SystemNotification) => {
    const result = await onOpenNotification(notification);
    if (result === false) return;
    setOpen(false);
  };

  const handleMarkAll = async () => {
    const result = await onMarkAllRead();
    setAnnouncement(
      mutationFailed(result)
        ? 'Notifications could not be updated.'
        : 'All notifications marked as read.',
    );
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + FLYOUT_TABS.length) % FLYOUT_TABS.length;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % FLYOUT_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = FLYOUT_TABS.length - 1;
    setActiveTab(FLYOUT_TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`anc-bell-trigger anc-theme--${theme} ${hasUnreadCritical ? 'has-critical' : ''} ${className}`.trim()}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <Bell size={18} strokeWidth={1.8} aria-hidden />
          {unreadCount > 0 ? (
            <span className="anc-bell-badge" aria-hidden>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
          {hasUnreadCritical ? <span className="anc-bell-critical-ring" aria-hidden /> : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className={`anc-flyout anc-theme--${theme} ${contentClassName}`.trim()}
        role="dialog"
        aria-labelledby="anc-flyout-title"
        aria-describedby="anc-flyout-summary"
      >
        <span className="anc-sr-only" aria-live="polite">{announcement}</span>

        <header className="anc-flyout-header">
          <div>
            <div className="anc-flyout-heading-row">
              <h2 id="anc-flyout-title">Notifications</h2>
              {isRefreshing ? <LoaderCircle className="anc-spin" size={14} aria-label="Refreshing" /> : null}
            </div>
            <p id="anc-flyout-summary">
              {unreadCount > 0 ? `${unreadCount.toLocaleString()} unread updates` : 'You’re all caught up'}
            </p>
          </div>
          <button
            type="button"
            className="anc-text-action"
            onClick={handleMarkAll}
            disabled={unreadCount === 0}
          >
            <CheckCheck size={15} aria-hidden />
            Mark all read
          </button>
        </header>

        <div className="anc-flyout-tabs" role="tablist" aria-label="Notification filters">
          {FLYOUT_TABS.map((tab, index) => (
            <button
              key={tab.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              type="button"
              role="tab"
              id={`anc-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls="anc-flyout-tabpanel"
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? 'is-active' : ''}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <span>{tab.label}</span>
              {tabCounts[tab.id] > 0 ? <small>{tabCounts[tab.id] > 99 ? '99+' : tabCounts[tab.id]}</small> : null}
            </button>
          ))}
        </div>

        <div
          id="anc-flyout-tabpanel"
          role="tabpanel"
          aria-labelledby={`anc-tab-${activeTab}`}
          className="anc-flyout-list"
        >
          {error && notifications.length > 0 ? (
            <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
              <span>Showing saved updates. Refresh failed.</span>
              {onRetry ? (
                <button type="button" className="font-bold text-amber-900 underline" onClick={() => { void onRetry(); }}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          {loading && notifications.length === 0 ? (
            <div className="space-y-3 p-4" role="status" aria-label="Loading notifications">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="flex animate-pulse gap-3 rounded-xl border border-slate-100 p-3">
                  <span className="h-9 w-9 shrink-0 rounded-xl bg-slate-100" />
                  <span className="min-w-0 flex-1 space-y-2">
                    <span className="block h-3 w-2/3 rounded bg-slate-100" />
                    <span className="block h-2.5 w-full rounded bg-slate-100" />
                    <span className="block h-2.5 w-1/3 rounded bg-slate-100" />
                  </span>
                </div>
              ))}
            </div>
          ) : error && notifications.length === 0 ? (
            <div className="anc-empty anc-empty--flyout" role="alert">
              <span className="anc-empty-icon"><Bell size={22} aria-hidden /></span>
              <strong>Notifications couldn&apos;t be loaded</strong>
              <p>{error}</p>
              {onRetry ? (
                <button type="button" className="anc-quick-action" onClick={() => { void onRetry(); }}>
                  <RefreshCw size={13} aria-hidden />
                  Try again
                </button>
              ) : null}
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="anc-empty anc-empty--flyout">
              <span className="anc-empty-icon"><Check size={22} aria-hidden /></span>
              <strong>{activeTab === 'all' ? 'You’re all caught up' : 'No notifications here'}</strong>
              <p>{activeTab === 'all' ? 'No notifications need your attention right now.' : `There are no ${FLYOUT_TABS.find((tab) => tab.id === activeTab)?.label.toLowerCase()} notifications.`}</p>
            </div>
          ) : (
            NOTIFICATION_TIME_GROUPS.map((group) => {
              const groupItems = groupedNotifications[group];
              if (groupItems.length === 0) return null;
              return (
                <section key={group} className="anc-time-group" aria-labelledby={`anc-time-${group.toLowerCase()}`}>
                  <h3 id={`anc-time-${group.toLowerCase()}`}>{group}</h3>
                  <div>
                    {groupItems.map((notification) => {
                      const id = getNotificationId(notification);
                      const severity = getNotificationSeverity(notification);
                      const groupCount = getGroupCount(notification);
                      const isPending = pendingIds.has(id);
                      return (
                        <article
                          key={id}
                          className={`anc-flyout-item ${notification.isRead ? 'is-read' : 'is-unread'} anc-notification--${severity}`}
                        >
                          <AdminNotificationIcon notification={notification} />
                          <div className="anc-flyout-item-content">
                            <div className="anc-flyout-item-title-row">
                              <button
                                type="button"
                                className="anc-flyout-title-button"
                                onClick={() => handleOpenNotification(notification)}
                              >
                                {notification.title}
                              </button>
                              {!notification.isRead ? <span className="anc-unread-dot" aria-label="Unread" /> : null}
                            </div>
                            <p>{notification.message}</p>
                            <div className="anc-item-meta">
                              <span>{getNotificationSource(notification)}</span>
                              <span aria-hidden>•</span>
                              <time
                                dateTime={getNotificationDateTime(notification)}
                                title={getAbsoluteNotificationTime(notification)}
                              >
                                {getRelativeNotificationTime(notification)}
                              </time>
                            </div>
                            <div className="anc-item-actions">
                              <NotificationSeverityPill severity={severity} />
                              {groupCount > 1 ? <span className="anc-group-count">{groupCount} related</span> : null}
                              <button
                                type="button"
                                className="anc-quick-action"
                                onClick={() => handleOpenNotification(notification)}
                              >
                                {getNotificationActionLabel(notification)}
                                <ExternalLink size={12} aria-hidden />
                              </button>
                            </div>
                          </div>
                          {!notification.isResolved ? (
                            <button
                              type="button"
                              className="anc-read-toggle"
                              onClick={() => handleSetRead(notification, !notification.isRead)}
                              disabled={isPending}
                              aria-label={`Mark “${notification.title}” as ${notification.isRead ? 'unread' : 'read'}`}
                              title={notification.isRead ? 'Mark as unread' : 'Mark as read'}
                            >
                              {isPending
                                ? <LoaderCircle className="anc-spin" size={14} aria-hidden />
                                : notification.isRead
                                  ? <span className="anc-read-hollow" aria-hidden />
                                  : <Check size={14} aria-hidden />}
                            </button>
                          ) : <span className="anc-read-toggle" aria-label="Resolved notification"><Check size={14} aria-hidden /></span>}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>

        <footer className="anc-flyout-footer">
          {onOpenSettings ? (
            <button
              type="button"
              className="anc-footer-secondary"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            >
              <Settings2 size={15} aria-hidden />
              Settings
            </button>
          ) : <span />}
          <button
            type="button"
            className="anc-view-all"
            onClick={() => {
              setOpen(false);
              onViewAll();
            }}
          >
            View all notifications
            <ArrowRight size={15} aria-hidden />
          </button>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
