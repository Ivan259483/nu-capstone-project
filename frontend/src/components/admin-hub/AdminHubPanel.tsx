import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './admin-hub.css';
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
import { useNavigate, useSearchParams } from 'react-router-dom';
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
}

const NAV_MAIN_MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Main Menu' },
];

const NAV_OPERATIONS = [
  { id: 'scheduling', label: 'Appointments', icon: Calendar, section: 'Operations' },
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

function AdminHubPanelInner({
  currentUser, onClose,
  inventory = [], suppliers = [], services = [], bookings = [], settings, setSettings,
  onLoadData, onAddSupplier, onEditSupplier, onOrderSupplier,
  onSaveSettings, onExportData, onBackupDB, onClearCache, onResetSystem,
  fullMode = false,
}: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [activePage, setActivePage] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const tab = new URLSearchParams(window.location.search).get('tab');
        if (tab === 'live_tracking') return 'live_tracking';
        if (tab === 'pricing') return 'pricing';
        if (tab === 'scheduling') return 'scheduling';
        if (tab === 'inventory') return 'inventory';
      }
    } catch {
      /* ignore */
    }
    return 'dashboard';
  });
  const [collapsed, setCollapsed] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (getSafeUserRole(currentUser?.role) !== 'staff_quality_checker') return;
    const tab = searchParams.get('tab');
    if (tab === 'live_tracking' || tab === 'pricing') return;
    setActivePage('live_tracking');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'live_tracking');
        return next;
      },
      { replace: true },
    );
  }, [currentUser?.role, currentUser?.id, searchParams, setSearchParams]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [userRes, logRes] = await Promise.all([
        UserService.getAllUsers(),
        ActivityService.getActivityLogs({ limit: 200 }),
      ]);
      if (userRes?.success) setUsers(userRes.data || []);
      if (logRes?.success) setActivityLogs(logRes.data || []);
    } catch (e) { console.error('[AdminHub] fetch error:', e); }
    setLoading(false);
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await NotificationService.getNotifications();
      if (res?.success) setNotifications(res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchData(); fetchNotifications(); }, [fetchData, fetchNotifications]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'live_tracking' || tab === 'pricing' || tab === 'scheduling' || tab === 'inventory') setActivePage(tab);
  }, [searchParams]);

  const selectNavPage = useCallback(
    (id: string) => {
      setActivePage(id);
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (id === 'live_tracking' || id === 'pricing' || id === 'scheduling' || id === 'inventory') next.set('tab', id);
          else next.delete('tab');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Office Admin inherits operational manager duties — surface live customer tracking here
  const navItems = useMemo(() => {
    const role = getSafeUserRole(currentUser?.role);
    if (role === 'administrator') {
      return [...NAV_MAIN_MENU, ...NAV_OPERATIONS, ...NAV_CATALOG, ...NAV_MANAGEMENT];
    }
    if (role === 'office_admin') {
      return [...NAV_MAIN_MENU, ...NAV_OPERATIONS, ...NAV_CATALOG, ...NAV_MANAGEMENT];
    }
    if (role === 'staff_quality_checker') {
      return [...NAV_OPERATIONS];
    }
    return [...NAV_MAIN_MENU, ...NAV_MANAGEMENT];
  }, [currentUser?.role]);

  const sidebarW = collapsed ? 64 : 240;
  const { isDraggingSchedule } = useCalendarScheduleDnD();
  const sidebarWEffective = isDraggingSchedule ? 0 : sidebarW;
  const userRoleLower = (currentUser?.role || '').toLowerCase();
  const prefetchCustomerTracker =
    userRoleLower === 'office_admin' ||
    userRoleLower === 'administrator' ||
    userRoleLower === 'staff_quality_checker';

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

  const mainBgWhite =
    activePage === 'pricing' || activePage === 'scheduling' || isDraggingSchedule ? '#ffffff' : '#f8fafc';

  return (
    <div
      className={`adminhub-root ${isDraggingSchedule ? 'ah-schedule-dragging' : ''}`}
      style={{ position: 'fixed', inset: 0, zIndex: 100 }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="ah-sidebar"
        style={{
          width: sidebarWEffective,
          opacity: isDraggingSchedule ? 0 : 1,
          pointerEvents: isDraggingSchedule ? 'none' : 'auto',
          transition: 'width 0.22s cubic-bezier(0.16,1,0.3,1), opacity 0.18s ease',
          overflow: 'hidden',
          ...(isDraggingSchedule ? { border: 'none', boxShadow: 'none' } : {}),
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', height: 64, padding: '0 12px', borderBottom: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>A</div>
            {!collapsed && <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 15, lineHeight: 1.2, minWidth: 0 }}>Administrator</span>}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {Object.entries(sections).map(([sectionName, items]) => (
            <React.Fragment key={sectionName}>
              {!collapsed && <p style={{ padding: '12px 12px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em', margin: 0 }}>{sectionName}</p>}
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
        style={{
          flex: 1,
          minHeight: '100vh',
          overflow: 'auto',
          transition: 'margin-left 0.22s cubic-bezier(0.16,1,0.3,1), background-color 0.18s ease',
          marginLeft: sidebarWEffective,
          background: mainBgWhite,
        }}
      >
        <div style={{ maxWidth: activePage === 'live_tracking' || activePage === 'scheduling' || activePage === 'inventory' ? 1560 : 1400, margin: '0 auto', padding: '32px 24px' }}>
          {activePage === 'dashboard' && (
            <AdminDashboardPage users={users} activityLogs={activityLogs} loading={loading} onNavigate={selectNavPage} />
          )}
          {activePage === 'scheduling' && (
            <AdminAppointmentsPage onNavigate={selectNavPage} currentUserRole={currentUser?.role} />
          )}
          {activePage === 'users' && (
            <AdminUserManagement
              users={users}
              setUsers={setUsers}
              loading={loading}
              onRefresh={fetchData}
              currentUserRole={currentUser?.role}
              currentUserId={currentUser?.id || currentUser?._id}
            />
          )}
          {activePage === 'roles' && <AdminRoleManagement users={users} />}
          {activePage === 'logs' && <AdminActivityLogs activityLogs={activityLogs} loading={loading} />}
          {activePage === 'pricing' && isServiceCatalogRole(currentUser?.role) && (
            <ServicesPricing services={services} onRefresh={onLoadData || (() => undefined)} />
          )}
          {activePage === 'inventory' && <InventoryPanel embedded />}

          {prefetchCustomerTracker && (
            <div style={{ display: activePage === 'live_tracking' ? 'block' : 'none' }}>
              <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0f172a', margin: 0 }}>Customer Tracker</h1>
                <p style={{ fontSize: 14, color: '#64748b', margin: '8px 0 0' }}>Live job status and customer tracking updates across all customers</p>
              </div>
              <CustomerTrackerPanel embedded />
            </div>
          )}
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
