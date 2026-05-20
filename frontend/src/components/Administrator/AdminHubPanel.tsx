import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './administrator.css';
import { UserService } from '@/lib/user-service';
import { ActivityService } from '@/lib/activity-service-api';
import { NotificationService } from '@/lib/notification-service';
import { LayoutDashboard, Users, ShieldCheck, ScrollText, ChevronLeft, ChevronRight, ArrowLeft, Bell, X, LogOut, Radio, PhilippinePeso, Calendar, Package } from 'lucide-react';
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
import { getRoleLabel, getSafeUserRole, isServiceCatalogRole } from '@/lib/roles';
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

const NAV_MAIN_MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Main Menu' },
];

const NAV_OPERATIONS = [
  { id: 'scheduling', label: 'Appointments', icon: Calendar, section: 'Operations' },
  { id: 'live_tracking', label: 'Live Tracking', icon: Radio, section: 'Operations' },
];

const NAV_QC_OPERATIONS = [
  { id: 'live_tracking', label: 'Live Tracking', icon: Radio, section: 'Operations' },
];

const NAV_CATALOG = [
  { id: 'pricing', label: 'Services', icon: PhilippinePeso, section: 'Catalog' },
  { id: 'inventory', label: 'Inventory', icon: Package, section: 'Catalog' },
];

const NAV_MANAGEMENT = [
  { id: 'users', label: 'User Management', icon: Users, section: 'Management' },
  { id: 'roles', label: 'Role Management', icon: ShieldCheck, section: 'Management' },
  { id: 'logs', label: 'Activity Logs', icon: ScrollText, section: 'Management' },
];

const ROUTABLE_TAB_IDS = new Set(['live_tracking', 'pricing', 'scheduling', 'inventory']);

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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

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
  const sidebarRoleLabel = getRoleLabel(currentRole);
  const showSidebarRoleRow = Boolean(sidebarRoleLabel && sidebarRoleLabel !== sidebarDisplayName);

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

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await NotificationService.getNotifications();
      if (res?.success) setNotifications(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

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
      const id = isQualityChecker ? 'live_tracking' : requestedId;
      if (id !== activePage) {
        setActivePage(id);
      }
      syncTabSearchParam(id);
    },
    [activePage, isQualityChecker, syncTabSearchParam],
  );

  // Office Admin inherits operational manager duties — surface live customer tracking here
  const navItems = useMemo(() => {
    if (currentRole === 'administrator') {
      return [...NAV_MAIN_MENU, ...NAV_OPERATIONS, ...NAV_CATALOG, ...NAV_MANAGEMENT];
    }
    if (currentRole === 'office_admin') {
      return [...NAV_MAIN_MENU, ...NAV_OPERATIONS, ...NAV_CATALOG, ...NAV_MANAGEMENT];
    }
    if (currentRole === 'staff_quality_checker') {
      return NAV_QC_OPERATIONS;
    }
    return [...NAV_MAIN_MENU, ...NAV_MANAGEMENT];
  }, [currentRole]);

  const sidebarW = collapsed ? 64 : 240;
  const { isDraggingSchedule } = useCalendarScheduleDnD();
  const sidebarWEffective = sidebarW;
  const prefetchCustomerTracker =
    currentRole === 'office_admin' ||
    currentRole === 'administrator' ||
    currentRole === 'staff_quality_checker';

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Group nav items by section
  const sections = navItems.reduce<Record<string, typeof navItems>>((acc, item) => {
    const sec = item.section || 'Main Menu';
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(item);
    return acc;
  }, {});

  const safeBookings = Array.isArray(bookings) ? bookings : [];

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
      className={`adminhub-root ${isDraggingSchedule ? 'ah-schedule-dragging' : ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        width: '100%',
        minHeight: '100dvh',
      }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="ah-sidebar"
        style={{
          width: sidebarWEffective,
          transition: 'width 0.22s cubic-bezier(0.16,1,0.3,1)',
          overflow: 'hidden',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', height: 64, padding: '0 12px', borderBottom: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
              {(sidebarDisplayName || currentUser?.email || '?').charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sidebarDisplayName}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentUser?.email || ''}
                </div>
                {showSidebarRoleRow ? (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginTop: 2 }}>{sidebarRoleLabel}</div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {Object.entries(sections).map(([sectionName, items]) => (
            <React.Fragment key={sectionName}>
              {!collapsed && <p style={{ padding: '12px 12px 8px', fontSize: 11, fontWeight: 600, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>{sectionName}</p>}
              {items.map(item => {
                const Icon = item.icon;
                const isActive = activePage === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`ah-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => selectNavPage(item.id)}
                    title={collapsed ? item.label : undefined}
                    style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
                  >
                    <Icon size={18} style={{ flexShrink: 0 }} />
                    {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ borderTop: '1px solid #f1f5f9', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Notifications */}
          <button type="button" className="ah-nav-item" onClick={() => setShowNotifPanel(p => !p)} style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Bell size={18} />
              {notifications.length > 0 && <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, background: '#ef4444', borderRadius: '50%' }} />}
            </div>
            {!collapsed && <span style={{ fontSize: 14 }}>Notifications</span>}
          </button>

          {/* Logout button (full mode) */}
          {fullMode && (
            <button type="button" className="ah-nav-item" onClick={handleLogout} style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : { color: '#dc2626' }}>
              <LogOut size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ fontSize: 14 }}>Log Out</span>}
            </button>
          )}

          {/* Back button (overlay mode only) */}
          {!fullMode && onClose && (
            <button type="button" className="ah-nav-item" onClick={onClose} style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}>
              <ArrowLeft size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ fontSize: 14 }}>Back</span>}
            </button>
          )}

          {/* Collapse */}
          <button type="button" onClick={() => setCollapsed(c => !c)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 12px', fontSize: 12, color: '#64748b', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main
        className="ah-main-surface"
        style={{
          overflow: 'auto',
          transition: 'margin-left 0.22s cubic-bezier(0.16,1,0.3,1)',
          marginLeft: sidebarWEffective,
          background: '#f8fafc',
        }}
      >
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
            <AdminDashboardPage users={users} activityLogs={activityLogs} loading={blockingHubLoad} onNavigate={selectNavPage} />
            ))}
            {renderTabPanel('scheduling', (
            <AdminAppointmentsPage onNavigate={selectNavPage} currentUserRole={currentUser?.role} />
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
          </div>
        </div>
      </main>

      {/* ── Notification Panel ── */}
      {showNotifPanel && (
        <div className="ah-fade-in" style={{ position: 'fixed', top: 0, right: 0, width: 380, height: '100vh', background: '#fff', borderLeft: '1px solid #e2e8f0', boxShadow: '-4px 0 24px rgba(0,0,0,.08)', zIndex: 40, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', margin: 0 }}>Notifications</h3>
            <button onClick={() => setShowNotifPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
            {notifications.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 14, padding: 40 }}>No notifications</p>
            ) : notifications.slice(0, 20).map((n: any, i: number) => (
              <div key={n._id || i} style={{ padding: '12px 8px', borderBottom: '1px solid #f8fafc', borderRadius: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', margin: 0 }}>{n.title || 'Notification'}</p>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>{n.message || ''}</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0' }}>{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}
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
