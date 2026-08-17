import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  NotificationService,
  type NotificationFacets,
  type NotificationPagination,
  type SystemNotification,
} from '@/lib/notification-service';
import { AdminNotificationIcon, NotificationSeverityPill } from './AdminNotificationVisuals';
import {
  getAbsoluteNotificationTime,
  getGroupCount,
  getNotificationActionLabel,
  getNotificationCategory,
  getNotificationDateTime,
  getNotificationId,
  getNotificationSeverity,
  getNotificationSource,
  getRelativeNotificationTime,
  groupNotificationsByTime,
  isNotificationActionRequired,
  NOTIFICATION_TIME_GROUPS,
} from './notification-utils';
import './admin-notifications.css';

interface AdminNotificationCenterPageProps {
  onOpenNotification: (notification: SystemNotification) => Promise<unknown> | unknown;
  onFeedChanged?: () => Promise<unknown> | unknown;
}

const EMPTY_PAGINATION: NotificationPagination = {
  page: 1,
  limit: 12,
  total: 0,
  pages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'appointments', label: 'Appointments' },
  { value: 'live_tracking', label: 'Live tracking' },
  { value: 'payments', label: 'Payments' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'security', label: 'Security' },
  { value: 'system', label: 'System' },
];

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Success' },
];

const READ_OPTIONS = [
  { value: 'all', label: 'All states' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

function getFacetNumber(facets: NotificationFacets, key: string): number | undefined {
  const direct = facets[key];
  if (typeof direct === 'number') return direct;
  return undefined;
}

function getPageNumbers(page: number, pages: number): number[] {
  const safePages = Math.max(1, pages);
  const start = Math.max(1, Math.min(page - 2, safePages - 4));
  const end = Math.min(safePages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export default function AdminNotificationCenterPage({
  onOpenNotification,
  onFeedChanged,
}: AdminNotificationCenterPageProps) {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [pagination, setPagination] = useState<NotificationPagination>(EMPTY_PAGINATION);
  const [facets, setFacets] = useState<NotificationFacets>({});
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [readStatus, setReadStatus] = useState<'all' | 'read' | 'unread'>('all');
  const [archived, setArchived] = useState<'exclude' | 'include' | 'only'>('exclude');
  const [actionRequiredOnly, setActionRequiredOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const fetchNotifications = useCallback(async (silent = false) => {
    const requestSequence = ++requestSequenceRef.current;
    if (!silent) setIsLoading(true);
    setError('');
    const response = await NotificationService.getNotifications({
      search: search || undefined,
      category: category === 'all' ? undefined : category,
      severity: severity === 'all' ? undefined : severity,
      readStatus,
      actionRequired: actionRequiredOnly || undefined,
      archived,
      page,
      limit: EMPTY_PAGINATION.limit,
    });

    if (requestSequence !== requestSequenceRef.current) return;

    if (response.success) {
      setNotifications(Array.isArray(response.data) ? response.data : []);
      setPagination(response.pagination || {
        ...EMPTY_PAGINATION,
        page,
        total: response.data?.length || 0,
      });
      setFacets(response.facets || {});
      setUnreadCount(Number(response.unreadCount || 0));
      setSelectedIds(new Set());
      setConfirmingClear(false);
    } else {
      setError(response.message || 'Notifications could not be loaded.');
    }
    setIsLoading(false);
  }, [actionRequiredOnly, archived, category, page, readStatus, search, severity]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const groupedNotifications = useMemo(
    () => groupNotificationsByTime(notifications),
    [notifications],
  );
  const allPageIds = useMemo(
    () => notifications.map(getNotificationId).filter(Boolean),
    [notifications],
  );
  const allPageSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));
  const somePageSelected = allPageIds.some((id) => selectedIds.has(id));

  const derivedCritical = notifications.filter(
    (item) => getNotificationSeverity(item) === 'critical',
  ).length;
  const derivedActionRequired = notifications.filter(isNotificationActionRequired).length;
  const criticalCount = facets.severities?.critical
    ?? getFacetNumber(facets, 'critical')
    ?? derivedCritical;
  const actionRequiredCount = getFacetNumber(facets, 'actionRequired') ?? derivedActionRequired;

  const resetPageAnd = (setter: () => void) => {
    setter();
    setPage(1);
  };

  const togglePageSelection = () => {
    if (allPageSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(allPageIds));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmingClear(false);
  };

  const finishMutation = async (message: string) => {
    toast.success(message);
    await Promise.all([
      fetchNotifications(true),
      Promise.resolve(onFeedChanged?.()),
    ]);
  };

  const bulkSetRead = async (isRead: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsMutating(true);
    const response = await NotificationService.bulkSetReadStatus(ids, isRead);
    if (response.success) {
      await finishMutation(`${ids.length} notification${ids.length === 1 ? '' : 's'} marked as ${isRead ? 'read' : 'unread'}.`);
    } else {
      toast.error(response.message || 'Notification status could not be updated.');
    }
    setIsMutating(false);
  };

  const bulkArchive = async (shouldArchive: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsMutating(true);
    const response = await NotificationService.setArchived(ids, shouldArchive);
    if (response.success) {
      await finishMutation(`${ids.length} notification${ids.length === 1 ? '' : 's'} ${shouldArchive ? 'archived' : 'restored'}.`);
    } else {
      toast.error(response.message || 'Notifications could not be updated.');
    }
    setIsMutating(false);
  };

  const clearSelected = async () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsMutating(true);
    const response = await NotificationService.clear(ids);
    if (response.success) {
      await finishMutation(`${ids.length} notification${ids.length === 1 ? '' : 's'} cleared from your center.`);
    } else {
      toast.error(response.message || 'Notifications could not be cleared.');
    }
    setIsMutating(false);
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    setIsMutating(true);
    const response = await NotificationService.markAllAsRead();
    if (response.success) {
      await finishMutation('All notifications marked as read.');
    } else {
      toast.error(response.message || 'Notifications could not be marked as read.');
    }
    setIsMutating(false);
  };

  const setOneReadStatus = async (notification: SystemNotification, isRead: boolean) => {
    const id = getNotificationId(notification);
    if (!id) return;
    setIsMutating(true);
    const response = await NotificationService.setReadStatus(id, isRead);
    if (response.success) {
      setNotifications((current) => current.map((item) => (
        getNotificationId(item) === id
          ? { ...item, isRead, readAt: isRead ? new Date().toISOString() : null }
          : item
      )));
      setUnreadCount((current) => Math.max(0, current + (isRead ? -1 : 1)));
      await onFeedChanged?.();
    } else {
      toast.error(response.message || 'Notification status could not be updated.');
    }
    setIsMutating(false);
  };

  const openNotification = async (notification: SystemNotification) => {
    await onOpenNotification(notification);
    await onFeedChanged?.();
  };

  const hasFilters = Boolean(
    searchInput ||
    category !== 'all' ||
    severity !== 'all' ||
    readStatus !== 'all' ||
    archived !== 'exclude' ||
    actionRequiredOnly,
  );

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategory('all');
    setSeverity('all');
    setReadStatus('all');
    setArchived('exclude');
    setActionRequiredOnly(false);
    setPage(1);
  };

  return (
    <div className="anc-page">
      <div className="anc-page-heading">
        <div>
          <span className="anc-eyebrow"><Bell size={14} aria-hidden /> Operational command center</span>
          <h1>Notifications</h1>
          <p>Prioritized operational, financial, inventory, security, and system events that need your attention.</p>
        </div>
        <div className="anc-page-heading-actions">
          <button
            type="button"
            className="anc-page-button anc-page-button--secondary"
            onClick={() => fetchNotifications()}
            disabled={isLoading}
          >
            <RefreshCw className={isLoading ? 'anc-spin' : ''} size={16} aria-hidden />
            Refresh
          </button>
          <button
            type="button"
            className="anc-page-button anc-page-button--primary"
            onClick={markAllRead}
            disabled={unreadCount === 0 || isMutating}
          >
            <CheckCheck size={16} aria-hidden />
            Mark all read
          </button>
        </div>
      </div>

      <section className="anc-summary-grid" aria-label="Notification summary">
        <button type="button" className="anc-summary-card" onClick={() => resetPageAnd(() => setReadStatus('all'))}>
          <span className="anc-summary-icon anc-summary-icon--all"><Inbox size={18} aria-hidden /></span>
          <span><small>Total events</small><strong>{pagination.total.toLocaleString()}</strong></span>
        </button>
        <button type="button" className="anc-summary-card" onClick={() => resetPageAnd(() => setReadStatus('unread'))}>
          <span className="anc-summary-icon anc-summary-icon--unread"><Bell size={18} aria-hidden /></span>
          <span><small>Unread</small><strong>{unreadCount.toLocaleString()}</strong></span>
        </button>
        <button type="button" className="anc-summary-card" onClick={() => resetPageAnd(() => setActionRequiredOnly(true))}>
          <span className="anc-summary-icon anc-summary-icon--action"><ShieldAlert size={18} aria-hidden /></span>
          <span><small>Action required</small><strong>{actionRequiredCount.toLocaleString()}</strong></span>
        </button>
        <button type="button" className="anc-summary-card" onClick={() => resetPageAnd(() => setSeverity('critical'))}>
          <span className="anc-summary-icon anc-summary-icon--critical"><ShieldAlert size={18} aria-hidden /></span>
          <span><small>Critical</small><strong>{criticalCount.toLocaleString()}</strong></span>
        </button>
      </section>

      <section className="anc-center-card" aria-labelledby="anc-center-list-title">
        <div className="anc-center-toolbar">
          <div className="anc-center-toolbar-top">
            <div>
              <h2 id="anc-center-list-title">Notification history</h2>
              <p>{pagination.total.toLocaleString()} event{pagination.total === 1 ? '' : 's'} found</p>
            </div>
            <label className="anc-search-field">
              <Search size={16} aria-hidden />
              <span className="anc-sr-only">Search notifications</span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search title, message, or source…"
              />
              {searchInput !== search ? <LoaderCircle className="anc-spin" size={14} aria-label="Searching" /> : null}
            </label>
          </div>

          <div className="anc-filter-row">
            <label>
              <span className="anc-sr-only">Filter by type</span>
              <select value={category} onChange={(event) => resetPageAnd(() => setCategory(event.target.value))}>
                {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="anc-sr-only">Filter by severity</span>
              <select value={severity} onChange={(event) => resetPageAnd(() => setSeverity(event.target.value))}>
                {SEVERITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="anc-sr-only">Filter by read state</span>
              <select
                value={readStatus}
                onChange={(event) => resetPageAnd(() => setReadStatus(event.target.value as 'all' | 'read' | 'unread'))}
              >
                {READ_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span className="anc-sr-only">Filter archived notifications</span>
              <select
                value={archived}
                onChange={(event) => resetPageAnd(() => setArchived(event.target.value as 'exclude' | 'include' | 'only'))}
              >
                <option value="exclude">Active only</option>
                <option value="include">Include archived</option>
                <option value="only">Archived only</option>
              </select>
            </label>
            <button
              type="button"
              className={`anc-action-filter ${actionRequiredOnly ? 'is-active' : ''}`}
              aria-pressed={actionRequiredOnly}
              onClick={() => resetPageAnd(() => setActionRequiredOnly((current) => !current))}
            >
              <ShieldAlert size={14} aria-hidden />
              Action required
            </button>
            {hasFilters ? <button type="button" className="anc-clear-filters" onClick={clearFilters}>Clear filters</button> : null}
          </div>
        </div>

        <div className="anc-select-row">
          <label className="anc-checkbox-label">
            <input
              type="checkbox"
              checked={allPageSelected}
              ref={(input) => { if (input) input.indeterminate = !allPageSelected && somePageSelected; }}
              onChange={togglePageSelection}
              disabled={notifications.length === 0}
            />
            <span>{selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select this page'}</span>
          </label>
          <span>Newest first</span>
        </div>

        {selectedIds.size > 0 ? (
          <div className="anc-bulk-bar" role="region" aria-label="Bulk notification actions">
            <strong>{selectedIds.size} selected</strong>
            <div>
              <button type="button" onClick={() => bulkSetRead(true)} disabled={isMutating}><Check size={14} aria-hidden /> Mark read</button>
              <button type="button" onClick={() => bulkSetRead(false)} disabled={isMutating}><Bell size={14} aria-hidden /> Mark unread</button>
              <button type="button" onClick={() => bulkArchive(archived !== 'only')} disabled={isMutating}>
                {archived === 'only' ? <ArchiveRestore size={14} aria-hidden /> : <Archive size={14} aria-hidden />}
                {archived === 'only' ? 'Restore' : 'Archive'}
              </button>
              <button
                type="button"
                className={confirmingClear ? 'is-confirming' : ''}
                onClick={clearSelected}
                disabled={isMutating}
              >
                <Trash2 size={14} aria-hidden />
                {confirmingClear ? 'Confirm clear' : 'Clear'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="anc-center-list" aria-live="polite" aria-busy={isLoading}>
          {isLoading ? (
            <div className="anc-loading-list" aria-label="Loading notifications">
              {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
            </div>
          ) : error ? (
            <div className="anc-empty">
              <span className="anc-empty-icon anc-empty-icon--error"><ShieldAlert size={22} aria-hidden /></span>
              <strong>Couldn’t load notifications</strong>
              <p>{error}</p>
              <button type="button" onClick={() => fetchNotifications()}>Try again</button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="anc-empty">
              <span className="anc-empty-icon"><Check size={22} aria-hidden /></span>
              <strong>{hasFilters ? 'No matching notifications' : 'You’re all caught up'}</strong>
              <p>{hasFilters ? 'Try broadening your search or clearing a filter.' : 'New operational events will appear here when they need awareness or action.'}</p>
              {hasFilters ? <button type="button" onClick={clearFilters}>Clear filters</button> : null}
            </div>
          ) : (
            NOTIFICATION_TIME_GROUPS.map((group) => {
              const items = groupedNotifications[group];
              if (items.length === 0) return null;
              return (
                <section key={group} className="anc-center-time-group" aria-labelledby={`anc-center-${group.toLowerCase()}`}>
                  <h3 id={`anc-center-${group.toLowerCase()}`}>{group}</h3>
                  <div>
                    {items.map((notification) => {
                      const id = getNotificationId(notification);
                      const notificationSeverity = getNotificationSeverity(notification);
                      const groupCount = getGroupCount(notification);
                      const isSelected = selectedIds.has(id);
                      return (
                        <article
                          key={id}
                          className={`anc-center-item ${notification.isRead ? 'is-read' : 'is-unread'} ${isSelected ? 'is-selected' : ''} anc-notification--${notificationSeverity}`}
                        >
                          <label className="anc-row-checkbox">
                            <span className="anc-sr-only">Select {notification.title}</span>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleSelection(id)} />
                          </label>
                          <AdminNotificationIcon notification={notification} size={19} />
                          <div className="anc-center-item-main">
                            <div className="anc-center-item-heading">
                              <button type="button" onClick={() => openNotification(notification)}>{notification.title}</button>
                              {!notification.isRead ? <span className="anc-unread-label"><span /> Unread</span> : null}
                              {groupCount > 1 ? <span className="anc-group-count">{groupCount} grouped events</span> : null}
                            </div>
                            <p>{notification.message}</p>
                            <div className="anc-center-item-meta">
                              <span>{getNotificationSource(notification)}</span>
                              <span>{getNotificationCategory(notification).replace(/_/g, ' ')}</span>
                              <NotificationSeverityPill severity={notificationSeverity} />
                              <time dateTime={getNotificationDateTime(notification)} title={getAbsoluteNotificationTime(notification)}>
                                {getRelativeNotificationTime(notification)}
                              </time>
                            </div>
                          </div>
                          <div className="anc-center-item-actions">
                            <button
                              type="button"
                              className="anc-row-read-action"
                              onClick={() => setOneReadStatus(notification, !notification.isRead)}
                              disabled={isMutating}
                            >
                              {notification.isRead ? 'Mark unread' : 'Mark read'}
                            </button>
                            <button
                              type="button"
                              className="anc-row-open-action"
                              onClick={() => openNotification(notification)}
                            >
                              {getNotificationActionLabel(notification)}
                              <ExternalLink size={13} aria-hidden />
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>

        {!isLoading && !error && pagination.total > 0 ? (
          <footer className="anc-pagination">
            <p>
              Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()}
            </p>
            <nav aria-label="Notification pages">
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!pagination.hasPreviousPage}
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              {getPageNumbers(pagination.page, pagination.pages).map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={pageNumber === pagination.page ? 'is-active' : ''}
                  aria-current={pageNumber === pagination.page ? 'page' : undefined}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                aria-label="Next page"
                onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
                disabled={!pagination.hasNextPage}
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </nav>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
