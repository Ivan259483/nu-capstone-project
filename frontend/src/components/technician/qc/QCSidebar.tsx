import React from 'react';
import { LayoutDashboard, ClipboardList, ImageIcon, ScanSearch, MessageSquare, BarChart3, ChevronLeft, ChevronRight, Settings, LogOut, ShieldCheck, Radio } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type QCView = 'dashboard' | 'jobs' | 'job-detail' | 'before-after' | 'ai-detection' | 'customer-notes' | 'reports' | 'live-tracker';

type NavItem = { id: QCView; label: string; icon: React.ElementType; badgeKey?: 'pending' | 'ai'; live?: boolean };
const navGroups: { groupLabel: string; items: NavItem[] }[] = [
  { groupLabel: 'OVERVIEW', items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    groupLabel: 'SERVICE CONTROL',
    items: [
      { id: 'live-tracker', label: 'Live Tracker', icon: Radio, live: true },
    ],
  },
  {
    groupLabel: 'QUALITY CONTROL',
    items: [
      { id: 'jobs', label: 'Jobs for Review', icon: ClipboardList, badgeKey: 'pending' },
      { id: 'before-after', label: 'Before & After', icon: ImageIcon },
      { id: 'ai-detection', label: 'AI Detection Review', icon: ScanSearch, badgeKey: 'ai' },
    ],
  },
  { groupLabel: 'COMMUNICATION', items: [{ id: 'customer-notes', label: 'Customer Notes', icon: MessageSquare }] },
  { groupLabel: 'ANALYTICS', items: [{ id: 'reports', label: 'Reports', icon: BarChart3 }] },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  activeView: QCView;
  onNavigate: (v: QCView) => void;
  pendingCount?: number;
  aiPendingCount?: number;
}

export default function QCSidebar({ collapsed, onToggle, activeView, onNavigate, pendingCount = 0, aiPendingCount = 0 }: Props) {
  const { logout } = useAuth();
  return (
    <aside
      className={`flex flex-shrink-0 flex-col bg-white shadow-[10px_0_36px_-14px_rgba(15,23,42,0.11)] transition-all duration-300 ease-in-out ${collapsed ? 'w-[68px]' : 'w-[232px]'}`}
    >
      {/* Logo — flush white into nav; no shadow line above OVERVIEW */}
      <div className={`flex h-16 items-center bg-white px-4 ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-md">
          <ShieldCheck size={15} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-[14px] font-semibold leading-none tracking-tight text-slate-900">QualityCheck</p>
            <p className="mt-0.5 text-[10px] tracking-wide text-slate-500">Inspection Portal</p>
          </div>
        )}
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 space-y-6 overflow-y-auto px-2 py-4">
        {navGroups.map((group) => (
          <div key={group.groupLabel}>
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-medium uppercase tracking-widest text-slate-400">{group.groupLabel}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id || (activeView === 'job-detail' && item.id === 'jobs');
                const badgeCount = item.badgeKey === 'pending' ? pendingCount : item.badgeKey === 'ai' ? aiPendingCount : 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`
                      group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium
                      transition-all duration-150
                      ${isActive
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    <Icon size={17} className="flex-shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 truncate text-left leading-none">{item.label}</span>
                    )}
                    {/* Live pulse — green dot only; row uses blue when active */}
                    {item.live && !collapsed && (
                      <span className="flex items-center gap-1">
                        <span className="relative flex h-2 w-2">
                          <span
                            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isActive ? 'bg-white' : 'bg-emerald-400'}`}
                          />
                          <span className={`relative inline-flex h-2 w-2 rounded-full ${isActive ? 'bg-white' : 'bg-emerald-500'}`} />
                        </span>
                      </span>
                    )}
                    {item.live && collapsed && (
                      <span className="absolute right-1.5 top-1.5 h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    )}
                    {!collapsed && !item.live && badgeCount > 0 && (
                      <span
                        className={`min-w-[18px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums ${
                          isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                    {collapsed && !item.live && badgeCount > 0 && (
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="space-y-0.5 bg-slate-50/45 px-2 py-3 shadow-[0_-10px_28px_-14px_rgba(15,23,42,0.06)]">
        <button
          type="button"
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-slate-800 ${collapsed ? 'justify-center' : ''}`}
        >
          <Settings size={17} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
        <button
          type="button"
          onClick={logout}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition-all duration-150 hover:bg-rose-50 hover:text-rose-600 ${collapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={17} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm">Sign Out</span>}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-slate-700 ${collapsed ? 'justify-center' : 'justify-end'}`}
        >
          {collapsed ? <ChevronRight size={15} /> : (
            <>
              <span>Collapse</span>
              <ChevronLeft size={15} />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
