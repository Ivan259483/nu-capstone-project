import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Users, UserCog, Activity, ShieldCheck,
  FileText, Bell, LogOut, ChevronLeft, ChevronRight,
  Settings, HelpCircle, X, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { UserService } from '@/lib/user-service';
import { ActivityService } from '@/lib/activity-service-api';
import { NotificationService, SystemNotification } from '@/lib/notification-service';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { USER_ROLE_OPTIONS } from '@/lib/roles';

import HRDashboardOverview from '@/components/hr/HRDashboardOverview';
import HRStaffList from '@/components/hr/HRStaffList';
import HRRoleAssignment from '@/components/hr/HRRoleAssignment';
import HRStaffActivity from '@/components/hr/HRStaffActivity';
import HRRoleAccessControl from '@/components/hr/HRRoleAccessControl';

interface UserManagementPanelProps {
  theme: string;
  users: any[];
  loadData: () => Promise<void> | void;
  currentUserRole?: string;
  currentUserId?: string;
  onBack?: () => void;
}

type HRTab = 'overview' | 'staff' | 'roles' | 'access' | 'activity';

const NAV_ITEMS = [
  { id: 'overview' as HRTab, label: 'HR Dashboard', icon: LayoutDashboard, group: 'workforce' },
  { id: 'staff' as HRTab, label: 'User Management', icon: Users, group: 'workforce' },
  { id: 'roles' as HRTab, label: 'Role Assignment', icon: UserCog, group: 'workforce' },
  { id: 'activity' as HRTab, label: 'Staff Activity', icon: Activity, group: 'workforce' },
  { id: 'access' as HRTab, label: 'Role & Access', icon: ShieldCheck, group: 'workforce' },
];

const BOTTOM_ITEMS = [
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'notifications', label: 'Notifications', icon: Bell, badge: 5 },
];

const UTILITY_ITEMS = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'help', label: 'Help & Support', icon: HelpCircle },
];

export const UserManagementPanel: React.FC<UserManagementPanelProps> = ({
  users, loadData, currentUserRole, currentUserId, onBack,
}) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<HRTab>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Data State
  const [localUsers, setLocalUsers] = useState<any[]>(users);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('service_staff');
  const [userStatus, setUserStatus] = useState('active');

  // Polling
  const pollUsers = useCallback(async () => {
    try {
      const result = await UserService.getAllUsers();
      if (result?.success && Array.isArray(result.data)) setLocalUsers(result.data);
    } catch { /* silent */ }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const result = await ActivityService.getActivityLogs();
      if (result?.success && Array.isArray(result.data)) setActivityLogs(result.data);
    } catch { /* silent */ }
  }, []);

  // HR-relevant notification types — exclude booking/service/payment/inventory
  const HR_NOTIFICATION_TYPES = ['user_created', 'user_updated', 'user_restored', 'role_change', 'user_registered', 'staff_registered', 'account_update', 'user_archived', 'user_activated', 'user_suspended'];
  const isHRRole = currentUserRole?.toLowerCase() === 'hr';

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await NotificationService.getNotifications();
      if (res?.success && Array.isArray(res.data)) {
        console.log('[HR Notif] isHRRole:', isHRRole, 'currentUserRole:', currentUserRole, 'total:', res.data.length);
        if (isHRRole) {
          // STRICT whitelist: only show staff/user-related notifications for HR
          const filtered = res.data.filter((n: any) => {
            const type = (n.type || '').toLowerCase();
            const title = (n.title || '').toLowerCase();
            const message = (n.message || '').toLowerCase();
            // Only include if it matches HR-relevant keywords
            const isHRRelevant =
              HR_NOTIFICATION_TYPES.some(t => type.includes(t)) ||
              /staff|user|role|account|registr|personnel/i.test(title) ||
              /staff|user|role|account|registr|personnel/i.test(type);
            return isHRRelevant;
          });
          console.log('[HR Notif] Filtered to', filtered.length, 'HR-relevant notifications');
          setNotifications(filtered);
        } else {
          setNotifications(res.data);
        }
      }
    } catch { /* silent */ }
  }, [isHRRole, currentUserRole]);

  useEffect(() => {
    pollUsers();
    fetchActivity();
    fetchNotifications();
    const id = setInterval(() => { pollUsers(); fetchActivity(); fetchNotifications(); }, 15_000);
    return () => clearInterval(id);
  }, [pollUsers, fetchActivity, fetchNotifications]);

  // Close notif panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setLocalUsers(users); }, [users]);

  // Handlers
  const handleEditUser = (u: any) => {
    if (u && !u._isNew) {
      // Editing an existing user
      setIsEditingUser(true);
      setEditingUserId(u.id || u._id);
      setUserName(u.name || '');
      setUserEmail(u.email || '');
      setUserRole(u.role || USER_ROLE_OPTIONS[0]?.value || 'service_staff');
      setUserStatus(u.status || (u.isActive ? 'active' : 'pending'));
    } else {
      // Creating new user (u is null, or u._isNew with pre-selected role)
      setIsEditingUser(false);
      setEditingUserId(null);
      setUserName(''); setUserEmail(''); setUserPassword('');
      setUserRole(u?.role || USER_ROLE_OPTIONS[0]?.value || 'service_staff');
      setUserStatus('active');
    }
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    try {
      if (!userName || !userEmail) { toast.error('Please fill in all required fields'); return; }
      if (!isEditingUser && !userPassword) { toast.error('Password is required for new staff'); return; }
      if (isEditingUser && editingUserId) {
        console.log('[HR] Updating user:', editingUserId, { name: userName, role: userRole, status: userStatus });
        await UserService.updateUser(editingUserId, { name: userName, role: userRole, status: userStatus, isActive: userStatus === 'active' });
        toast.success('Staff member updated successfully');
      } else {
        const payload = { name: userName, email: userEmail, role: userRole, password: userPassword, status: userStatus, isActive: userStatus === 'active' };
        console.log('[HR] Creating staff:', payload);
        const result = await UserService.createUser(payload);
        console.log('[HR] Create result:', result);
        toast.success('New staff member created successfully!');
      }
      setShowUserModal(false);
      setUserPassword('');
      pollUsers(); loadData();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to save user';
      console.error('[HR] Save user error:', e?.response?.data || e);
      toast.error(msg);
    }
  };

  const handleArchiveUser = async (id: string, name: string) => {
    if (id === currentUserId) { toast.error('You cannot archive your own account'); return; }
    if (!window.confirm(`Suspend ${name}?`)) return;
    try {
      await UserService.archiveUser(id);
      toast.success('User suspended');
      pollUsers(); loadData();
    } catch { toast.error('Failed to suspend user'); }
  };

  const handleActivateUser = async (id: string) => {
    try {
      await UserService.activateUser(id);
      toast.success('User activated');
      pollUsers(); loadData();
    } catch { toast.error('Failed to activate user'); }
  };

  const childProps = {
    localUsers, setLocalUsers, activityLogs,
    searchTerm, setSearchTerm, roleFilter, setRoleFilter, statusFilter, setStatusFilter,
    handleEditUser, handleArchiveUser, handleActivateUser,
    user: { role: currentUserRole, _id: currentUserId },
    currentUserRole,
    onNavigate: (tab: HRTab) => setActiveTab(tab),
  };

  const currentUser = localUsers.find(u => u.id === currentUserId || u._id === currentUserId);
  const displayName = currentUser?.name || 'Admin';
  const displayRole = currentUserRole ? (currentUserRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())) : 'HR Manager';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleLogout = async () => {
    try { await logout(); navigate('/login'); } catch { toast.error('Failed to sign out'); }
  };

  const handleMarkNotifRead = async (id: string) => {
    await NotificationService.markAsRead(id);
    setNotifications(prev => prev.map(n => (n.id === id || n._id === id) ? { ...n, isRead: true } : n));
  };

  const handleMarkAllRead = async () => {
    await NotificationService.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const renderPage = () => {
    const pages: Record<HRTab, React.ReactNode> = {
      overview: <HRDashboardOverview {...childProps} />,
      staff: <HRStaffList {...childProps} />,
      roles: <HRRoleAssignment {...childProps} />,
      activity: <HRStaffActivity {...childProps} />,
      access: <HRRoleAccessControl {...childProps} />,
    };
    return pages[activeTab];
  };

  return (
    <div className="flex h-full w-full" style={{ fontFamily: "'DM Sans', 'Inter', sans-serif", background: '#f1f5f9' }}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className="flex flex-col bg-white border-r shrink-0 transition-all duration-300"
        style={{
          width: sidebarCollapsed ? 64 : 240,
          borderColor: '#e2e8f0',
          minHeight: '100%',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center border-b"
          style={{
            height: 64,
            padding: sidebarCollapsed ? '0 12px' : '0 16px',
            borderColor: '#e2e8f0',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: 10,
          }}
        >
          {/* Logo mark */}
          <div className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 8, background: '#2563EB' }}>
            <ShieldCheck style={{ width: 18, height: 18, color: '#fff' }} />
          </div>
          {!sidebarCollapsed && (
            <span style={{ fontWeight: 600, fontSize: 15, color: '#0f172a', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
              HRDashboard
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4" style={{ padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {!sidebarCollapsed && (
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', padding: '4px 8px 8px' }}>
              Workforce
            </p>
          )}
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                style={{
                  display: 'flex', alignItems: 'center',
                  gap: sidebarCollapsed ? 0 : 10,
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13.5,
                  fontWeight: active ? 600 : 500,
                  transition: 'background 0.15s, color 0.15s',
                  background: active ? '#eff6ff' : 'transparent',
                  color: active ? '#2563EB' : '#64748b',
                  width: '100%',
                  textAlign: 'left',
                  boxShadow: active && !sidebarCollapsed ? 'inset 3px 0 0 #2563EB' : 'none',
                  paddingLeft: active && !sidebarCollapsed ? 14 : 12,
                }}
                onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.color = '#0f172a'; } }}
                onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#64748b'; } }}
              >
                <Icon style={{ width: 18, height: 18, color: active ? '#2563EB' : '#94a3b8', flexShrink: 0, transition: 'color 0.15s' }} />
                {!sidebarCollapsed && <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>}
              </button>
            );
          })}

          {/* Divider */}
          <div style={{ margin: '12px 4px', borderTop: '1px solid #e2e8f0' }} />

          {!sidebarCollapsed && (
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', padding: '4px 8px 8px' }}>
              Analytics
            </p>
          )}
          {/* Reports */}
          <button
            onClick={() => { setActiveTab('activity'); }}
            style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, background: 'transparent', color: '#64748b', width: '100%', textAlign: 'left', transition: 'background 0.15s, color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.color = '#0f172a'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
          >
            <FileText style={{ width: 18, height: 18, color: '#94a3b8', flexShrink: 0 }} />
            {!sidebarCollapsed && <span>Reports</span>}
          </button>

          {/* Notifications */}
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button
              onClick={() => setShowNotifPanel(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, background: showNotifPanel ? '#eff6ff' : 'transparent', color: showNotifPanel ? '#2563eb' : '#64748b', width: '100%', textAlign: 'left', transition: 'background 0.15s, color 0.15s' }}
              onMouseEnter={e => { if (!showNotifPanel) { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.color = '#0f172a'; } }}
              onMouseLeave={e => { if (!showNotifPanel) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#64748b'; } }}
            >
              <Bell style={{ width: 18, height: 18, color: showNotifPanel ? '#2563eb' : '#94a3b8', flexShrink: 0 }} />
              {!sidebarCollapsed && <span>Notifications</span>}
              {unreadCount > 0 && !sidebarCollapsed && (
                <span style={{ marginLeft: 'auto', background: '#eff6ff', color: '#2563EB', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 999 }}>
                  {unreadCount}
                </span>
              )}
              {unreadCount > 0 && sidebarCollapsed && (
                <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: '#2563eb' }} />
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifPanel && (
              <div style={{ position: 'absolute', bottom: '100%', left: sidebarCollapsed ? 68 : 0, width: 320, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 200, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Notifications</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {unreadCount > 0 && <button onClick={handleMarkAllRead} style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Mark all read</button>}
                    <button onClick={() => setShowNotifPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X style={{ width: 14, height: 14 }} /></button>
                  </div>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No notifications yet</div>
                  ) : notifications.slice(0, 10).map(n => {
                    const nid = n.id || n._id || '';
                    return (
                      <div key={nid} onClick={() => handleMarkNotifRead(nid)} style={{ display: 'flex', gap: 10, padding: '10px 16px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', background: n.isRead ? '#fff' : '#eff6ff', transition: 'background 0.1s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = n.isRead ? '#f8fafc' : '#dbeafe'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.isRead ? '#fff' : '#eff6ff'; }}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: n.isRead ? 'transparent' : '#2563eb', flexShrink: 0, marginTop: 5 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 12.5, fontWeight: n.isRead ? 400 : 600, color: '#0f172a', margin: 0 }}>{n.title}</p>
                          <p style={{ fontSize: 11.5, color: '#64748b', margin: '2px 0 0' }}>{n.message}</p>
                          <p style={{ fontSize: 10.5, color: '#94a3b8', margin: '3px 0 0' }}>{new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        {!n.isRead && <Check style={{ width: 12, height: 12, color: '#2563eb', flexShrink: 0, marginTop: 4 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </nav>

        {/* ── Utility items (Help only for HR — no Settings access) ─── */}
        <div style={{ padding: '6px 8px', borderTop: '1px solid #f1f5f9' }}>
          {/* Settings — hidden for HR role per role definition */}
          {!isHRRole && (
            <button
              onClick={() => toast.info('Settings coming soon — configure system preferences here.')}
              style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, background: 'transparent', color: '#64748b', width: '100%', textAlign: 'left', transition: 'background 0.15s, color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.color = '#0f172a'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
            >
              <Settings style={{ width: 18, height: 18, color: '#94a3b8', flexShrink: 0 }} />
              {!sidebarCollapsed && <span>Settings</span>}
            </button>
          )}
          <button
            onClick={() => toast.info('Need help? Contact your system administrator or visit the docs.')}
            style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 10, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, background: 'transparent', color: '#64748b', width: '100%', textAlign: 'left', transition: 'background 0.15s, color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.color = '#0f172a'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
          >
            <HelpCircle style={{ width: 18, height: 18, color: '#94a3b8', flexShrink: 0 }} />
            {!sidebarCollapsed && <span>Help &amp; Support</span>}
          </button>
        </div>

        {/* User profile + collapse */}
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2563EB' }}>{initials}</span>
            </div>
            {!sidebarCollapsed && (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</p>
                  <p style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayRole}</p>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', color: '#94a3b8', transition: 'color 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#dc2626'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
                >
                  <LogOut style={{ width: 15, height: 15 }} />
                </button>
              </>
            )}
          </div>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: 12, color: '#94a3b8', background: 'transparent',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc'; (e.currentTarget as HTMLElement).style.color = '#0f172a'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#94a3b8'; }}
          >
            {sidebarCollapsed
              ? <ChevronRight style={{ width: 16, height: 16 }} />
              : <><ChevronLeft style={{ width: 16, height: 16 }} /><span>Collapse</span></>
            }
          </button>
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ background: '#f1f5f9' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Add/Edit User Modal ───────────────────────────────────── */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="sm:max-w-[440px]" style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
          <DialogHeader style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
            <DialogTitle style={{ fontSize: 17, fontWeight: 600, color: '#0f172a' }}>
              {isEditingUser ? 'Edit Staff Member' : 'Add New Staff'}
            </DialogTitle>
            {!isEditingUser && <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Fill in the details to create a new staff account.</p>}
          </DialogHeader>
          <div style={{ display: 'grid', gap: 16, padding: '20px 0 8px' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <Label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Full Name</Label>
              <input
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="e.g. Maria Santos"
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <Label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Email Address</Label>
              <input
                type="email"
                value={userEmail}
                onChange={e => setUserEmail(e.target.value)}
                disabled={isEditingUser}
                placeholder="e.g. maria@company.com"
                style={{ ...inputStyle, opacity: isEditingUser ? 0.5 : 1 }}
              />
            </div>
            {!isEditingUser && (
              <div style={{ display: 'grid', gap: 6 }}>
                <Label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Password</Label>
                <input
                  type="password"
                  value={userPassword}
                  onChange={e => setUserPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  style={inputStyle}
                />
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Staff will be asked to change this on first login.</p>
              </div>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              <Label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Assign Role</Label>
              <select value={userRole} onChange={e => setUserRole(e.target.value)} style={inputStyle}>
                {USER_ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <Label style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Status</Label>
              <select value={userStatus} onChange={e => setUserStatus(e.target.value)} style={inputStyle}>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid #e2e8f0', marginTop: 8 }}>
            <button onClick={() => setShowUserModal(false)} style={btnSecondaryStyle}>Cancel</button>
            <button onClick={handleSaveUser} style={btnPrimaryStyle}>
              {isEditingUser ? 'Save Changes' : 'Create Staff'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Shared primitive styles ───────────────────────────────────────
export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #d1d5db', fontSize: 14, background: '#fff',
  color: '#111827', outline: 'none',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

export const btnPrimaryStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontSize: 14, fontWeight: 500, background: '#2563EB', color: '#fff',
  transition: 'background 0.15s, transform 0.1s',
};

export const btnSecondaryStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 8,
  border: '1px solid #d1d5db', cursor: 'pointer',
  fontSize: 14, fontWeight: 500, background: '#fff', color: '#374151',
  transition: 'background 0.15s',
};
