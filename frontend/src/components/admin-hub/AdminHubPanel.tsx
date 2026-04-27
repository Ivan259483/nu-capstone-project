import React, { useState, useEffect, useCallback } from 'react';
import './admin-hub.css';
import { UserService } from '@/lib/user-service';
import { ActivityService } from '@/lib/activity-service-api';
import { NotificationService } from '@/lib/notification-service';
import { LayoutDashboard, Users, ShieldCheck, ScrollText, ChevronLeft, ChevronRight, ArrowLeft, Bell, X, LogOut } from 'lucide-react';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminUserManagement from './pages/AdminUserManagement';
import AdminActivityLogs from './pages/AdminActivityLogs';
import AdminRoleManagement from './pages/AdminRoleManagement';


import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

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

const NAV_ITEMS_CORE = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Main Menu' },
  { id: 'users', label: 'User Management', icon: Users, section: 'Main Menu' },
  { id: 'roles', label: 'Role Management', icon: ShieldCheck, section: 'Main Menu' },
  { id: 'logs', label: 'Activity Logs', icon: ScrollText, section: 'Main Menu' },
];

// Operations modules removed for now — kept in legacy AdminDashboard for other roles

export default function AdminHubPanel({
  currentUser, onClose,
  inventory = [], suppliers = [], services = [], bookings = [], settings, setSettings,
  onLoadData, onAddSupplier, onEditSupplier, onOrderSupplier,
  onSaveSettings, onExportData, onBackupDB, onClearCache, onResetSystem,
  fullMode = false,
}: Props) {
  const [activePage, setActivePage] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const { logout } = useAuth();
  const navigate = useNavigate();

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

  // Build nav items
  const navItems = NAV_ITEMS_CORE;

  const sidebarW = collapsed ? 64 : 240;
  const initials = currentUser?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'OA';

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

  return (
    <div className="adminhub-root" style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      {/* ── Sidebar ── */}
      <aside className="ah-sidebar" style={{ width: sidebarW }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', height: 64, padding: '0 12px', borderBottom: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>A</div>
            {!collapsed && <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 16, whiteSpace: 'nowrap' }}>AdminHub</span>}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {Object.entries(sections).map(([sectionName, items]) => (
            <React.Fragment key={sectionName}>
              {!collapsed && <p style={{ padding: '12px 12px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{sectionName}</p>}
              {items.map(item => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                const handleClick = () => {
                  if ((item as any).route) { navigate((item as any).route); return; }
                  setActivePage(item.id);
                };
                return (
                  <button key={item.id} className={`ah-nav-item ${isActive ? 'active' : ''}`} onClick={handleClick} title={collapsed ? item.label : undefined} style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}>
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
          <button className="ah-nav-item" onClick={() => setShowNotifPanel(p => !p)} style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Bell size={18} />
              {notifications.length > 0 && <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, background: '#ef4444', borderRadius: '50%' }} />}
            </div>
            {!collapsed && <span style={{ fontSize: 14 }}>Notifications</span>}
          </button>

          {/* User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderRadius: 8, background: '#f8fafc', border: '1px solid #f1f5f9', overflow: 'hidden', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{initials}</div>
            {!collapsed && (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{currentUser?.name || 'Office Admin'}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser?.email || 'admin@autospf.com'}</p>
                </div>
              </>
            )}
          </div>

          {/* Logout button (full mode) */}
          {fullMode && (
            <button className="ah-nav-item" onClick={handleLogout} style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : { color: '#dc2626' }}>
              <LogOut size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ fontSize: 14 }}>Log Out</span>}
            </button>
          )}

          {/* Back button (overlay mode only) */}
          {!fullMode && onClose && (
            <button className="ah-nav-item" onClick={onClose} style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}>
              <ArrowLeft size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ fontSize: 14 }}>Back</span>}
            </button>
          )}

          {/* Collapse */}
          <button onClick={() => setCollapsed(c => !c)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 12px', fontSize: 12, color: '#64748b', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s' }}>
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, minHeight: '100vh', overflow: 'auto', transition: 'margin-left 0.3s cubic-bezier(0.16,1,0.3,1)', marginLeft: sidebarW, background: '#f8fafc' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
          {activePage === 'dashboard' && <AdminDashboardPage users={users} activityLogs={activityLogs} loading={loading} onNavigate={setActivePage} />}
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

          {/* Operations modules removed for now */}


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
