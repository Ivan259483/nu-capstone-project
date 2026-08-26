import { useMemo, useState } from 'react';
import { isToday, isValid, isYesterday, parseISO } from 'date-fns';
import {
  Check,
  CheckCheck,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AdminNotificationIcon } from '@/components/Administrator/notifications/AdminNotificationVisuals';
import {
  getAbsoluteNotificationTime,
  getNotificationActionLabel,
  getNotificationDateTime,
  getNotificationId,
  getNotificationSeverity,
  getRelativeNotificationTime,
  isNotificationActionRequired,
} from '@/components/Administrator/notifications/notification-utils';
import type {
  NotificationPagination,
  SystemNotification,
} from '@/lib/notification-service';

type CenterTab = 'all' | 'unread' | 'action';
type CenterCategory = 'all' | 'evidence' | 'qc' | 'jobs';
type DateGroup = 'Today' | 'Yesterday' | 'Earlier';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: SystemNotification[];
  unreadCount: number;
  pagination: NotificationPagination;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  onRefresh: () => Promise<unknown> | unknown;
  onLoadMore: () => Promise<unknown> | unknown;
  onSetRead: (id: string, isRead: boolean) => Promise<unknown> | unknown;
  onMarkAllRead: () => Promise<unknown> | unknown;
  onOpenNotification: (notification: SystemNotification) => Promise<unknown> | unknown;
}

const DATE_GROUPS: DateGroup[] = ['Today', 'Yesterday', 'Earlier'];

function notificationType(notification: SystemNotification): string {
  const metadataType = notification.metadata?.notificationType;
  return String(
    (typeof metadataType === 'string' && metadataType)
      || notification.event
      || notification.type
      || '',
  ).toUpperCase();
}

function categoryFor(notification: SystemNotification): Exclude<CenterCategory, 'all'> {
  const type = notificationType(notification);
  if (type.includes('EVIDENCE')) return 'evidence';
  if (type.includes('QC') || type === 'READY_FOR_QC') return 'qc';
  return 'jobs';
}

function dateGroupFor(notification: SystemNotification): DateGroup {
  const date = parseISO(notification.lastOccurredAt || notification.createdAt || '');
  if (!isValid(date)) return 'Earlier';
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return 'Earlier';
}

export default function QCNotificationCenter({
  open,
  onOpenChange,
  notifications,
  unreadCount,
  pagination,
  loading,
  loadingMore,
  error,
  onRefresh,
  onLoadMore,
  onSetRead,
  onMarkAllRead,
  onOpenNotification,
}: Props) {
  const [tab, setTab] = useState<CenterTab>('all');
  const [category, setCategory] = useState<CenterCategory>('all');
  const [search, setSearch] = useState('');

  const actionCount = useMemo(
    () => notifications.filter(isNotificationActionRequired).length,
    [notifications],
  );
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return notifications.filter((notification) => {
      if (tab === 'unread' && notification.isRead) return false;
      if (tab === 'action' && !isNotificationActionRequired(notification)) return false;
      if (category !== 'all' && categoryFor(notification) !== category) return false;
      if (!needle) return true;
      return `${notification.title} ${notification.message} ${notificationType(notification)}`
        .toLowerCase()
        .includes(needle);
    });
  }, [category, notifications, search, tab]);
  const grouped = useMemo(() => visible.reduce<Record<DateGroup, SystemNotification[]>>(
    (groups, notification) => {
      groups[dateGroupFor(notification)].push(notification);
      return groups;
    },
    { Today: [], Yesterday: [], Earlier: [] },
  ), [visible]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-slate-950/30 backdrop-blur-[2px]"
        className="flex max-h-[min(880px,calc(100dvh-32px))] w-[calc(100vw-24px)] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border-slate-200 bg-slate-50 p-0 shadow-2xl sm:w-[calc(100vw-48px)]"
      >
        <DialogHeader className="border-b border-slate-200 bg-white px-5 py-5 pr-14 text-left sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Quality Command Center</p>
              <DialogTitle className="mt-1.5 text-xl font-bold tracking-tight text-slate-950">
                Notifications
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5 text-slate-500">
                Evidence, assignment, and QC workflow events for jobs you can act on.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 self-start">
              <button
                type="button"
                onClick={() => { void onRefresh(); }}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => { void onMarkAllRead(); }}
                disabled={unreadCount === 0}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-default disabled:bg-slate-200 disabled:text-slate-400"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="grid grid-cols-3 gap-2 sm:max-w-md">
            {([
              ['all', 'All', pagination.total],
              ['unread', 'Unread', unreadCount],
              ['action', 'Action Required', actionCount],
            ] as const).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  tab === id
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="block text-[10px] font-semibold uppercase tracking-wide">{label}</span>
                <span className="mt-0.5 block text-lg font-bold tabular-nums">{count > 99 ? '99+' : count}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search notifications"
                aria-label="Search notifications"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
              />
            </label>
            <select
              aria-label="Filter notifications by type"
              value={category}
              onChange={(event) => setCategory(event.target.value as CenterCategory)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-500/10"
            >
              <option value="all">All event types</option>
              <option value="evidence">Evidence</option>
              <option value="qc">Quality Check</option>
              <option value="jobs">Job updates</option>
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50">
          {error && notifications.length > 0 ? (
            <div className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 sm:mx-5" role="status">
              <span>Showing saved notifications. The latest refresh failed.</span>
              <button type="button" className="font-bold text-amber-900 underline" onClick={() => { void onRefresh(); }}>
                Retry
              </button>
            </div>
          ) : null}
          {loading && notifications.length === 0 ? (
            <div className="space-y-3 p-5 sm:p-6" role="status" aria-label="Loading notifications">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="flex animate-pulse gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="h-10 w-10 shrink-0 rounded-xl bg-slate-100" />
                  <span className="flex-1 space-y-2.5">
                    <span className="block h-3 w-1/3 rounded bg-slate-100" />
                    <span className="block h-3 w-4/5 rounded bg-slate-100" />
                    <span className="block h-2.5 w-1/4 rounded bg-slate-100" />
                  </span>
                </div>
              ))}
            </div>
          ) : error && notifications.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center" role="alert">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <RefreshCw size={18} />
              </span>
              <p className="mt-3 text-sm font-bold text-slate-800">Notifications couldn&apos;t be loaded.</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{error}</p>
              <button
                type="button"
                onClick={() => { void onRefresh(); }}
                className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-blue-600"
              >
                Try again
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <Check size={19} />
              </span>
              <p className="mt-3 text-sm font-bold text-slate-800">
                {notifications.length === 0 ? 'You’re all caught up' : 'No notifications here'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {notifications.length === 0
                  ? 'No notifications need your attention right now.'
                  : 'Try another filter, or check back when the workflow changes.'}
              </p>
            </div>
          ) : (
            <div className="p-3 sm:p-5">
              {DATE_GROUPS.map((group) => {
                const rows = grouped[group];
                if (!rows.length) return null;
                return (
                  <section key={group} className="mb-5 last:mb-0" aria-labelledby={`qc-notification-${group.toLowerCase()}`}>
                    <h3 id={`qc-notification-${group.toLowerCase()}`} className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {group}
                    </h3>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      {rows.map((notification) => {
                        const id = getNotificationId(notification);
                        const severity = getNotificationSeverity(notification);
                        return (
                          <article
                            key={id}
                            className={`relative flex gap-3 border-b border-slate-100 p-4 last:border-b-0 ${
                              notification.isRead ? 'bg-white' : 'bg-blue-50/45'
                            }`}
                          >
                            {!notification.isRead ? <span className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-blue-500" /> : null}
                            <AdminNotificationIcon notification={notification} size={17} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => { void onOpenNotification(notification); }}
                                  className="text-left text-sm font-bold leading-5 text-slate-900 transition hover:text-blue-700"
                                >
                                  {notification.title}
                                </button>
                                {!notification.isRead ? <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-label="Unread" /> : null}
                                {notification.isResolved ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">Resolved</span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-slate-600">{notification.message}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                                <span className="font-semibold text-slate-500">{notificationType(notification).replace(/_/g, ' ')}</span>
                                <span>•</span>
                                <time dateTime={getNotificationDateTime(notification)} title={getAbsoluteNotificationTime(notification)}>
                                  {getRelativeNotificationTime(notification)}
                                </time>
                                <span>•</span>
                                <span className={`font-semibold ${
                                  severity === 'critical' ? 'text-rose-600'
                                    : severity === 'warning' ? 'text-amber-600'
                                      : severity === 'success' ? 'text-emerald-600'
                                        : 'text-blue-600'
                                }`}>{severity}</span>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-2">
                              <button
                                type="button"
                                onClick={() => { void onOpenNotification(notification); }}
                                aria-label={`${getNotificationActionLabel(notification)} for ${notification.title}`}
                                className="inline-flex h-8 items-center gap-1 rounded-lg bg-blue-50 px-2.5 text-[10px] font-bold text-blue-700 transition hover:bg-blue-100"
                              >
                                {getNotificationActionLabel(notification)}
                                <ChevronRight size={12} />
                              </button>
                              {!notification.isResolved ? (
                                <button
                                  type="button"
                                  onClick={() => { void onSetRead(id, !notification.isRead); }}
                                  aria-label={`Mark ${notification.title} as ${notification.isRead ? 'unread' : 'read'}`}
                                  className="text-[10px] font-semibold text-slate-400 transition hover:text-blue-600"
                                >
                                  Mark {notification.isRead ? 'unread' : 'read'}
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {pagination.hasNextPage ? (
                <div className="pb-1 pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => { void onLoadMore(); }}
                    disabled={loadingMore}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {loadingMore ? <LoaderCircle size={14} className="animate-spin" /> : null}
                    Load more
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
