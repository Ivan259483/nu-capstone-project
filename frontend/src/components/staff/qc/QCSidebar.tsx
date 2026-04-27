import React, { useEffect, useRef } from 'react';
import { LayoutDashboard, ClipboardList, ImageIcon, ScanSearch, MessageSquare, BarChart3, ChevronLeft, ChevronRight, Settings, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type QCView = 'dashboard' | 'jobs' | 'job-detail' | 'before-after' | 'ai-detection' | 'customer-notes' | 'reports';

type NavItem = { id: QCView; label: string; icon: React.ElementType; badgeKey?: 'pending' | 'ai' };
const navGroups: { groupLabel: string; items: NavItem[] }[] = [
  { groupLabel: 'OVERVIEW', items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
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
    <aside className={`flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out ${collapsed ? 'w-[68px]' : 'w-[232px]'}`}
      style={{ background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)', borderColor: 'rgba(255,255,255,0.06)' }}>

      {/* Logo */}
      <div className={`flex items-center h-16 border-b px-4 ${collapsed ? 'justify-center' : 'gap-3'}`}
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-lg">
          <ShieldCheck size={15} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-white font-semibold text-[14px] tracking-tight leading-none">QualityCheck</p>
            <p className="text-slate-500 text-[10px] tracking-wide mt-0.5">Inspection Portal</p>
          </div>
        )}
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {navGroups.map((group) => (
          <div key={group.groupLabel}>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-medium tracking-widest text-slate-600 uppercase">{group.groupLabel}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id || (activeView === 'job-detail' && item.id === 'jobs');
                const badgeCount = item.badgeKey === 'pending' ? pendingCount : item.badgeKey === 'ai' ? aiPendingCount : 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`
                      relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium
                      transition-all duration-150 group
                      ${isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}
                      ${collapsed ? 'justify-center' : ''}
                    `}
                  >
                    <Icon size={17} className="flex-shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 text-left truncate leading-none">{item.label}</span>
                    )}
                    {!collapsed && badgeCount > 0 && (
                      <span className={`text-[10px] font-semibold min-w-[18px] text-center px-1.5 py-0.5 rounded-full tabular-nums
                        ${isActive ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        {badgeCount}
                      </span>
                    )}
                    {collapsed && badgeCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-amber-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t px-2 py-3 space-y-0.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <button className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-300 text-sm font-medium transition-all duration-150 ${collapsed ? 'justify-center' : ''}`}>
          <Settings size={17} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
        <button onClick={logout} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-slate-500 hover:bg-rose-950/40 hover:text-rose-400 text-sm font-medium transition-all duration-150 ${collapsed ? 'justify-center' : ''}`}>
          <LogOut size={17} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm">Sign Out</span>}
        </button>
        <button
          onClick={onToggle}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-600 hover:bg-white/5 hover:text-slate-400 text-xs transition-all duration-150 ${collapsed ? 'justify-center' : 'justify-end'}`}
        >
          {collapsed ? <ChevronRight size={15} /> : <><span>Collapse</span><ChevronLeft size={15} /></>}
        </button>
      </div>
    </aside>
  );
}
