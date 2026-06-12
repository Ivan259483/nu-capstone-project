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

/** Standalone customer sidebar — styles match CustomerDashboard (see index.css `.customer-sidebar-*`). */
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
    const sidebarUsername = email.includes('@')
        ? email.split('@')[0]
        : displayName.toLowerCase().replace(/\s+/g, '') || 'customer';

    return (
        <aside
            className={cn(
                'customer-sidebar hidden lg:flex flex-col h-screen sticky top-0 bg-white rounded-none',
                collapsed ? 'is-collapsed' : 'is-expanded',
                'is-transition-ready',
                className
            )}
        >
            <div className="customer-sidebar-header customer-sidebar-brand-row" title="">
                <div className="customer-sidebar-user-header" title="">
                    <div className="customer-sidebar-avatar" aria-hidden title="">
                        {(sidebarUsername || email || '?').charAt(0).toUpperCase()}
                    </div>
                    {!collapsed && (
                        <span className="customer-sidebar-profile-copy">
                            <span className="customer-sidebar-profile-name">{displayName}</span>
                            <span className="customer-sidebar-profile-email">Private customer garage</span>
                        </span>
                    )}
                </div>
            </div>

            <nav className="customer-sidebar-nav">
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
                            <CustomerSidebarAnimatedIcon name={item.icon} size={18} />
                            <span className="customer-sidebar-label flex-1 text-left">{item.label}</span>
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
                        <span className="customer-sidebar-label text-sm font-normal">Collapse</span>
                    )}
                </button>
            </div>
        </aside>
    );
};
