import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, ShoppingCart, Receipt, Users, BarChart3,
  Settings, ChevronLeft, LogOut, CheckSquare, CalendarDays,
  MessagesSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getSharedSocket } from '@/hooks/useRealtimeSync';

type SalesView = 'dashboard' | 'concierge-inbox' | 'pos' | 'transactions' | 'customers' | 'reports' | 'settings' | 'approvals' | 'calendar';

interface Props {
  activeView: SalesView;
  onNavigate: (v: SalesView) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_MAIN = [
  { key: 'dashboard' as SalesView, label: 'Dashboard', icon: LayoutDashboard },
  { key: 'concierge-inbox' as SalesView, label: 'Concierge Inbox', icon: MessagesSquare },
  { key: 'pos' as SalesView, label: 'POS', icon: ShoppingCart },
  { key: 'transactions' as SalesView, label: 'Transactions', icon: Receipt },
  { key: 'approvals' as SalesView, label: 'Booking Approvals', icon: CheckSquare, badgeKey: 'approvals' },
  { key: 'calendar' as SalesView, label: 'Appointment', icon: CalendarDays },
];

const NAV_MGMT = [
  { key: 'customers' as SalesView, label: 'Customers', icon: Users },
  { key: 'reports' as SalesView, label: 'Sales Reports', icon: BarChart3 },
  { key: 'settings' as SalesView, label: 'Settings', icon: Settings },
];

export default function SalesSidebar({ activeView, onNavigate, collapsed, onToggle }: Props) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const { OrderService } = await import('@/lib/order-service');
        const res = await OrderService.getAllOrders({
          suppressErrorToast: true,
          status: 'pending_confirmation',
          limit: 1,
          includeTotal: true,
        });
        if (res.success) {
          setPendingCount(Number(res.pagination?.total ?? (Array.isArray(res.data) ? res.data.length : 0)));
        }
      } catch { /* silent */ }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);

    const socket = getSharedSocket();
    const onQueueChange = () => {
      void fetchCount();
    };
    socket.on('booking:approval-updated', onQueueChange);
    socket.on('notification:booking-manager', onQueueChange);

    return () => {
      clearInterval(interval);
      socket.off('booking:approval-updated', onQueueChange);
      socket.off('notification:booking-manager', onQueueChange);
    };
  }, []);

  const linkBase = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer';
  const linkIdle = `${linkBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
  const linkActive = `${linkBase} font-semibold bg-blue-50 text-blue-700`;

  return (
    <aside
      className={`customer-sidebar flex flex-col bg-white transition-all duration-300 ease-in-out shrink-0 ${collapsed ? 'w-16 is-collapsed' : 'w-60 is-expanded'}`}
      style={{
        minHeight: '100vh',
        borderRight: '1px solid rgba(226,232,240,0.5)',
        boxShadow: '2px 0 16px -4px rgba(0,0,0,0.04)',
      }}
    >
      {/* Nav — no brand strip (logo / wordmark removed per product request) */}
      <nav className="flex-1 px-2 pt-3 pb-4 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
            Main Menu
          </p>
        )}

        {NAV_MAIN.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`w-full ${isActive ? linkActive : linkIdle} ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
              {!collapsed && (item as any).badgeKey === 'approvals' && pendingCount > 0 && (
                <span className="text-[10px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}

        {!collapsed ? (
          <p className="px-3 pb-2 pt-4 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
            Management
          </p>
        ) : (
          <div className="my-3" style={{ borderTop: '1px solid #f0f2f7' }} />
        )}

        {NAV_MGMT.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`w-full ${isActive ? linkActive : linkIdle} ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer — match Customer / QC: Log Out + Collapse */}
      <div className="customer-sidebar-footer">
        <button
          type="button"
          className={`customer-sidebar-item customer-sidebar-item--danger ${collapsed ? 'justify-center' : ''}`}
          onClick={handleLogout}
          aria-label="Log out"
          title={collapsed ? 'Log out' : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={2} />
          {!collapsed && <span className="customer-sidebar-label">Log Out</span>}
        </button>
        <button
          type="button"
          className="customer-sidebar-collapse-btn"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft
            className={`customer-sidebar-collapse-chevron h-4 w-4 shrink-0 text-slate-500 ${collapsed ? 'rotate-180' : ''}`}
            strokeWidth={2}
          />
          {!collapsed && <span className="customer-sidebar-label font-medium">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
