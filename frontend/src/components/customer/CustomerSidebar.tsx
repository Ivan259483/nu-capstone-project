import React from 'react';
import {
    LayoutDashboard,
    Calendar,
    Navigation,
    CreditCard,
    Bell,
    Settings,
    LogOut,
    FileText,
    Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

type TabType = 'dashboard' | 'ai-estimator' | 'bookings' | 'tracking' | 'payments' | 'notifications' | 'settings' | 'book' | 'documents' | 'scan-book';

interface SidebarProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
    className?: string;
}

export const CustomerSidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, className }) => {
    const { logout } = useAuth();

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'ai-estimator', label: 'AI Damage Scan', icon: Sparkles },
        { id: 'bookings', label: 'My Bookings', icon: Calendar },
        { id: 'tracking', label: 'Live Tracking', icon: Navigation },
        { id: 'payments', label: 'Payments', icon: CreditCard },
        { id: 'documents', label: 'Documents & Waivers', icon: FileText },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <aside className={cn("hidden lg:flex flex-col w-64 glass border-r h-screen sticky top-0 rounded-none border-white/5", className)}>
            <div className="p-6 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
                        <span className="text-white font-bold text-lg">A</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight">
                        <span className="text-white">Auto</span><span className="text-violet-400">SPF</span><span className="text-white">+</span>
                    </span>
                </div>
                <div className="mt-2 text-xs text-violet-400 opacity-80 uppercase tracking-wider font-medium">
                    Customer Panel
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto w-full">
                {navItems.map((item) => (
                    <Button
                        key={item.id}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start gap-3 h-11 transition-all duration-300 rounded-lg",
                            activeTab === item.id
                                ? item.id === 'ai-estimator'
                                    ? 'bg-indigo-500/15 text-indigo-300 shadow-sm border border-indigo-500/30'
                                    : 'font-medium bg-violet-500/10 text-violet-300 shadow-sm border border-violet-500/20 shadow-violet-500/5'
                                : item.id === 'ai-estimator'
                                    ? 'text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20'
                                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-white/5 border border-transparent hover:border-violet-500/10'
                        )}
                        onClick={() => onTabChange(item.id as TabType)}
                    >
                        <item.icon className={cn(
                            "w-5 h-5",
                            activeTab === item.id
                                ? item.id === 'ai-estimator' ? 'text-indigo-400' : 'text-violet-400'
                                : item.id === 'ai-estimator' ? 'text-indigo-500' : 'text-[var(--text-secondary)] group-hover:text-white'
                        )} />
                        {item.label}
                    </Button>
                ))}
            </nav>

            <div className="p-4 border-t border-white/5">
                <Button
                    variant="ghost"
                    className="w-full justify-start gap-3 text-red-400 hover:text-red-300 hover:bg-red-950/20 rounded-lg transition-colors"
                    onClick={logout}
                >
                    <LogOut className="w-5 h-5" />
                    Sign Out
                </Button>
            </div>
        </aside>
    );
};
