import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  type LucideIcon,
} from 'lucide-react';
import AdminTopBar from './AdminTopBar';
import { NotificationService, type SystemNotification } from '@/lib/notification-service';
import AdminUserProfilePage from './pages/AdminUserProfilePage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminUserManagement from './pages/AdminUserManagement';
import AdminActivityLogs from './pages/AdminActivityLogs';
import AdminRoleManagement from './pages/AdminRoleManagement';
import AdminAppointmentsPage from './pages/AdminAppointmentsPage';
import CustomerTrackerPanel from '@/components/ops-manager/CustomerTrackerPanel';
import { ServicesPricing } from '@/components/admin/ServicesPricing';
import InventoryPanel from '@/components/inventory/InventoryPanel';

import { useAuth } from '@/contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSafeUserRole, isServiceCatalogRole } from '@/lib/roles';
import { CalendarScheduleDnDProvider, useCalendarScheduleDnD } from '@/components/sales/calendar/CalendarScheduleDnDContext';

interface Props {
  currentUser?: any;
  onClose?: () => void;
  // Extended props for full admin mode
  inventory?: any[];
  suppliers?: any[];
  services?: any[];
  bookings?: any[];
  settings?: any;
  setSettings?: (s: any) => void;
  onLoadData?: () => void;
  onAddSupplier?: () => void;
  onEditSupplier?: (s: any) => void;
  onOrderSupplier?: (s: any) => void;
  onSaveSettings?: (partial: any) => void;
  onExportData?: () => void;
  onBackupDB?: () => void;
  onClearCache?: () => void;
  onResetSystem?: () => void;
  fullMode?: boolean; // When true, this is the ONLY UI (no old dashboard behind it)
  /** Parent AdminDashboard also loads GET /users; use it as a background refresh source after the Hub's immediate directory load. */
  syncUserDirectoryFromParent?: boolean;
  directoryUsers?: any[];
  directoryBulkLoaded?: boolean;
}

const ROUTABLE_TAB_IDS = new Set(['live_tracking', 'pricing', 'scheduling', 'inventory']);

const SIDEBAR_WIDTH_EXPANDED = 260;
const SIDEBAR_WIDTH_COLLAPSED = 64;
const SIDEBAR_MAIN_OFFSET = 0;
const ADMINHUB_THEME_STORAGE_KEY = 'adminhub_theme';

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
};

const PAGE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  scheduling: Calendar,
  live_tracking: Radio,
  pricing: PhilippinePeso,
  inventory: Package,
  users: Users,
  roles: ShieldCheck,
  logs: ScrollText,
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
    children: [{ id: 'dashboard', label: 'Dashboard' }],
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
  inventory = [], suppliers = [], services = [], bookings = [], settings, setSettings,
  onLoadData, onAddSupplier, onEditSupplier, onOrderSupplier,
  onSaveSettings, onExportData, onBackupDB, onClearCache, onResetSystem,
  fullMode = false,
  syncUserDirectoryFromParent = false,
  directoryUsers,
  directoryBulkLoaded = false,
}: Props) {
  const location = useLocation();
  const currentRole = getSafeUserRole(currentUser?.role);
  const isQualityChecker = currentRole === 'staff_quality_checker';

  const [activePage, setActivePage] = useState(() => {
    if (getSafeUserRole(currentUser?.role) === 'staff_quality_checker') return 'live_tracking';
    try {
      if (typeof window !== 'undefined') {
        const tab = new URLSearchParams(location.search).get('tab');
        if (tab && ROUTABLE_TAB_IDS.has(tab)) return tab;
      }
    } catch {
      /* ignore */
    }
    return 'dashboard';
  });
  const [visitedPages, setVisitedPages] = useState<Set<string>>(() => new Set([activePage]));
  const [collapsed, setCollapsed] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const [hubTheme, setHubTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem(ADMINHUB_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  });
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);

  const { logout } = useAuth();
  const navigate = useNavigate();

  /** Auth context often replaces `user` with a new object reference; depending on it here caused endless refetch + loading skeletons. */
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const stableUserId = String(currentUser?._id || currentUser?.id || '');
  const activityLogsLoadedRef = useRef(false);

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

  const syncTabSearchParam = useCallback((tabId: string) => {
    if (typeof window === 'undefined') return;

    const nextParams = new URLSearchParams(window.location.search);
    if (ROUTABLE_TAB_IDS.has(tabId)) {
      nextParams.set('tab', tabId);
    } else {
      nextParams.delete('tab');
    }

    const currentQuery = window.location.search.startsWith('?')
      ? window.location.search.slice(1)
      : window.location.search;
    const nextQuery = nextParams.toString();
    if (nextQuery === currentQuery) return;

    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, []);

  useEffect(() => {
    if (isQualityChecker) {
      if (activePage !== 'live_tracking') setActivePage('live_tracking');
      syncTabSearchParam('live_tracking');
      return;
    }

    const tab = new URLSearchParams(location.search).get('tab');
    if (tab && ROUTABLE_TAB_IDS.has(tab) && tab !== activePage) {
      setActivePage(tab);
    }
  }, [activePage, isQualityChecker, location.search, syncTabSearchParam]);

  const selectNavPage = useCallback(
    (requestedId: string) => {
      const id =
        isQualityChecker && requestedId !== 'profile' ? 'live_tracking' : requestedId;
      if (id !== activePage) {
        setActivePage(id);
      }
      syncTabSearchParam(id);
    },
    [activePage, isQualityChecker, syncTabSearchParam],
  );

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
    let cancelled = false;
    NotificationService.getNotifications()
      .then((res) => {
        if (!cancelled && res.success && Array.isArray(res.data)) {
          setNotifications(res.data);
        }
      })
      .catch((error) => {
        console.warn('[AdminHub] notifications fetch error:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdminNotificationClick = useCallback(
    async (notification: SystemNotification) => {
      const id = notification.id || notification._id;
      if (id) {
        const res = await NotificationService.markAsRead(id);
        if (res?.success) {
          setNotifications((current) =>
            current.map((item) =>
              (item.id || item._id) === id ? { ...item, isRead: true } : item,
            ),
          );
        }
      }
      if (notification.link) {
        const path = notification.link.startsWith('/')
          ? notification.link
          : `/${notification.link}`;
        navigate(path);
      }
    },
    [navigate],
  );

  const handleMarkAllNotificationsRead = useCallback(async () => {
    const res = await NotificationService.markAllAsRead();
    if (res?.success) {
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    }
  }, []);

  const prefetchCustomerTracker =
    currentRole === 'office_admin' ||
    currentRole === 'administrator' ||
    currentRole === 'staff_quality_checker';

  const navSearchQuery = navSearch.trim().toLowerCase();

  const openUserProfile = useCallback(() => {
    setActivePage('profile');
    setVisitedPages((current) => {
      if (current.has('profile')) return current;
      const next = new Set(current);
      next.add('profile');
      return next;
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

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
          {children}
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
      }}
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
            collapsedNavPages.map((page) => {
              const Icon = page.icon;
              return (
                <button
                  key={page.id}
                  type="button"
                  className={`ah-nav-item${activePage === page.id ? ' active' : ''}`}
                  onClick={() => selectNavPage(page.id)}
                  title={page.label}
                >
                  <Icon size={18} strokeWidth={1.5} className="ah-nav-icon" aria-hidden />
                </button>
              );
            })
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
                onClick={onClose}
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
      <div
        className="ah-main-column"
        style={{
          transition: 'margin-left 0.22s cubic-bezier(0.16,1,0.3,1)',
          marginLeft: sidebarWEffective + SIDEBAR_MAIN_OFFSET,
        }}
      >
        <AdminTopBar
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((c) => !c)}
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
          onNotificationClick={handleAdminNotificationClick}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          theme={hubTheme}
          onToggleTheme={toggleHubTheme}
        />

        <main className="ah-main-surface">
        <div
          className="ah-tab-shell"
          style={{
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            margin: 0,
            padding: '28px clamp(16px, 2.5vw, 32px)',
          }}
        >
          <div className="ah-tab-stack">
            {renderTabPanel('dashboard', (
              <AdminDashboardPage
                users={users}
                activityLogs={activityLogs}
                bookings={safeBookings}
                loading={blockingHubLoad}
                chartsVisible={activePage === 'dashboard'}
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

            {prefetchCustomerTracker && renderTabPanel('live_tracking', (
              <CustomerTrackerPanel embedded />
            ), { forceMount: true })}

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
