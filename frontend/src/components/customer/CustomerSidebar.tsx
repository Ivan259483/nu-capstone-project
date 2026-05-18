import React, { useState } from 'react';
import {
    LayoutDashboard,
    Calendar,
    Navigation,
    CreditCard,
    Bell,
    Settings,
    LogOut,
    FileText,
    Sparkles,
    ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

type TabType = 'dashboard' | 'ai-estimator' | 'bookings' | 'tracking' | 'payments' | 'notifications' | 'settings' | 'book' | 'documents' | 'scan-book';

interface SidebarProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
    className?: string;
}

/** Standalone customer sidebar — styles match CustomerDashboard / Admin Hub (see index.css `.customer-sidebar-*`). */
export const CustomerSidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, className }) => {
    const { logout, user } = useAuth();
    const [collapsed, setCollapsed] = useState(false);

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'ai-estimator', label: 'AI Damage Scan', icon: Sparkles },
        { id: 'bookings', label: 'My Bookings', icon: Calendar },
        { id: 'tracking', label: 'Live Tracking', icon: Navigation },
        { id: 'payments', label: 'Payments', icon: CreditCard },
        { id: 'documents', label: 'Documents & Waivers', icon: FileText },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'settings', label: 'Settings', icon: Settings },
    ] as const;

    const displayName = (user?.name || 'Customer').trim() || 'Customer';
    const email = (user?.email || '').trim();

    return (
        <aside
            className={cn(
                'customer-sidebar hidden lg:flex flex-col h-screen sticky top-0 bg-white rounded-none',
                collapsed ? 'is-collapsed' : 'is-expanded',
                'is-transition-ready',
                className
            )}
        >
            <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-3 overflow-hidden">
                <div className="customer-sidebar-user-header min-w-0 flex-1">
                    <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white shadow-sm"
                        style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
                        aria-hidden
                    >
                        {(displayName || email || '?').charAt(0).toUpperCase()}
                    </div>
                    {!collapsed && (
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-bold text-slate-900 leading-tight">{displayName}</div>
                            <div className="truncate text-[11px] text-slate-500 leading-tight">{email || '—'}</div>
                        </div>
                    )}
                </div>
            </div>

            <nav className="customer-sidebar-nav">
                {!collapsed && <p className="customer-sidebar-section-heading">Main Menu</p>}
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={cn('customer-sidebar-item', isActive && 'is-active')}
                            onClick={() => onTabChange(item.id as TabType)}
                        >
                            <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                            <span className="customer-sidebar-label flex-1 min-w-0 text-left">{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div className="customer-sidebar-footer">
                <button
                    type="button"
                    className="customer-sidebar-item customer-sidebar-item--danger"
                    onClick={() => logout()}
                >
                    <LogOut className="h-5 w-5 shrink-0" strokeWidth={2} />
                    {!collapsed && <span className="customer-sidebar-label">Log Out</span>}
                </button>
                <button
                    type="button"
                    className="customer-sidebar-collapse-btn"
                    onClick={() => setCollapsed((c) => !c)}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <ChevronLeft className="h-4 w-4 customer-sidebar-collapse-chevron shrink-0 text-slate-500" strokeWidth={2} />
                    {!collapsed && <span className="customer-sidebar-label font-medium">Collapse</span>}
                </button>
            </div>
        </aside>
    );
};
