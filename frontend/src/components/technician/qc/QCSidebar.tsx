import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  Radio,
  ScanSearch,
  ShieldCheck,
} from 'lucide-react';

type QCView = 'dashboard' | 'jobs' | 'job-detail' | 'ai-detection' | 'live-tracker' | 'pos-queue';
type NavItem = { id: QCView; label: string; icon: React.ElementType; badgeKey?: 'pending' | 'ai'; live?: boolean };

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Main', items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  { label: 'Operations', items: [{ id: 'live-tracker', label: 'Live Tracker', icon: Radio, live: true }, { id: 'pos-queue', label: 'POS Payment Queue', icon: ClipboardList }] },
  {
    label: 'Quality Control',
    items: [
      { id: 'jobs', label: 'Review Desk', icon: ClipboardList, badgeKey: 'pending' },
      { id: 'ai-detection', label: 'AI Detection Review', icon: ScanSearch, badgeKey: 'ai' },
    ],
  },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  activeView: QCView;
  onNavigate: (view: QCView) => void;
  pendingCount?: number;
  aiPendingCount?: number;
}

export default function QCSidebar({
  collapsed,
  onToggle,
  activeView,
  onNavigate,
  pendingCount = 0,
  aiPendingCount = 0,
}: Props) {
  const showLabels = !collapsed;

  return (
    <aside className={`qc-dash-sidebar flex w-[72px] flex-shrink-0 flex-col bg-white transition-[width] duration-200 ${collapsed ? 'md:w-[72px]' : 'md:w-[252px]'}`}>
      <div className={`qc-dash-sidebar-header flex h-[72px] items-center px-4 ${showLabels ? 'md:gap-3' : 'justify-center'}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-600 text-white shadow-[0_8px_18px_-10px_rgba(37,99,235,0.8)]">
          <ShieldCheck size={18} strokeWidth={2.2} />
        </div>
        {showLabels && (
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-[16px] font-semibold tracking-[-0.025em] text-slate-950">QualityCheck</p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-400">Quality control</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-5" aria-label="Quality Checker navigation">
        {navGroups.map((group) => (
          <div key={group.label}>
            {showLabels && <p className="mb-2 hidden px-3 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 md:block">{group.label}</p>}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id || (activeView === 'job-detail' && item.id === 'jobs');
                const badge = item.badgeKey === 'pending' ? pendingCount : item.badgeKey === 'ai' ? aiPendingCount : 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    title={!showLabels ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    className={`qc-command-nav-item group relative flex min-h-11 w-full items-center justify-center rounded-xl px-3 text-[12px] font-semibold transition md:justify-start ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                  >
                    <Icon size={17} strokeWidth={1.9} className={`shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                    {showLabels && <span className="ml-3 hidden flex-1 truncate text-left md:block">{item.label}</span>}
                    {item.live && (
                      <span className={`${showLabels ? 'hidden md:flex' : 'absolute right-1.5 top-1.5 flex'} items-center`}>
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                    )}
                    {!item.live && badge > 0 && (
                      <>
                        {showLabels && <span className="hidden min-w-5 rounded-full bg-white px-1.5 py-0.5 text-center text-[10px] font-bold text-blue-700 md:inline-block">{badge}</span>}
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 md:hidden" />
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="qc-dash-sidebar-footer mt-auto px-2.5 pb-2.5 pt-6">
        {showLabels && (
          <div className="qc-command-system-status mb-2 hidden rounded-[18px] bg-white p-3 md:block">
            <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" />System Status</div>
            <p className="mt-2 text-xs font-semibold text-slate-900">All Systems Operational</p>
            <p className="mt-1 text-[10px] font-medium text-emerald-600">Live and up-to-date</p>
          </div>
        )}
        <button type="button" onClick={onToggle} className="hidden min-h-9 w-full items-center justify-center gap-2 rounded-lg text-[11px] font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 md:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight size={15} /> : <><span>Collapse</span><ChevronLeft size={15} /></>}
        </button>
      </div>
    </aside>
  );
}
