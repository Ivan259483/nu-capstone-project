import React, { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './administrator.css';
import { UserService } from '@/lib/user-service';
import { ActivityService } from '@/lib/activity-service-api';
import { OrderService } from '@/lib/order-service';
import {
  LayoutDashboard,
  Users,
  User,
  ShieldCheck,
  ScrollText,
  ArrowLeft,
  X,
  Radio,
  PhilippinePeso,
  Calendar,
  Package,
  Bell,
  ServerCog,
  type LucideIcon,
} from 'lucide-react';
import AdminTopBar from './AdminTopBar';
import { NotificationService, type SystemNotification } from '@/lib/notification-service';
import {
  getNotificationCategory,
  getNotificationId,
  getNotificationLink,
} from './notifications/notification-utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSafeUserRole, isServiceCatalogRole } from '@/lib/roles';
import { CalendarScheduleDnDProvider, useCalendarScheduleDnD } from '@/components/sales/calendar/CalendarScheduleDnDContext';
import type { PendingPaymentsSummary } from '@/lib/payment-service';
import {
  ADMIN_HUB_ROUTABLE_TAB_IDS,
  createAdminHubLocation,
  resolveAdminHubPage,
} from './adminHubNavigation';
import { canOpenSystemManagement } from './pages/systemManagementUtils';

const AdminNotificationCenterPage = lazy(() => import('./notifications/AdminNotificationCenterPage'));
const AdminUserProfilePage = lazy(() => import('./pages/AdminUserProfilePage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminUserManagement = lazy(() => import('./pages/AdminUserManagement'));
const AdminActivityLogs = lazy(() => import('./pages/AdminActivityLogs'));
const AdminRoleManagement = lazy(() => import('./pages/AdminRoleManagement'));
const AdminAppointmentsPage = lazy(() => import('./pages/AdminAppointmentsPage'));
const CustomerTrackerPanel = lazy(() => import('@/components/ops-manager/CustomerTrackerPanel'));
const ServicesPricing = lazy(() => import('@/components/admin/ServicesPricing').then((module) => ({
  default: module.ServicesPricing,
})));
const InventoryPanel = lazy(() => import('@/components/inventory/InventoryPanel'));
const SystemManagementPage = lazy(() => import('./pages/SystemManagementPage'));

interface Props {
  currentUser?: any;
  onClose?: () => void;
  // Extended props for full admin mode
  inventory?: any[];
  suppliers?: any[];
  services?: any[];
  bookings?: any[];
  payments?: any[];
  pendingPaymentsSummary?: PendingPaymentsSummary | null;
  activityLogs?: any[];
  settings?: any;
  setSettings?: (s: any) => void;
  onLoadData?: () => void;
  onAddSupplier?: () => void;
  onEditSupplier?: (s: any) => void;
  onOrderSupplier?: (s: any) => void;
  onSaveSettings?: (partial: any) => void;
  fullMode?: boolean; // When true, this is the ONLY UI (no old dashboard behind it)
  /** Parent AdminDashboard also loads GET /users; use it as a background refresh source after the Hub's immediate directory load. */
  syncUserDirectoryFromParent?: boolean;
  directoryUsers?: any[];
  directoryBulkLoaded?: boolean;
  notificationFeed?: SystemNotification[];
  notificationUnreadCount?: number;
  onRefreshNotificationFeed?: () => Promise<unknown> | unknown;
  onSetNotificationRead?: (id: string, isRead: boolean) => Promise<unknown> | unknown;
  onMarkAllNotificationsRead?: () => Promise<unknown> | unknown;
}

const SIDEBAR_WIDTH_EXPANDED = 260;
const SIDEBAR_WIDTH_COLLAPSED = 64;
const ADMINHUB_THEME_STORAGE_KEY = 'adminhub_theme';
const ADMINHUB_SIDEBAR_STORAGE_KEY = 'adminhub_sidebar_collapsed';
const ADMINHUB_NARROW_VIEWPORT_QUERY = '(max-width: 720px)';

function isAdminHubNarrowViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(ADMINHUB_NARROW_VIEWPORT_QUERY).matches
  );
}

function readAdminHubSidebarPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ADMINHUB_SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeAdminHubSidebarPreference(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ADMINHUB_SIDEBAR_STORAGE_KEY, String(collapsed));
  } catch {
    /* Keep the in-memory preference when storage is unavailable. */
  }
}

type NavChild = { id: string; label: string };

type NavLeaf = {
  type: 'leaf';
  id: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  type: 'group';
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavChild[];
};

type NavEntry = NavLeaf | NavGroup;

const MANAGEMENT_CHILDREN: NavChild[] = [
  { id: 'users', label: 'All users' },
  { id: 'roles', label: 'Permissions' },
  { id: 'logs', label: 'Activity logs' },
];

const NAV_SECTION_LABELS: Record<string, string> = {
  dashboard: 'GENERAL',
  operations: 'OPERATIONS',
  catalog: 'CATALOG',
  management: 'USERS',
  system: 'SYSTEM',
};

const PAGE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  notifications: Bell,
  scheduling: Calendar,
  live_tracking: Radio,
  pricing: PhilippinePeso,
  inventory: Package,
  users: Users,
  roles: ShieldCheck,
  logs: ScrollText,
  system_management: ServerCog,
  profile: User,
};

function buildNavTree(role: string): NavEntry[] {
  if (role === 'staff_quality_checker') {
    return [
      {
        type: 'group',
        id: 'operations',
        label: 'Operations',
        icon: Radio,
        children: [{ id: 'live_tracking', label: 'Live Tracking' }],
      },
    ];
  }

  const managementGroup: NavGroup = {
    type: 'group',
    id: 'management',
    label: 'Users',
    icon: Users,
    children: MANAGEMENT_CHILDREN,
  };

  const dashboardGroup: NavGroup = {
    type: 'group',
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    children: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'notifications', label: 'Notifications' },
    ],
  };

  if (role === 'administrator' || role === 'office_admin') {
    return [
      dashboardGroup,
      {
        type: 'group',
        id: 'operations',
        label: 'Operations',
        icon: Calendar,
        children: [
          { id: 'scheduling', label: 'Appointments' },
          { id: 'live_tracking', label: 'Live Tracking' },
        ],
      },
      {
        type: 'group',
        id: 'catalog',
        label: 'Catalog',
        icon: Package,
        children: [
          { id: 'pricing', label: 'Services' },
          { id: 'inventory', label: 'Inventory' },
        ],
      },
      managementGroup,
      {
        type: 'group',
        id: 'system',
        label: 'System',
        icon: ServerCog,
        children: [{ id: 'system_management', label: 'System Management' }],
      },
    ];
  }

  return [dashboardGroup, managementGroup];
}

function filterNavTree(tree: NavEntry[], query: string): NavEntry[] {
  if (!query) return tree;

  return tree.flatMap((entry): NavEntry[] => {
    if (entry.type === 'leaf') {
      return entry.label.toLowerCase().includes(query) ? [entry] : [];
    }

    const matchingChildren = entry.children.filter((child) =>
      child.label.toLowerCase().includes(query),
    );
    const parentMatches = entry.label.toLowerCase().includes(query);

    if (parentMatches) return [entry];
    if (matchingChildren.length > 0) {
      return [{ ...entry, children: matchingChildren }];
    }
    return [];
  });
}

function getNotificationHubPage(notification: SystemNotification): string | null {
  const link = String(getNotificationLink(notification) || '').toLowerCase();
  try {
    const parsed = new URL(link, window.location.origin);
    const linkedTab = parsed.searchParams.get('tab');
    if (linkedTab && ADMIN_HUB_ROUTABLE_TAB_IDS.has(linkedTab)) return linkedTab;
  } catch {
    /* Fall through to legacy-link and category mapping. */
  }

  if (/inventory|stock|product/.test(link)) return 'inventory';
  if (/live[-_/ ]?tracking|tracker|jobs?|orders?/.test(link)) return 'live_tracking';
  if (/appointments?|bookings?|scheduling|availability|closure|waiver/.test(link)) return 'scheduling';
  if (/permissions?|roles?/.test(link)) return 'roles';
  if (/activity|audit|logs?/.test(link)) return 'logs';
  if (/system[-_/ ]?management|turnover|decommission|backup/.test(link)) return 'system_management';
  if (/users?|accounts?|staff/.test(link)) return 'users';
  if (/billing|payments?|revenue|refund/.test(link)) return 'dashboard';

  const category = getNotificationCategory(notification);
  if (category === 'inventory') return 'inventory';
  if (category === 'appointments') return 'scheduling';
  if (category === 'live_tracking') return 'live_tracking';
  if (category === 'payments') return 'dashboard';
  if (category === 'security') return 'logs';
  return null;
}

function flattenNavPages(tree: NavEntry[]): Array<{ id: string; label: string; icon: LucideIcon }> {
  const pages: Array<{ id: string; label: string; icon: LucideIcon }> = [];

  for (const entry of tree) {
    if (entry.type === 'leaf') {
      pages.push({ id: entry.id, label: entry.label, icon: entry.icon });
      continue;
    }
    for (const child of entry.children) {
      pages.push({
        id: child.id,
        label: child.label,
        icon: PAGE_ICONS[child.id] || entry.icon,
      });
    }
  }

  return pages;
}

function AdminHubPanelInner({
  currentUser, onClose,
  inventory = [], suppliers = [], services = [], bookings = [], payments = [], pendingPaymentsSummary = null,
  activityLogs: parentActivityLogs = [], settings, setSettings,
  onLoadData, onAddSupplier, onEditSupplier, onOrderSupplier,
  onSaveSettings,
  fullMode = false,
  syncUserDirectoryFromParent = false,
  directoryUsers,
  directoryBulkLoaded = false,
  notificationFeed,
  notificationUnreadCount,
  onRefreshNotificationFeed,
  onSetNotificationRead,
  onMarkAllNotificationsRead,
}: Props) {
  const location = useLocation();
  const currentRole = getSafeUserRole(currentUser?.role);
  const isQualityChecker = currentRole === 'staff_quality_checker';
  const hasSystemManagementAccess = canOpenSystemManagement(currentRole);

  const activePage = resolveAdminHubPage(location.search, isQualityChecker, hasSystemManagementAccess);
  const [visitedPages, setVisitedPages] = useState<Set<string>>(() => new Set([activePage]));
  const [systemManagementBusy, setSystemManagementBusy] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(isAdminHubNarrowViewport);
  const [sidebarCollapsedPreference, setSidebarCollapsedPreference] = useState(
    readAdminHubSidebarPreference,
  );
  const collapsed = isNarrowViewport || sidebarCollapsedPreference;
  const [users, setUsers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const [hubTheme, setHubTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem(ADMINHUB_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  });
  const [notifications, setNotifications] = useState<SystemNotification[]>(
    () => Array.isArray(notificationFeed) ? notificationFeed : [],
  );

  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const narrowViewport = window.matchMedia(ADMINHUB_NARROW_VIEWPORT_QUERY);
    const syncNarrowViewport = (event?: MediaQueryListEvent) => {
      setIsNarrowViewport(event?.matches ?? narrowViewport.matches);
    };

    syncNarrowViewport();
    narrowViewport.addEventListener('change', syncNarrowViewport);
    return () => narrowViewport.removeEventListener('change', syncNarrowViewport);
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isNarrowViewport) return;
    setSidebarCollapsedPreference((current) => {
      const next = !current;
      writeAdminHubSidebarPreference(next);
      return next;
    });
  }, [isNarrowViewport]);

  /** Auth context often replaces `user` with a new object reference; depending on it here caused endless refetch + loading skeletons. */
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const stableUserId = String(currentUser?._id || currentUser?.id || '');
  const activityLogsLoadedRef = useRef(false);

  useEffect(() => {
    if (!Array.isArray(parentActivityLogs)) return;
    setActivityLogs(parentActivityLogs);
    if (parentActivityLogs.length > 0) {
      activityLogsLoadedRef.current = true;
    }
  }, [parentActivityLogs]);

  const rawProfileName = currentUser?.name?.trim() ?? '';
  /** Avoid showing the generic login "admin" — use proper role title in the header */
  const sidebarDisplayName =
    rawProfileName.toLowerCase() === 'admin' ? 'Administrator' : rawProfileName || 'Signed in';
  const applyCurrentUserFallback = useCallback(() => {
    const cu = currentUserRef.current;
    if (!cu) return;
    setUsers([{
      ...cu,
      id: cu._id || cu.id,
      role: getSafeUserRole(cu.role),
      status: cu.status || 'active',
    }]);
  }, []);

  const fetchUsers = useCallback(async (options?: { showBlockingLoader?: boolean }) => {
    const showBlockingLoader = options?.showBlockingLoader ?? true;
    if (showBlockingLoader) {
      setIsUsersLoading(true);
    }
    try {
      if (isQualityChecker) {
        const cu = currentUserRef.current;
        setUsers(
          cu
            ? [{
                ...cu,
                id: cu._id || cu.id,
                role: currentRole,
              }]
            : [],
        );
        return;
      }

      const userRes = await UserService.getAllUsers({ suppressErrorToast: true });
      if (userRes?.success && Array.isArray(userRes.data)) {
        setUsers(userRes.data);
      } else {
        applyCurrentUserFallback();
      }
    } catch (e) {
      console.error('[AdminHub] users fetch error:', e);
      applyCurrentUserFallback();
    } finally {
      setIsUsersLoading(false);
    }
  }, [applyCurrentUserFallback, currentRole, isQualityChecker, stableUserId]);

  const refreshUsers = useCallback(async () => {
    if (syncUserDirectoryFromParent && onLoadData) {
      await onLoadData();
      await fetchUsers({ showBlockingLoader: false });
      return;
    }
    await fetchUsers();
  }, [syncUserDirectoryFromParent, onLoadData, fetchUsers]);

  const fetchActivityLogs = useCallback(async () => {
    if (isQualityChecker) {
      setActivityLogs([]);
      setIsLogsLoading(false);
      return;
    }

    setIsLogsLoading(true);
    try {
      const logRes = await ActivityService.getActivityLogs({ limit: 200 });
      if (logRes?.success) setActivityLogs(logRes.data || []);
    } catch (e) {
      console.error('[AdminHub] activity logs fetch error:', e);
    } finally {
      activityLogsLoadedRef.current = true;
      setIsLogsLoading(false);
    }
  }, [isQualityChecker]);

  /** Full-page skeleton only on first sync with no data yet — not on every background refetch */
  const blockingHubLoad =
    isUsersLoading &&
    !isQualityChecker &&
    users.length === 0;

  useEffect(() => {
    if (isQualityChecker) {
      fetchUsers();
      return;
    }
    fetchUsers();
  }, [fetchUsers, isQualityChecker]);

  useEffect(() => {
    if (!fullMode || !syncUserDirectoryFromParent || isQualityChecker) return;
    const nextUsers = Array.isArray(directoryUsers) ? directoryUsers : [];
    if (nextUsers.length > 0) {
      setUsers(nextUsers);
      setIsUsersLoading(false);
      return;
    }
    if (directoryBulkLoaded && users.length === 0) {
      fetchUsers({ showBlockingLoader: false });
    }
  }, [
    directoryBulkLoaded,
    directoryUsers,
    fetchUsers,
    fullMode,
    isQualityChecker,
    syncUserDirectoryFromParent,
    users.length,
  ]);

  useEffect(() => {
    if (activePage !== 'logs') return;
    if (activityLogsLoadedRef.current) return;
    fetchActivityLogs();
  }, [activePage, fetchActivityLogs]);

  useEffect(() => {
    setVisitedPages((current) => {
      if (current.has(activePage)) return current;
      const next = new Set(current);
      next.add(activePage);
      return next;
    });
  }, [activePage]);

  const navigateToHubPage = useCallback((
    tabId: string,
    clearNotificationContext = false,
    replace = false,
  ) => {
    const nextLocation = createAdminHubLocation({
      pathname: location.pathname,
      search: location.search,
      tabId,
      clearNotificationContext,
    });
    if (
      nextLocation.pathname === location.pathname
      && nextLocation.search === location.search
      && !location.hash
    ) {
      return;
    }
    navigate(nextLocation, { replace });
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    const requestedTab = new URLSearchParams(location.search).get('tab');
    const qualityCheckerRouteMismatch = isQualityChecker && requestedTab !== activePage;
    if (!location.hash && !qualityCheckerRouteMismatch) return;

    navigateToHubPage(activePage, false, true);
  }, [activePage, isQualityChecker, location.hash, location.search, navigateToHubPage]);

  const selectNavPage = useCallback(
    (requestedId: string) => {
      if (systemManagementBusy && requestedId !== 'system_management') return;
      const id =
        isQualityChecker && requestedId !== 'profile' ? 'live_tracking' : requestedId;
      navigateToHubPage(id, true);
    },
    [isQualityChecker, navigateToHubPage, systemManagementBusy],
  );

  useEffect(() => {
    if (!systemManagementBusy || activePage === 'system_management') return;
    navigateToHubPage('system_management', true, true);
  }, [activePage, navigateToHubPage, systemManagementBusy]);

  const navTree = useMemo(() => buildNavTree(currentRole), [currentRole]);

  const sidebarW = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  const { isDraggingSchedule } = useCalendarScheduleDnD();
  const sidebarWEffective = sidebarW;

  const toggleHubTheme = useCallback(() => {
    setHubTheme((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ADMINHUB_THEME_STORAGE_KEY, next);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousTheme = document.body.dataset.adminhubTheme;
    document.body.dataset.adminhubTheme = hubTheme;

    return () => {
      if (previousTheme) {
        document.body.dataset.adminhubTheme = previousTheme;
      } else {
        delete document.body.dataset.adminhubTheme;
      }
    };
  }, [hubTheme]);

  useEffect(() => {
    if (Array.isArray(notificationFeed)) setNotifications(notificationFeed);
  }, [notificationFeed]);

  const refreshNotifications = useCallback(async () => {
    if (onRefreshNotificationFeed) {
      await onRefreshNotificationFeed();
      return;
    }

    const response = await NotificationService.getNotifications({ limit: 50 });
    if (response.success && Array.isArray(response.data)) {
      setNotifications(response.data);
    }
  }, [onRefreshNotificationFeed]);

  useEffect(() => {
    void refreshNotifications();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshNotifications();
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [refreshNotifications]);

  const handleSetNotificationRead = useCallback(async (id: string, isRead: boolean) => {
    const result = onSetNotificationRead
      ? await onSetNotificationRead(id, isRead)
      : await NotificationService.setReadStatus(id, isRead);
    if (result === false || (typeof result === 'object' && result && 'success' in result && !(result as { success?: boolean }).success)) {
      return false;
    }
    setNotifications((current) => current.map((item) => (
      getNotificationId(item) === id
        ? { ...item, isRead, readAt: isRead ? new Date().toISOString() : null }
        : item
    )));
    return true;
  }, [onSetNotificationRead]);

  const handleAdminNotificationClick = useCallback(
    async (notification: SystemNotification) => {
      if (systemManagementBusy) return;
      const id = getNotificationId(notification);
      if (id && !notification.isRead) await handleSetNotificationRead(id, true);

      const link = getNotificationLink(notification);
      const hubPage = getNotificationHubPage(notification);
      if (hubPage) {
        if (link && !/^https?:\/\//i.test(link)) {
          try {
            const parsed = new URL(link.startsWith('/') ? link : `/${link}`, window.location.origin);
            const nextParams = new URLSearchParams(parsed.search);
            const legacyRecordMatch = parsed.pathname.match(
              /^\/admin\/(?:bookings|orders|payments|inventory)\/([^/?#]+)/i,
            );
            if (legacyRecordMatch && !nextParams.has('orderId') && !nextParams.has('paymentId') && !nextParams.has('productId')) {
              const recordId = decodeURIComponent(legacyRecordMatch[1]);
              if (/payments/i.test(parsed.pathname)) nextParams.set('paymentId', recordId);
              else if (/inventory/i.test(parsed.pathname)) nextParams.set('productId', recordId);
              else nextParams.set('orderId', recordId);
            }
            nextParams.set('tab', hubPage);
            navigate({
              pathname: location.pathname,
              search: `?${nextParams.toString()}`,
              hash: '',
            });
            return;
          } catch {
            /* Fall back to opening only the mapped Admin Hub page. */
          }
        }
        selectNavPage(hubPage);
        return;
      }

      if (link) {
        if (/^https?:\/\//i.test(link)) {
          window.location.assign(link);
          return;
        }
        navigate(link.startsWith('/') ? link : `/${link}`);
      }
    },
    [handleSetNotificationRead, location.pathname, navigate, selectNavPage, systemManagementBusy],
  );

  const handleMarkAllNotificationsRead = useCallback(async () => {
    const result = onMarkAllNotificationsRead
      ? await onMarkAllNotificationsRead()
      : await NotificationService.markAllAsRead();
    if (result === false || (typeof result === 'object' && result && 'success' in result && !(result as { success?: boolean }).success)) {
      return false;
    }
    setNotifications((current) => current.map((item) => ({
      ...item,
      isRead: true,
      readAt: item.readAt || new Date().toISOString(),
    })));
    return true;
  }, [onMarkAllNotificationsRead]);

  const prefetchCustomerTracker =
    currentRole === 'office_admin' ||
    currentRole === 'administrator' ||
    currentRole === 'staff_quality_checker';
  const notificationTargetOrderId = useMemo(
    () => new URLSearchParams(location.search).get('orderId') || undefined,
    [location.search],
  );

  const navSearchQuery = navSearch.trim().toLowerCase();

  const openUserProfile = useCallback(() => {
    selectNavPage('profile');
  }, [selectNavPage]);

  const handleSignOut = useCallback(async () => {
    if (systemManagementBusy) return;
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate, systemManagementBusy]);

  const filteredNavTree = useMemo(
    () => filterNavTree(navTree, navSearchQuery),
    [navTree, navSearchQuery],
  );

  const collapsedNavPages = useMemo(() => flattenNavPages(navTree), [navTree]);
  const commandPages = collapsedNavPages;

  const incomingBookings = useMemo(() => (Array.isArray(bookings) ? bookings : []), [bookings]);
  const [dashboardBookings, setDashboardBookings] = useState<any[]>(incomingBookings);
  const dashboardBookingsLoadedRef = useRef(false);

  useEffect(() => {
    if (incomingBookings.length > 0) {
      setDashboardBookings(incomingBookings);
      dashboardBookingsLoadedRef.current = true;
    }
  }, [incomingBookings]);

  useEffect(() => {
    if (activePage !== 'dashboard' || dashboardBookingsLoadedRef.current) return;

    let cancelled = false;
    dashboardBookingsLoadedRef.current = true;

    OrderService.getAllOrders({
      limit: 100,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      suppressErrorToast: true,
    })
      .then((res) => {
        if (!cancelled && res.success && Array.isArray(res.data)) {
          setDashboardBookings(res.data);
        }
      })
      .catch((error) => {
        console.error('[AdminHubPanel] Failed to load dashboard appointments:', error);
        if (!cancelled) setDashboardBookings([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activePage]);

  const safeBookings = dashboardBookings;

  const renderTabPanel = useCallback(
    (id: string, children: React.ReactNode, options?: { forceMount?: boolean }) => {
      const isActive = activePage === id;
      const shouldMount = isActive || visitedPages.has(id) || options?.forceMount;
      if (!shouldMount) return null;

      return (
        <section
          key={id}
          className={`ah-tab-panel ${isActive ? 'is-active' : 'is-hidden'}`}
          aria-hidden={!isActive}
        >
          <Suspense fallback={<div className="ah-page-loading" role="status">Loading workspace…</div>}>
            {children}
          </Suspense>
        </section>
      );
    },
    [activePage, visitedPages],
  );

  return (
    <div
      className={`adminhub-root${hubTheme === 'dark' ? ' adminhub--dark' : ''} ${isDraggingSchedule ? 'ah-schedule-dragging' : ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        width: '100%',
        minHeight: '100dvh',
        '--ah-sidebar-current-width': `${sidebarWEffective}px`,
      } as React.CSSProperties}
    >
      {/* ── Sidebar (premium layout) ── */}
      <aside
        className={`ah-sidebar${collapsed ? ' is-collapsed' : ''}`}
        style={{
          width: sidebarWEffective,
          transition: 'width 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        aria-label="Admin navigation"
      >
        <div className="ah-sidebar-header">
          <div className="ah-sidebar-brand">
            <div className="ah-sidebar-brand-mark" aria-hidden>
              <img src="/images/autospf-logo.png" alt="" />
            </div>
            {!collapsed && <span className="ah-sidebar-brand-name">AutoSPF+</span>}
          </div>

        </div>

        <nav className="ah-sidebar-nav">
          {filteredNavTree.length === 0 && !collapsed ? (
            <p className="ah-sidebar-empty">No matches</p>
          ) : null}

          {collapsed ? (
            <TooltipProvider delayDuration={120}>
              <div className="ah-sidebar-collapsed-nav">
                {collapsedNavPages.map((page) => {
                  const Icon = page.icon;
                  return (
                    <Tooltip key={page.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={`ah-nav-item${activePage === page.id ? ' active' : ''}`}
                          onClick={() => selectNavPage(page.id)}
                          aria-label={page.label}
                        >
                          <Icon size={18} strokeWidth={1.6} className="ah-nav-icon" aria-hidden />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="center" sideOffset={10} className="ah-sidebar-tooltip">
                        {page.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          ) : (
            filteredNavTree.map((entry) => {
              if (entry.type === 'leaf') {
                const isActive = activePage === entry.id;
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`ah-nav-item ah-nav-leaf${isActive ? ' active' : ''}`}
                    onClick={() => selectNavPage(entry.id)}
                  >
                    <Icon size={18} strokeWidth={1.5} className="ah-nav-icon" aria-hidden />
                    <span className="ah-nav-label">{entry.label}</span>
                  </button>
                );
              }

              return (
                <div key={entry.id} className="ah-nav-section">
                  <p className="ah-nav-section-title">
                    {NAV_SECTION_LABELS[entry.id] || entry.label}
                  </p>
                  <div className="ah-nav-section-items">
                    {entry.children.map((child) => {
                      const isActive = activePage === child.id;
                      const ChildIcon = PAGE_ICONS[child.id] || entry.icon;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          className={`ah-nav-item ah-nav-row${isActive ? ' active' : ''}`}
                          onClick={() => selectNavPage(child.id)}
                        >
                          <ChildIcon size={18} strokeWidth={1.7} className="ah-nav-icon" aria-hidden />
                          <span className="ah-nav-label">{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </nav>

        {!fullMode && onClose ? (
          <div className="ah-sidebar-footer">
            <div className="ah-sidebar-secondary">
              <button
                type="button"
                className="ah-nav-item is-utility"
                onClick={() => { if (!systemManagementBusy) onClose(); }}
                disabled={systemManagementBusy}
                title={collapsed ? 'Back' : undefined}
              >
                <ArrowLeft size={18} strokeWidth={1.5} className="ah-nav-icon" aria-hidden />
                {!collapsed && <span className="ah-nav-label">Back</span>}
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      {/* ── Main column: top bar + content ── */}
      <div className="ah-main-column">
        <AdminTopBar
          collapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          navSearch={navSearch}
          onNavSearchChange={setNavSearch}
          commandPages={commandPages}
          onSelectPage={selectNavPage}
          displayName={sidebarDisplayName}
          email={currentUser?.email || ''}
          avatar={currentUser?.avatar}
          onViewProfile={openUserProfile}
          onAccountSettings={openUserProfile}
          onSignOut={handleSignOut}
          notifications={notifications}
          unreadNotificationsCount={notificationUnreadCount}
          onRefreshNotifications={refreshNotifications}
          onNotificationClick={handleAdminNotificationClick}
          onSetNotificationRead={handleSetNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onViewAllNotifications={() => selectNavPage('notifications')}
          theme={hubTheme}
          onToggleTheme={toggleHubTheme}
        />

        <main className="ah-main-surface">
        <div className="ah-tab-shell">
          <div className="ah-tab-stack">
            {renderTabPanel('dashboard', (
              <AdminDashboardPage
                users={users}
                activityLogs={activityLogs}
                bookings={safeBookings}
                services={services}
                inventory={inventory}
                payments={payments}
                pendingPaymentsSummary={pendingPaymentsSummary}
                loading={blockingHubLoad}
                chartsVisible={activePage === 'dashboard'}
                onRefreshOverview={onLoadData}
              />
            ))}
            {renderTabPanel('notifications', (
              <AdminNotificationCenterPage
                onOpenNotification={handleAdminNotificationClick}
                onFeedChanged={refreshNotifications}
              />
            ))}
            {renderTabPanel('scheduling', (
            <AdminAppointmentsPage currentUserRole={currentUser?.role} />
            ))}
            {renderTabPanel('users', (
            <AdminUserManagement
              users={users}
              setUsers={setUsers}
              loading={isUsersLoading && users.length === 0}
              onRefresh={refreshUsers}
              currentUserRole={currentUser?.role}
              currentUserId={currentUser?.id || currentUser?._id}
            />
            ))}
            {renderTabPanel('roles', <AdminRoleManagement users={users} />)}
            {renderTabPanel('logs', <AdminActivityLogs activityLogs={activityLogs} loading={isLogsLoading && activityLogs.length === 0} />)}
            {isServiceCatalogRole(currentUser?.role) && renderTabPanel('pricing', (
            <ServicesPricing services={services} onRefresh={onLoadData || (() => undefined)} />
            ))}
            {renderTabPanel('inventory', <InventoryPanel embedded />)}
            {/* Unlike ordinary Hub pages, System Management is intentionally
                unmounted on navigation so passwords, passphrases, phrases, and
                unexecuted previews cannot survive in a hidden visited tab. */}
            {hasSystemManagementAccess && activePage === 'system_management' && renderTabPanel('system_management', (
              <SystemManagementPage
                currentUser={currentUser}
                users={users}
                inventory={inventory}
                onOperationalDataChanged={onLoadData}
                onExecutionBusyChange={setSystemManagementBusy}
              />
            ))}

            {prefetchCustomerTracker && renderTabPanel('live_tracking', (
              <CustomerTrackerPanel
                embedded
                initialOrderId={notificationTargetOrderId}
                deepLinkActive={activePage === 'live_tracking'}
              />
            ))}

            {renderTabPanel('profile', (
              <AdminUserProfilePage
                currentUser={currentUser}
                onNavigateHome={() => selectNavPage('dashboard')}
                onSignOut={handleSignOut}
              />
            ))}
          </div>
        </div>
        </main>
      </div>

    </div>
  );
}

export default function AdminHubPanel(props: Props) {
  return (
    <CalendarScheduleDnDProvider>
      <AdminHubPanelInner {...props} />
    </CalendarScheduleDnDProvider>
  );
}
