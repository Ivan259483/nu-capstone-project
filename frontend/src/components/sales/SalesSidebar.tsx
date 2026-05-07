import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, ShoppingCart, Receipt, Users, BarChart3,
  Settings, ChevronLeft, ChevronRight, LogOut, CheckSquare, CalendarDays,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type SalesView = 'dashboard' | 'pos' | 'transactions' | 'customers' | 'reports' | 'settings' | 'approvals' | 'calendar';

interface Props {
  activeView: SalesView;
  onNavigate: (v: SalesView) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_MAIN = [
  { key: 'dashboard' as SalesView, label: 'Dashboard', icon: LayoutDashboard },
  { key: 'pos' as SalesView, label: 'POS', icon: ShoppingCart, badge: 'NEW' },
  { key: 'transactions' as SalesView, label: 'Transactions', icon: Receipt },
  { key: 'approvals' as SalesView, label: 'Booking Approvals', icon: CheckSquare, badgeKey: 'approvals' },
  { key: 'calendar' as SalesView, label: 'Smart Calendar', icon: CalendarDays },
];

const NAV_MGMT = [
  { key: 'customers' as SalesView, label: 'Customers', icon: Users },
  { key: 'reports' as SalesView, label: 'Sales Reports', icon: BarChart3 },
  { key: 'settings' as SalesView, label: 'Settings', icon: Settings },
];

export default function SalesSidebar({ activeView, onNavigate, collapsed, onToggle }: Props) {
  const { logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const { OrderService } = await import('@/lib/order-service');
        const res = await OrderService.getAllOrders({ suppressErrorToast: true });
        if (res.success && Array.isArray(res.data)) {
          setPendingCount(res.data.filter((o: any) => o.status === 'pending_confirmation').length);
        }
      } catch { /* silent */ }
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const linkBase = 'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer';
  const linkIdle = `${linkBase} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
  const linkActive = `${linkBase} font-semibold bg-blue-50 text-blue-700`;

  return (
    <aside
      className={`relative flex flex-col bg-white transition-all duration-300 ease-in-out shrink-0 ${collapsed ? 'w-16' : 'w-60'}`}
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
              {!collapsed && item.badge && (
                <span className="text-[10px] font-bold bg-blue-700 text-white px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
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

      {/* Bottom */}
      <div className="px-2 py-3 space-y-1" style={{ borderTop: '1px solid #f0f2f7' }}>

        <button
          onClick={logout}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 transition-all duration-150 cursor-pointer ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-4 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-white hover:bg-slate-50 transition-colors duration-150"
        style={{ border: '1px solid #eef0f6', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
