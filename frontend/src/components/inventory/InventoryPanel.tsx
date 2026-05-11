import React, { useState, useEffect, useCallback } from 'react';
import './inventory.css';
import type { LucideIcon } from 'lucide-react';
import {
  Package, Truck, ChevronLeft, ChevronRight,
  LogOut, Droplets, Activity, Mic, Bell, X,
} from 'lucide-react';
import { InventoryProvider, useInventory } from './InventoryContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { NotificationService } from '@/lib/notification-service';

// Items page
import InventoryItemsContent from './items/InventoryItemsContent';

// Supplier page
import SupplierManagementContent from './suppliers/SupplierManagementContent';

// ═══════════════════════════════════════════════════════════════════════
// Navigation Config
// ═══════════════════════════════════════════════════════════════════════

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  section: string;
  disabled?: boolean;
  /** Right pill like customer sidebar (e.g. AI Inspection History → Soon) */
  soon?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { id: 'items', label: 'Inventory Items', icon: Package, section: 'Main Menu' },
  { id: 'suppliers', label: 'Supplier Management', icon: Truck, section: 'Main Menu' },
  { id: 'stock-monitor', label: 'Stock Monitor', icon: Activity, section: 'Operations' },
  { id: 'voice-log', label: 'Voice Log', icon: Mic, section: 'Operations', disabled: true, soon: true },
];

// ═══════════════════════════════════════════════════════════════════════
// Sub-Pages
// ═══════════════════════════════════════════════════════════════════════

function StockMonitorPage() {
  const { items } = useInventory();
  const lowStock = items.filter(i => i.status === 'low-stock' || i.status === 'critical' || i.status === 'out-of-stock');
  const inStock = items.filter(i => i.status === 'in-stock');

  return (
    <div className="page-enter space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stock Monitor</h1>
        <p className="text-sm text-gray-500 mt-1">Track stock levels and alerts in real-time</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Items', value: items.length, color: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
          { label: 'In Stock', value: inStock.length, color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
          { label: 'Low/Critical', value: lowStock.length, color: '#ea580c', bg: 'rgba(234,88,12,0.08)' },
          { label: 'Out of Stock', value: items.filter(i => i.status === 'out-of-stock').length, color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
        ].map((stat, idx) => (
          <div key={stat.label} className="glass-card glass-card-hover rounded-2xl p-5 card-enter" style={{ animationDelay: `${idx * 60}ms` }}>
            <div className="text-2xl font-extrabold font-tabular" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-xs font-semibold text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Alert Items Table */}
      {lowStock.length > 0 ? (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800">⚠️ Items Needing Attention</h3>
            <p className="text-xs text-gray-400 mt-0.5">{lowStock.length} item{lowStock.length !== 1 ? 's' : ''} below safe stock level</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead><tr className="border-b border-gray-100 bg-gray-50/60">
                {['Item', 'SKU', 'Category', 'Current Qty', 'Min Stock', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {lowStock.map((item, idx) => (
                  <tr key={item.id} className={`border-b border-gray-50 last:border-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'}`}>
                    <td className="px-4 py-3"><span className="text-sm font-semibold text-gray-800">{item.name}</span></td>
                    <td className="px-4 py-3"><span className="text-xs text-gray-400 font-mono">{item.sku}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-medium text-gray-600">{item.category}</span></td>
                    <td className="px-4 py-3"><span className="text-sm font-bold text-gray-800 font-tabular">{item.quantity}</span></td>
                    <td className="px-4 py-3"><span className="text-sm text-gray-500 font-tabular">{item.minStock}</span></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        item.status === 'out-of-stock' ? 'status-out-of-stock' :
                        item.status === 'critical' ? 'status-critical' : 'status-low-stock'
                      }`}>
                        {item.status === 'out-of-stock' ? 'Out of Stock' : item.status === 'critical' ? 'Critical' : 'Low Stock'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4"><Activity size={24} className="text-emerald-500" /></div>
          <p className="text-base font-bold text-gray-600">All Stock Levels Healthy</p>
          <p className="text-sm text-gray-400 mt-1">No items require attention right now.</p>
        </div>
      )}
    </div>
  );
}

function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await NotificationService.getNotifications();
      if (res?.success) setNotifications(res.data || []);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    try {
      await NotificationService.markAsRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    } catch { /* silent */ }
  };

  const unread = notifications.filter(n => !n.isRead);
  const read = notifications.filter(n => n.isRead);

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">{unread.length} unread notification{unread.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {loading ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400 mt-3">Loading notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4"><Bell size={24} className="text-blue-400" /></div>
          <p className="text-base font-bold text-gray-600">No Notifications</p>
          <p className="text-sm text-gray-400 mt-1">You're all caught up!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {unread.length > 0 && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">Unread</p>}
          {unread.map((notif, idx) => (
            <div key={notif._id} className="glass-card glass-card-hover rounded-xl p-4 border-l-4 border-l-blue-500 card-enter" style={{ animationDelay: `${idx * 40}ms` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{notif.title || notif.message}</p>
                  {notif.body && <p className="text-xs text-gray-400 mt-1">{notif.body}</p>}
                  <p className="text-[10px] text-gray-300 mt-1.5">{new Date(notif.createdAt).toLocaleString()}</p>
                </div>
                <button onClick={() => markAsRead(notif._id)} className="text-xs text-blue-600 font-semibold hover:underline flex-shrink-0">Mark read</button>
              </div>
            </div>
          ))}
          {read.length > 0 && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 mt-4">Read</p>}
          {read.slice(0, 20).map((notif, idx) => (
            <div key={notif._id} className="glass-card rounded-xl p-4 opacity-60 card-enter" style={{ animationDelay: `${(unread.length + idx) * 30}ms` }}>
              <p className="text-sm text-gray-600">{notif.title || notif.message}</p>
              {notif.body && <p className="text-xs text-gray-400 mt-1">{notif.body}</p>}
              <p className="text-[10px] text-gray-300 mt-1.5">{new Date(notif.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Main Panel (Inner)
// ═══════════════════════════════════════════════════════════════════════

function InventoryPanelInner({ embedded = false }: { embedded?: boolean }) {
  const [activePage, setActivePage] = useState('items');
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifCount, setNotifCount] = useState(0);

  // Fetch unread notification count once on mount
  useEffect(() => {
    NotificationService.getNotifications()
      .then(res => {
        if (res?.success) setNotifCount((res.data || []).filter((n: any) => !n.isRead).length);
      })
      .catch(() => {});
  }, []); // intentionally run once — bell count refreshes when user visits Notifications page

  // Voice Log disabled / removed routes — avoid blank screen if old tab id persisted
  useEffect(() => {
    setActivePage(p => (p === 'voice-log' || p === 'location' ? 'items' : p));
  }, []);

  const handleLogout = () => { logout(); navigate('/'); };
  const sidebarW = collapsed ? 64 : 256;
  const initials = user?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'IP';

  // Build nav sections
  const sections = NAV_ITEMS.reduce<Record<string, typeof NAV_ITEMS>>((acc, item) => {
    const sec = item.section;
    if (!acc[sec]) acc[sec] = [];
    acc[sec].push(item);
    return acc;
  }, {});

  const mainInnerStyle: React.CSSProperties = embedded
    ? { maxWidth: 1560, margin: '0 auto', padding: 0 }
    : { maxWidth: 1400, margin: '0 auto', padding: '32px 24px' };

  const mainSurfaceStyle: React.CSSProperties = embedded
    ? { flex: 1, minHeight: 0, overflow: 'auto', background: 'transparent' }
    : { flex: 1, minHeight: '100vh', overflow: 'auto', background: '#f8fafc' };

  const pageBody = (
    <>
      {activePage === 'items' && <InventoryItemsContent embedded={embedded} />}
      {activePage === 'suppliers' && <SupplierManagementContent />}
      {activePage === 'stock-monitor' && <StockMonitorPage />}
      {activePage === 'notifications' && <NotificationsPage />}
    </>
  );

  return (
    <div className={`inv-root ${embedded ? 'inv-root--embedded' : ''}`}>
      {/* ── Sidebar (standalone route only) ── */}
      {!embedded && (
      <aside className="inv-sidebar" style={{ width: sidebarW }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', height: 64, padding: '0 12px', borderBottom: '1px solid rgba(37,99,235,0.08)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
              <Droplets size={18} color="#fff" />
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 15, display: 'block', whiteSpace: 'nowrap' }}>DetailStock</span>
                <span style={{ fontSize: 10, color: '#2563eb', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Inventory</span>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {Object.entries(sections).map(([sectionName, sectionItems]) => (
            <React.Fragment key={sectionName}>
              {!collapsed && <p style={{ padding: '12px 12px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{sectionName}</p>}
              {sectionItems.map(item => {
                const Icon = item.icon;
                const disabled = Boolean(item.disabled);
                const isActive = activePage === item.id && !disabled;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`inv-nav-item ${isActive ? 'active' : ''} ${disabled ? 'inv-nav-item--disabled' : ''}`}
                    disabled={disabled}
                    onClick={() => { if (!disabled) setActivePage(item.id); }}
                    title={disabled ? `${item.label} · Coming soon` : collapsed ? item.label : undefined}
                    style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
                  >
                    <Icon size={18} className={`shrink-0 ${disabled ? 'opacity-70' : ''}`} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 min-w-0 text-left leading-snug overflow-hidden text-ellipsis whitespace-nowrap">{item.label}</span>
                        {item.soon && (
                          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">
                            Soon
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}

          {/* Notifications nav item with badge */}
          {!collapsed && <p style={{ padding: '12px 12px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Alerts</p>}
          <button
            className={`inv-nav-item ${activePage === 'notifications' ? 'active' : ''}`}
            onClick={() => {
              setActivePage('notifications');
              // Refresh bell count when user opens notifications page
              NotificationService.getNotifications()
                .then(res => { if (res?.success) setNotifCount((res.data || []).filter((n: any) => !n.isRead).length); })
                .catch(() => {});
            }}
            title={collapsed ? 'Notifications' : undefined}
            style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : undefined}
          >
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Bell size={18} />
              {notifCount > 0 && <span style={{ position: 'absolute', top: -3, right: -5, width: 14, height: 14, background: '#ef4444', borderRadius: '50%', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#fff', fontWeight: 700 }}>{notifCount > 9 ? '9+' : notifCount}</span>}
            </div>
            {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Notifications</span>}
          </button>
        </nav>

        {/* Bottom — User + Logout */}
        <div style={{ borderTop: '1px solid rgba(37,99,235,0.08)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* User card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderRadius: 8, background: '#f8fafc', border: '1px solid #f1f5f9', overflow: 'hidden', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{user?.name || 'Inventory User'}</p>
                <p style={{ fontSize: 10, color: '#2563eb', margin: 0, fontWeight: 600 }}>Inventory Personnel</p>
              </div>
            )}
          </div>

          {/* Logout */}
          <button className="inv-nav-item" onClick={handleLogout} style={collapsed ? { justifyContent: 'center', padding: '10px 0' } : { color: '#dc2626' }}>
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {!collapsed && <span style={{ fontSize: 14 }}>Log Out</span>}
          </button>

          {/* Collapse toggle */}
          <button onClick={() => setCollapsed(c => !c)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '8px 12px', fontSize: 12, color: '#64748b', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
          </button>
        </div>
      </aside>
      )}

      {/* ── Main Content ── */}
      <main style={mainSurfaceStyle}>
        <div style={mainInnerStyle}>
          {pageBody}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Exported wrapper — provides InventoryContext
// ═══════════════════════════════════════════════════════════════════════

export default function InventoryPanel({ embedded }: { embedded?: boolean }) {
  return (
    <InventoryProvider>
      <InventoryPanelInner embedded={embedded} />
    </InventoryProvider>
  );
}
