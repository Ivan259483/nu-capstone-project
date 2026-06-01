import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
    CustomerSidebarAnimatedIcon,
    type CustomerSidebarIconName,
} from '@/components/customer/CustomerSidebarAnimatedIcon';

type TabType = 'dashboard' | 'ai-estimator' | 'bookings' | 'tracking' | 'payments' | 'notifications' | 'settings' | 'book' | 'documents' | 'scan-book';

interface SidebarProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
    className?: string;
}

/** Standalone customer sidebar — styles match CustomerDashboard / Admin Hub (see index.css `.customer-sidebar-*`). */
export const CustomerSidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, className }) => {
    const { user } = useAuth();
    const [collapsed, setCollapsed] = useState(false);

    const navItems: { id: TabType; label: string; icon: CustomerSidebarIconName }[] = [
        { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
        { id: 'ai-estimator', label: 'AI Damage Scan', icon: 'sparkles' },
        { id: 'bookings', label: 'My Bookings', icon: 'bookings' },
        { id: 'tracking', label: 'Live Tracking', icon: 'tracker' },
        { id: 'payments', label: 'Payments', icon: 'payments' },
        { id: 'documents', label: 'Documents & Waivers', icon: 'documents' },
        { id: 'notifications', label: 'Notifications', icon: 'notifications' },
        { id: 'settings', label: 'Settings', icon: 'settings' },
    ];

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
            <div className="customer-sidebar-brand-row flex h-16 shrink-0 items-center border-b border-slate-100 px-3 overflow-hidden">
                <div className="customer-sidebar-user-header min-w-0 flex-1">
                    <div
                        className="customer-sidebar-avatar flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-sm font-bold text-white shadow-sm"
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
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={cn('customer-sidebar-item', isActive && 'is-active')}
                            onClick={() => onTabChange(item.id)}
                            aria-label={item.label}
                            title={collapsed ? item.label : undefined}
                        >
                            <CustomerSidebarAnimatedIcon name={item.icon} />
                            <span className="customer-sidebar-label flex-1 min-w-0 text-left">{item.label}</span>
                        </button>
                    );
                })}
            </nav>

            <div
                className={cn(
                    'customer-sidebar-footer',
                    collapsed && 'customer-sidebar-footer--collapsed'
                )}
            >
                <button
                    type="button"
                    className={cn(
                        'customer-sidebar-collapse-btn',
                        collapsed && 'customer-sidebar-collapse-btn--icon'
                    )}
                    onClick={() => setCollapsed((c) => !c)}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <iconify-icon
                        icon="solar:sidebar-minimalistic-outline"
                        width={collapsed ? '20' : '16'}
                        className={cn(
                            'shrink-0 text-slate-500',
                            collapsed && 'customer-sidebar-collapse-icon--expand'
                        )}
                    ></iconify-icon>
                    {!collapsed && (
                        <span className="customer-sidebar-label font-medium">Collapse</span>
                    )}
                </button>
            </div>
        </aside>
    );
};
